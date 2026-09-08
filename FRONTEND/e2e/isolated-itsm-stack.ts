import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import {
  psql,
  mintE2EJWT,
  resolveJwtSecret,
  databaseExists,
  readCurrentLeaseToken,
  startIsolatedCatalogStack,
  type IsolatedCatalogStack,
} from './isolated-catalog-stack';
import { startIsolatedOrganizationStub, type IsolatedOrganizationStub } from './isolated-organization-stub';

/**
 * E2E contamination remediation, Workstream A, Correction 5 (2026-09-06):
 * the reusable, multi-service isolated ITSM stack — Tickets + Problem +
 * Change, each with its own disposable per-run database, wired to each
 * other and to a run-owned Organization double, with guaranteed cleanup.
 *
 * This is deliberately NOT a rewrite of `isolated-catalog-stack.ts`
 * (tickets-only) — it composes it as-is (proven, already used by 3 other
 * specs) and adds two new sibling processes (`e2e_problem_service`,
 * `e2e_change_service`) built the same way
 * (problem_service/cmd/e2e_server, change_service/cmd/e2e_server). The
 * per-service spawn/lease/teardown logic below is a deliberate, small
 * duplication of tickets_service's — same rationale this whole monorepo
 * already uses for its Go services (ADR-0002: no cross-service coupling),
 * applied here to the TS orchestration layer.
 *
 * Internal secrets are shared byte-for-byte across all three processes
 * (and the Organization stub) — each process validates the value it
 * receives against the value ITS CALLERS send, so a mismatch would 401
 * every cross-service call. Never logged.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INTERNAL_SECRETS = {
  tickets: process.env.TICKETS_INTERNAL_SECRET || 'dev-only-tickets-internal-secret-32-chars-min',
  change: process.env.CHANGE_INTERNAL_SECRET || 'dev-only-change-internal-secret-32-chars-min-x',
  resource: process.env.RESOURCE_INTERNAL_SECRET || 'dev-only-resource-internal-secret-32-chars-min',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isPidAlive(pid: number): boolean {
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    }).toString();
    return out.includes(`"${pid}"`);
  } catch {
    return false;
  }
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return;
    await sleep(100);
  }
}

function dropDatabase(db: string): void {
  psql(
    'postgres',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'dbname' AND pid <> pg_backend_pid(); DROP DATABASE IF EXISTS :"dbname";`,
    { dbname: db },
    15_000,
  );
}

export interface IsolatedServiceProcess {
  dbName: string;
  port: number;
  baseUrl: string;
  isolatedRequest: APIRequestContext;
  cleanup: () => Promise<void>;
}

type SpawnServiceOptions = {
  serviceLabel: 'problem' | 'change';
  binaryRelativePath: string;
  dbNamePrefix: string;
  dbUrlEnvVar: string;
  runToken: string;
  jwtSecret: string;
  jwtToken: string;
  extraEnv: Record<string, string>;
};

/** Generic disposable-database + spawn + lease + teardown, shared shape
 *  across the problem/change isolated processes. Deliberately mirrors
 *  `isolated-catalog-stack.ts`'s tickets-specific version rather than
 *  importing/refactoring it — see this file's header comment. */
async function spawnIsolatedService(options: SpawnServiceOptions): Promise<IsolatedServiceProcess> {
  const binaryPath = path.resolve(__dirname, options.binaryRelativePath);
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `${options.serviceLabel} isolated binary not found at ${binaryPath}. Run 'go build -o .run/e2e_${options.serviceLabel}_service.exe ./cmd/e2e_server' in ${options.serviceLabel}_service first.`,
    );
  }

  const runIdShort = options.runToken.replaceAll('-', '').slice(0, 8);
  const dbName = `${options.dbNamePrefix}${Date.now()}_${runIdShort}`;
  const portFilePath = path.join(os.tmpdir(), `sigdesk_e2e_${options.serviceLabel}_port_${options.runToken}.txt`);

  let dbCreated = false;
  let leaseEstablished = false;
  let child: ChildProcess | null = null;
  let requestContext: APIRequestContext | null = null;

  const cleanup = async (): Promise<void> => {
    const errors: string[] = [];

    if (requestContext) {
      try {
        await requestContext.dispose();
      } catch (err) {
        errors.push(`[dispose isolatedRequest context] ${describeError(err)}`);
      }
      requestContext = null;
    }

    if (child) {
      const proc = child;
      const pid = proc.pid;
      try {
        if (pid) {
          if (proc.exitCode === null && !proc.killed) {
            try {
              proc.kill();
            } catch (err) {
              void err;
            }
            await waitForPidExit(pid, 5_000);
          }
          if (proc.exitCode === null && isPidAlive(pid)) {
            try {
              execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 10_000,
              });
            } catch (err) {
              void err;
            }
            await waitForPidExit(pid, 5_000);
          }
          if (isPidAlive(pid)) {
            errors.push(`[terminate e2e_${options.serviceLabel}_service] pid ${pid} still running after graceful kill and taskkill`);
          }
        }
      } catch (err) {
        errors.push(`[terminate e2e_${options.serviceLabel}_service] ${describeError(err)}`);
      }
    }

    try {
      if (fs.existsSync(portFilePath)) fs.unlinkSync(portFilePath);
    } catch (err) {
      errors.push(`[remove port file] ${describeError(err)}`);
    }

    if (dbCreated) {
      try {
        let current: string | null;
        try {
          current = readCurrentLeaseToken(dbName);
        } catch (err) {
          throw new Error(`lease unreadable (${describeError(err)}); state preserved`, { cause: err });
        }
        if (leaseEstablished) {
          if (current !== options.runToken) {
            throw new Error(`lease mismatch (expected '${options.runToken}', found '${current ?? '<none>'}'); state preserved`);
          }
        } else if (current !== null && current !== options.runToken) {
          throw new Error('found a foreign lease token even though this run never established its own; state preserved for manual inspection');
        }

        let lastError: unknown = null;
        let dropped = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            dropDatabase(dbName);
            if (!databaseExists(dbName)) {
              dropped = true;
              break;
            }
            lastError = new Error('DROP DATABASE returned without error but the database is still visible in pg_database');
          } catch (err) {
            lastError = err;
          }
          if (attempt < 9) await sleep(200);
        }
        if (!dropped) {
          throw new Error(`failed to drop disposable database "${dbName}" after 10 attempts. Last error: ${describeError(lastError)}`);
        }
      } catch (err) {
        errors.push(`[verify lease and drop disposable database] ${describeError(err)}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`spawnIsolatedService(${options.serviceLabel}) cleanup failed with ${errors.length} error(s):\n${errors.join('\n')}`);
    }
  };

  try {
    psql('postgres', `CREATE DATABASE :"dbname";`, { dbname: dbName });
    dbCreated = true;

    psql(
      dbName,
      `CREATE TABLE IF NOT EXISTS _e2e_lease (run_token TEXT PRIMARY KEY, created_at TIMESTAMPTZ, pid INT); ` +
        `INSERT INTO _e2e_lease (run_token, created_at, pid) VALUES (:'run_token', NOW(), :pid);`,
      { run_token: options.runToken, pid: String(process.pid) },
    );
    leaseEstablished = true;

    if (fs.existsSync(portFilePath)) fs.unlinkSync(portFilePath);

    const dbUrl = `postgres://sigdesk:sigdesk@localhost:5432/${dbName}`;
    child = spawn(binaryPath, ['-port-file', portFilePath], {
      env: {
        ...process.env,
        [options.dbUrlEnvVar]: dbUrl,
        JWT_SECRET: options.jwtSecret,
        E2E_RUN_TOKEN: options.runToken,
        PORT: '0',
        ...options.extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.on('error', (err) => {
      console.error(`[isolated-itsm-stack:${options.serviceLabel}] Process error:`, err);
    });

    let port = 0;
    const portDeadline = Date.now() + 15_000;
    while (Date.now() < portDeadline) {
      if (fs.existsSync(portFilePath)) {
        const parsed = parseInt(fs.readFileSync(portFilePath, 'utf8').trim(), 10);
        if (parsed > 0) {
          port = parsed;
          break;
        }
      }
      await sleep(100);
    }
    if (port === 0) {
      throw new Error(`Failed to read assigned port for e2e_${options.serviceLabel}_service from ${portFilePath}`);
    }

    const baseUrl = `http://127.0.0.1:${port}`;
    const healthDeadline = Date.now() + 15_000;
    let healthy = false;
    while (Date.now() < healthDeadline) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.status === 200) {
          healthy = true;
          break;
        }
      } catch (err) {
        void err;
      }
      await sleep(100);
    }
    if (!healthy) {
      throw new Error(`e2e_${options.serviceLabel}_service did not become healthy at ${baseUrl}/health within 15s`);
    }

    const readyDeadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      try {
        const res = await fetch(`${baseUrl}/ready`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch (err) {
        void err;
      }
      await sleep(100);
    }
    if (!ready) {
      throw new Error(`e2e_${options.serviceLabel}_service did not become ready at ${baseUrl}/ready within 15s`);
    }

    requestContext = await playwrightRequest.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${options.jwtToken}` },
    });

    return { dbName, port, baseUrl, isolatedRequest: requestContext, cleanup };
  } catch (setupError) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new Error(
        `Setup failed AND cleanup could not fully reclaim resources.\nSetup error: ${describeError(setupError)}\nCleanup error: ${describeError(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw setupError;
  }
}

export interface IsolatedItsmStack {
  runToken: string;
  jwtToken: string;
  tickets: IsolatedCatalogStack;
  problem: IsolatedServiceProcess;
  change: IsolatedServiceProcess;
  organization: IsolatedOrganizationStub;
  cleanup: () => Promise<void>;
}

/**
 * Starts the full multi-service isolated ITSM stack: tickets_service,
 * problem_service, change_service, and a run-owned Organization double,
 * each wired to reference the OTHERS' isolated base URLs instead of any
 * shared instance. Resource/Assets stays a shared, read-only dependency
 * (same carve-out already used by every isolated-stack spec) — nothing
 * here ever creates or mutates a real CMDB asset.
 *
 * Teardown order matters: problem/change are stopped first (they are
 * CALLERS of tickets_service), then tickets, then the Organization stub —
 * so no process is left mid-request against an already-torn-down
 * dependency. Every phase runs even if an earlier one fails, and every
 * failure is reported, never silently swallowed.
 */
export async function startIsolatedItsmStack(): Promise<IsolatedItsmStack> {
  const runToken = crypto.randomUUID();
  const jwtSecret = resolveJwtSecret();

  // "Inventario"/"Servicios" are the two departments itsm-golden-path.spec.ts
  // needs for its Task assignment flow — see isolated-organization-stub.ts's
  // header comment for the full contract this satisfies.
  const organization = await startIsolatedOrganizationStub({ extraDepartments: ['Inventario', 'Servicios'] });

  let tickets: IsolatedCatalogStack | null = null;
  let problem: IsolatedServiceProcess | null = null;
  let change: IsolatedServiceProcess | null = null;

  const cleanup = async (): Promise<void> => {
    const errors: string[] = [];
    if (problem) {
      try {
        await problem.cleanup();
      } catch (err) {
        errors.push(`[problem] ${describeError(err)}`);
      }
    }
    if (change) {
      try {
        await change.cleanup();
      } catch (err) {
        errors.push(`[change] ${describeError(err)}`);
      }
    }
    if (tickets) {
      try {
        await tickets.cleanup();
      } catch (err) {
        errors.push(`[tickets] ${describeError(err)}`);
      }
    }
    try {
      await organization.cleanup();
    } catch (err) {
      errors.push(`[organization] ${describeError(err)}`);
    }
    if (errors.length > 0) {
      throw new Error(`startIsolatedItsmStack cleanup failed with ${errors.length} error(s):\n${errors.join('\n')}`);
    }
  };

  const jwtToken = mintE2EJWT(jwtSecret, '00000000-0000-0000-0000-000000000003');

  try {
    tickets = await startIsolatedCatalogStack({
      jwtSecret,
      organizationServiceUrl: organization.baseUrl,
      organizationInternalSecret: organization.internalSecret,
    });

    // Both problem_service and change_service need the tickets internal
    // secret to call INTO tickets_service's internal endpoints — same
    // literal value tickets_service's own isolated process was started
    // with (`INTERNAL_SECRETS.tickets`, from isolated-catalog-stack.ts's
    // module constant), so the header each sends actually validates.
    //
    // change_service is started BEFORE problem_service (deliberately,
    // reversing the "natural" reading order): problem_service's `Lookup`
    // client also calls change_service (`ChangesURL`) — itsm-golden-path's
    // "resolvedBy" relation (PRB -> RFC) exercises exactly this lookup, so
    // problem_service needs change_service's REAL isolated URL at spawn
    // time, not the shared default. change_service has no equivalent
    // dependency on problem_service's URL.
    change = await spawnIsolatedService({
      serviceLabel: 'change',
      binaryRelativePath: '../../BACKEND/change_service/.run/e2e_change_service.exe',
      dbNamePrefix: 'sigdesk_change_e2e_',
      dbUrlEnvVar: 'CHANGE_DATABASE_URL',
      runToken,
      jwtSecret,
      jwtToken,
      extraEnv: {
        TICKETS_INTERNAL_SECRET: INTERNAL_SECRETS.tickets,
        CHANGE_INTERNAL_SECRET: INTERNAL_SECRETS.change,
        RESOURCE_INTERNAL_SECRET: INTERNAL_SECRETS.resource,
        ORGANIZATION_INTERNAL_SECRET: organization.internalSecret,
        ORGANIZATION_SERVICE_URL: organization.baseUrl,
        TICKETS_SERVICE_URL: tickets.baseUrl,
        RESOURCE_SERVICE_URL: process.env.RESOURCE_SERVICE_URL || 'http://localhost:8082',
      },
    });

    problem = await spawnIsolatedService({
      serviceLabel: 'problem',
      binaryRelativePath: '../../BACKEND/problem_service/.run/e2e_problem_service.exe',
      dbNamePrefix: 'sigdesk_problem_e2e_',
      dbUrlEnvVar: 'PROBLEM_DATABASE_URL',
      runToken,
      jwtSecret,
      jwtToken,
      extraEnv: {
        TICKETS_INTERNAL_SECRET: INTERNAL_SECRETS.tickets,
        CHANGE_INTERNAL_SECRET: INTERNAL_SECRETS.change,
        RESOURCE_INTERNAL_SECRET: INTERNAL_SECRETS.resource,
        ORGANIZATION_INTERNAL_SECRET: organization.internalSecret,
        ORGANIZATION_SERVICE_URL: organization.baseUrl,
        TICKETS_SERVICE_URL: tickets.baseUrl,
        CHANGE_SERVICE_URL: change.baseUrl,
        RESOURCE_SERVICE_URL: process.env.RESOURCE_SERVICE_URL || 'http://localhost:8082',
      },
    });

    return { runToken, jwtToken, tickets, problem, change, organization, cleanup };
  } catch (setupError) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new Error(
        `Setup failed AND cleanup could not fully reclaim resources.\nSetup error: ${describeError(setupError)}\nCleanup error: ${describeError(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw setupError;
  }
}

export function isolatedRequestFor(baseUrl: string, jwtToken: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: { Authorization: `Bearer ${jwtToken}` },
  });
}
