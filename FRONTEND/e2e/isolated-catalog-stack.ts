import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DEV_JWT_SECRET = 'dev-only-change-me-do-not-use-in-prod';
const INTERNAL_SECRET =
  process.env.TICKETS_INTERNAL_SECRET || 'dev-only-tickets-internal-secret-32-chars-min';
const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000003';

const DOCKER_CONTAINER = 'backend-postgres-1';
const PG_USER = 'sigdesk';

export function resolveJwtSecret(): string {
  return (
    process.env.PLAYWRIGHT_JWT_SECRET ||
    process.env.JWT_SECRET ||
    DEFAULT_DEV_JWT_SECRET
  );
}

export function mintE2EJWT(
  jwtSecret: string = resolveJwtSecret(),
  sub: string = ADMIN_USER_ID,
  // Ticket identity presentation: additive `nombre` claim (see
  // tickets_service/adapters/in/auth_middleware.go's claimsSesion). The
  // isolated e2e_tickets_service never runs the identity reconciler (that
  // wiring lives only in main.go, not cmd/e2e_server), so a test that needs
  // creadorNombre to resolve must mint a token that already carries it —
  // there is no background process to backfill it locally.
  nombre?: string,
): string {
  const base64Url = (input: string | Buffer) => {
    const b = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };

  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      sub,
      exp: Math.floor(Date.now() / 1000) + 7200,
      permissions: ['*'],
      ...(nombre ? { nombre } : {}),
    }),
  );

  const unsigned = `${header}.${payload}`;
  const signature = base64Url(
    crypto.createHmac('sha256', jwtSecret).update(unsigned).digest(),
  );
  return `${unsigned}.${signature}`;
}

export type IsolatedCatalogStack = {
  dbName: string;
  /**
   * Doubles as this run's `_e2e_lease` token AND the `E2E_RUN_TOKEN` the
   * isolated process stamps on every mutating response (see
   * `stampRunTokenOnMutations` in cmd/e2e_server/main.go) — one identity
   * per run, checked independently by both the DB-cleanup lease guard and
   * the browser-side mutation auditor (support.ts).
   */
  runToken: string;
  port: number;
  baseUrl: string;
  jwtToken: string;
  isolatedRequest: APIRequestContext;
  cleanup: () => Promise<void>;
};

export type IsolatedStackOptions = {
  jwtSecret?: string;
  /** Ticket identity presentation: minted into `stack.jwtToken`'s `nombre`
   *  claim so a record created through this stack gets a real
   *  creadorNombre snapshot — see `mintE2EJWT`'s own doc comment for why
   *  the isolated stack cannot backfill this any other way. */
  actorNombre?: string;
  failAfterDatabaseCreation?: boolean;
  failDuringSeed?: boolean;
  /** Throws immediately after seeding succeeds, before the readiness poll
   *  loop is ever entered — exercises cleanup at the setup/readiness phase
   *  boundary. Does NOT exercise the readiness polling code itself; for
   *  that, see `forceReadinessTimeout`. */
  failDuringReadiness?: boolean;
  /** Redirects the readiness poll at a path that can never return 200, so
   *  the real polling loop runs to its real deadline and throws the real
   *  "did not become ready" error — as opposed to `failDuringReadiness`,
   *  which never touches the loop at all. Pair with `readinessTimeoutMs`
   *  to keep the test fast. */
  forceReadinessTimeout?: boolean;
  /** Overrides the readiness poll deadline (default 15000ms). */
  readinessTimeoutMs?: number;
  /** E2E contamination remediation, Workstream A, Correction 4 (2026-09-06):
   *  point the spawned process's organization_service dependency at a
   *  run-owned double (e.g. `startIsolatedOrganizationStub()`) instead of
   *  the shared `RESOURCE_SERVICE_URL`-style default. Falls back to
   *  `process.env.ORGANIZATION_SERVICE_URL`/`ORGANIZATION_INTERNAL_SECRET`
   *  (i.e. the shared instance) when not given, unchanged from before this
   *  option existed — so every spec that doesn't pass this keeps its prior
   *  behavior exactly. */
  organizationServiceUrl?: string;
  organizationInternalSecret?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * All Postgres access goes through `docker exec` with an argument array —
 * never a shell string — so nothing here is shell-injectable, and values
 * that need to reach SQL go in as psql `-v` variables substituted via
 * `:'name'` (quoted as a string literal) or `:"name"` (quoted as an
 * identifier), never string-concatenated into the SQL text itself.
 *
 * The SQL is sent over stdin, not `-c`: psql only performs `:'name'`/
 * `:"name"` variable interpolation while reading a script (stdin or `-f`)
 * — verified empirically against this container's psql 16.15, where `-c`
 * sends the colon-syntax through to the server completely uninterpreted
 * and it fails as a syntax error.
 *
 * Exported (along with `readCurrentLeaseToken`/`databaseExists` below)
 * purely for isolated-catalog-failure.spec.ts's lease-sensitivity test,
 * which needs to tamper with and inspect `_e2e_lease` directly through the
 * exact same safe primitive the stack itself uses — not a hand-rolled
 * duplicate.
 */
export function psql(db: string, sql: string, vars: Record<string, string> = {}, timeoutMs = 10_000): string {
  const args = ['exec', '-i', DOCKER_CONTAINER, 'psql', '-U', PG_USER, '-d', db, '-t', '-A'];
  for (const [name, value] of Object.entries(vars)) {
    args.push('-v', `${name}=${value}`);
  }
  return execFileSync('docker', args, {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: timeoutMs,
  }).toString();
}

/** The `_e2e_lease` table holds exactly one row per disposable database —
 *  read the newest one rather than filtering by an expected token, so a
 *  mismatch can still report what was actually found. */
export function readCurrentLeaseToken(db: string): string | null {
  const out = psql(db, `SELECT run_token FROM _e2e_lease ORDER BY created_at DESC LIMIT 1;`).trim();
  return out === '' ? null : out;
}

/**
 * Fail-closed ownership check. Throws (never merely warns) unless this run
 * can PROVE it owns `db`:
 *  - Normal case (`leaseWasEstablished`): the lease row must exist and
 *    match `expectedToken` exactly. A missing table, a read failure, or a
 *    mismatched token are all refusals — not "drop anyway, but warn".
 *  - Narrow case (`!leaseWasEstablished`): this run's own `CREATE DATABASE`
 *    succeeded but its `INSERT INTO _e2e_lease` never confirmed, so there
 *    is by construction no lease for anyone to have raced us on. A missing
 *    lease is therefore expected and NOT a refusal — but a lease that
 *    exists with a foreign token is refused rather than assumed benign.
 */
function assertLeaseOwnership(db: string, expectedToken: string, leaseWasEstablished: boolean): void {
  let current: string | null;
  try {
    current = readCurrentLeaseToken(db);
  } catch (err) {
    throw new Error(
      `refusing to drop "${db}": lease unreadable (${describeError(err)}). ` +
        `State is preserved — retry cleanup once the database is reachable again.`,
      { cause: err },
    );
  }
  if (leaseWasEstablished) {
    if (current !== expectedToken) {
      throw new Error(
        `refusing to drop "${db}": lease mismatch (expected '${expectedToken}', found '${current ?? '<none>'}'). ` +
          `State is preserved — retry cleanup once the correct lease is restored.`,
      );
    }
  } else if (current !== null && current !== expectedToken) {
    throw new Error(
      `refusing to drop "${db}": found a lease token that does not belong to this run, even though this run's ` +
        `own lease was never established. State is preserved for manual inspection.`,
    );
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

export function databaseExists(db: string): boolean {
  const out = psql('postgres', `SELECT 1 FROM pg_database WHERE datname = :'dbname';`, { dbname: db }).trim();
  return out === '1';
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

class ResourceTracker {
  private dbCreated = false;
  private leaseEstablished = false;
  private dbName = '';
  private runToken = '';
  private portFilePath = '';
  private child: ChildProcess | null = null;
  private requestContext: APIRequestContext | null = null;

  trackDatabase(dbName: string, runToken: string) {
    this.dbCreated = true;
    this.dbName = dbName;
    this.runToken = runToken;
  }

  /** Call only once `INSERT INTO _e2e_lease` has actually committed. Before
   *  this, `dbCreated` can be true while `leaseEstablished` stays false —
   *  the narrow "created but never leased" window `assertLeaseOwnership`
   *  handles separately. */
  markLeaseEstablished() {
    this.leaseEstablished = true;
  }

  trackPortFile(portFilePath: string) {
    this.portFilePath = portFilePath;
  }

  trackProcess(child: ChildProcess) {
    this.child = child;
  }

  trackRequestContext(ctx: APIRequestContext) {
    this.requestContext = ctx;
  }

  getDbName(): string {
    return this.dbName;
  }

  getPortFilePath(): string {
    return this.portFilePath;
  }

  getChild(): ChildProcess | null {
    return this.child;
  }

  /** Waits for graceful exit, then force-terminates the exact tracked
   *  PID/process tree if it survives, then fails loudly if even that
   *  didn't work — never by image name, so a concurrent isolated run's own
   *  e2e_tickets_service.exe is never at risk of being touched. Only
   *  clears `this.child` once exit is actually confirmed, so a cleanup()
   *  retry after a thrown error doesn't silently skip an unfinished kill. */
  private async terminateProcess(): Promise<void> {
    const proc = this.child;
    if (!proc) return;
    const pid = proc.pid;
    if (!pid) {
      this.child = null;
      return;
    }

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
        void err; // taskkill can legitimately fail if the process exited between our check and the call — confirmed below either way.
      }
      await waitForPidExit(pid, 5_000);
    }

    if (isPidAlive(pid)) {
      throw new Error(
        `e2e_tickets_service (pid ${pid}) is still running after graceful kill and 'taskkill /PID ${pid} /T /F'.`,
      );
    }

    this.child = null;
  }

  private removePortFile(): void {
    if (!this.portFilePath) return;
    if (fs.existsSync(this.portFilePath)) {
      fs.unlinkSync(this.portFilePath);
    }
    this.portFilePath = '';
  }

  /** Fail-closed database teardown: verifies ownership (see
   *  `assertLeaseOwnership`), then drops, then CONFIRMS the drop actually
   *  took before clearing tracked state — never assumed from a clean
   *  `DROP DATABASE` exit code alone. Any failure throws with tracked
   *  state left exactly as it was, so a later `cleanup()` call is a real
   *  retry, not a silent no-op. */
  private async verifyLeaseAndDrop(): Promise<void> {
    if (!this.dbCreated || !this.dbName) return;
    const targetDb = this.dbName;
    const expectedToken = this.runToken;

    assertLeaseOwnership(targetDb, expectedToken, this.leaseEstablished);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        dropDatabase(targetDb);
        if (!databaseExists(targetDb)) {
          this.dbCreated = false;
          this.leaseEstablished = false;
          this.dbName = '';
          this.runToken = '';
          return;
        }
        lastError = new Error('DROP DATABASE returned without error but the database is still visible in pg_database');
      } catch (err) {
        lastError = err;
      }
      if (attempt < 9) await sleep(200);
    }
    throw new Error(
      `failed to drop disposable database "${targetDb}" after 10 attempts (state preserved for retry). ` +
        `Last error: ${describeError(lastError)}`,
    );
  }

  /** Runs every teardown phase even if an earlier one failed, and rejects
   *  with everything that went wrong — never only the first failure,
   *  never only a console log. */
  async cleanup(): Promise<void> {
    const errors: string[] = [];

    if (this.requestContext) {
      try {
        await this.requestContext.dispose();
      } catch (err) {
        errors.push(`[dispose isolatedRequest context] ${describeError(err)}`);
      }
      this.requestContext = null;
    }

    try {
      await this.terminateProcess();
    } catch (err) {
      errors.push(`[terminate e2e_tickets_service process] ${describeError(err)}`);
    }

    try {
      this.removePortFile();
    } catch (err) {
      errors.push(`[remove port file] ${describeError(err)}`);
    }

    try {
      await this.verifyLeaseAndDrop();
    } catch (err) {
      errors.push(`[verify lease and drop disposable database] ${describeError(err)}`);
    }

    if (errors.length > 0) {
      throw new Error(`isolated-catalog-stack cleanup failed with ${errors.length} error(s):\n${errors.join('\n')}`);
    }
  }
}

export async function startIsolatedCatalogStack(
  options: IsolatedStackOptions = {},
): Promise<IsolatedCatalogStack> {
  const binaryPath = path.resolve(
    __dirname,
    '../../BACKEND/tickets_service/.run/e2e_tickets_service.exe',
  );

  // 1. Preflight binary before creating the database
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `e2e_tickets_service binary not found at ${binaryPath}. Preflight failed. Run 'go build -o ../.run/e2e_tickets_service.exe ./cmd/e2e_server' first.`,
    );
  }

  const tracker = new ResourceTracker();
  // Doubles as the DB lease token AND the E2E_RUN_TOKEN the isolated
  // process stamps on every mutating response — see IsolatedCatalogStack.
  const runToken = crypto.randomUUID();
  const runIdShort = runToken.replaceAll('-', '').slice(0, 8);
  const dbName = `sigdesk_tickets_e2e_${Date.now()}_${runIdShort}`;
  const portFilePath = path.join(os.tmpdir(), `sigdesk_e2e_port_${runToken}.txt`);

  try {
    // 2. Create disposable database and write ownership marker
    psql('postgres', `CREATE DATABASE :"dbname";`, { dbname: dbName });
    tracker.trackDatabase(dbName, runToken);

    psql(
      dbName,
      `CREATE TABLE IF NOT EXISTS _e2e_lease (run_token TEXT PRIMARY KEY, created_at TIMESTAMPTZ, pid INT); ` +
        `INSERT INTO _e2e_lease (run_token, created_at, pid) VALUES (:'run_token', NOW(), :pid);`,
      { run_token: runToken, pid: String(process.pid) },
    );
    tracker.markLeaseEstablished();

    if (options.failAfterDatabaseCreation) {
      throw new Error('Simulated failure after database creation');
    }

    // 3. Prepare port file and spawn isolated process
    if (fs.existsSync(portFilePath)) {
      fs.unlinkSync(portFilePath);
    }
    tracker.trackPortFile(portFilePath);

    const jwtSecret = options.jwtSecret ?? resolveJwtSecret();
    // Never logged, never included in a thrown error: this is the one
    // value in this file that carries credentials.
    const dbUrl = `postgres://sigdesk:sigdesk@localhost:5432/${dbName}`;
    const child: ChildProcess = spawn(
      binaryPath,
      ['-port-file', portFilePath],
      {
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
          JWT_SECRET: jwtSecret,
          TICKETS_INTERNAL_SECRET: INTERNAL_SECRET,
          E2E_RUN_TOKEN: runToken,
          // Assets/Resources are a read-only shared dependency: whether
          // e2eAssetResolver's in-process stub or the real
          // ResourceServiceHttpAdapter answers depends on whether this var
          // is set, but either way it only ever RESOLVES asset identities
          // for binding validation. Nothing in this stack seeds, creates,
          // or mutates Assets/Resources, and support.ts's mutation auditor
          // independently rejects any mutating /assets/** or /resources/**
          // request outright regardless of what this process would do.
          RESOURCE_SERVICE_URL: process.env.RESOURCE_SERVICE_URL || 'http://localhost:8082',
          RESOURCE_INTERNAL_SECRET: process.env.RESOURCE_INTERNAL_SECRET || 'dev-only-resource-internal-secret-32-chars-min',
          // Organization: same read-only-dependency treatment as
          // Assets/Resources above. `options.organizationServiceUrl` lets a
          // caller (e.g. incident-flow.spec.ts) point this at a run-owned
          // `startIsolatedOrganizationStub()` instead of the shared
          // instance — falls back to the previous shared-instance default
          // when not given, so every other spec's behavior is unchanged.
          ORGANIZATION_SERVICE_URL: options.organizationServiceUrl ?? process.env.ORGANIZATION_SERVICE_URL ?? '',
          ORGANIZATION_INTERNAL_SECRET:
            options.organizationInternalSecret ?? process.env.ORGANIZATION_INTERNAL_SECRET ?? '',
          PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    tracker.trackProcess(child);

    child.on('error', (err) => {
      console.error('[isolated-stack] Process error:', err);
    });

    // 4. Poll for assigned port
    let port = 0;
    const portDeadline = Date.now() + 15_000;
    while (Date.now() < portDeadline) {
      if (fs.existsSync(portFilePath)) {
        const content = fs.readFileSync(portFilePath, 'utf8').trim();
        const parsed = parseInt(content, 10);
        if (parsed > 0) {
          port = parsed;
          break;
        }
      }
      await sleep(100);
    }

    if (port === 0) {
      throw new Error(`Failed to read assigned port for e2e_tickets_service from ${portFilePath}`);
    }

    const baseUrl = `http://127.0.0.1:${port}`;

    // 5. Wait for /health
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
      throw new Error(`e2e_tickets_service did not become healthy at ${baseUrl}/health within 15s`);
    }

    // 6. Setup authenticated isolated APIRequestContext
    const jwtToken = mintE2EJWT(jwtSecret, ADMIN_USER_ID, options.actorNombre);
    const isolatedRequest = await playwrightRequest.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });
    tracker.trackRequestContext(isolatedRequest);

    if (options.failDuringSeed) {
      throw new Error('Simulated failure during seed');
    }

    // 7. Seed SLA policy via real API
    const slaPayload = {
      resourceId: 'sla:policy:incident-enterprise',
      name: 'Incidentes empresariales 24x7',
      contractVersion: '1',
      calendar: { timezone: 'America/Bogota', alwaysOn: true },
      targets: [
        { priority: 'critical', responseMinutes: 15, resolutionMinutes: 120 },
        { priority: 'high', responseMinutes: 30, resolutionMinutes: 240 },
        { priority: 'medium', responseMinutes: 60, resolutionMinutes: 480 },
        { priority: 'low', responseMinutes: 120, resolutionMinutes: 1440 },
      ],
      responseStates: ['in_progress', 'resolved', 'closed'],
      resolutionStates: ['resolved', 'closed'],
    };

    const slaCreateRes = await isolatedRequest.post('/sla/policies', { data: slaPayload });
    if (!slaCreateRes.ok() && slaCreateRes.status() !== 409) {
      throw new Error(`Failed to seed SLA policy: ${slaCreateRes.status()} ${await slaCreateRes.text()}`);
    }
    const slaPubRes = await isolatedRequest.post(
      '/sla/policies/sla:policy:incident-enterprise/versions/1/publish',
    );
    if (!slaPubRes.ok() && slaPubRes.status() !== 409) {
      throw new Error(`Failed to publish SLA policy: ${slaPubRes.status()} ${await slaPubRes.text()}`);
    }

    // 8. Seed INC, PRB, RFC from canonical fixtures via real APIs
    const fixturePath = path.resolve(__dirname, '../../BACKEND/scripts/fixtures/catalog-inc-v1.json');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Canonical fixture catalog-inc-v1.json not found at ${fixturePath}`);
    }
    const incFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    // Seed PRB & RFC minimal stubs so relation validator passes if needed.
    // Every response is checked — a partially-seeded stack (e.g. a
    // silently-failed publish) must never be handed back as if ready.
    for (const stubKey of ['PRB', 'RFC'] as const) {
      const stubPayload = {
        entityKey: stubKey,
        name: `${stubKey} Stub`,
        specification: {
          metamodelVersion: '1.6',
          fields: [{ key: 'title', label: 'Title', type: 'text', required: true }],
          lifecycle: {
            states: [
              { key: 'open', label: 'Open', initial: true },
              { key: 'closed', label: 'Closed' },
            ],
            transitions: [{ key: 'close', from: 'open', to: 'closed' }],
          },
        },
      };
      const createRes = await isolatedRequest.post('/catalog/definitions', { data: stubPayload });
      if (!createRes.ok()) {
        throw new Error(`Failed to create ${stubKey} stub definition: ${createRes.status()} ${await createRes.text()}`);
      }
      const publishRes = await isolatedRequest.post(`/catalog/definitions/${stubKey}/versions/1/publish`);
      if (!publishRes.ok()) {
        throw new Error(`Failed to publish ${stubKey} stub definition: ${publishRes.status()} ${await publishRes.text()}`);
      }
    }

    // Create & publish INC
    const incCreateRes = await isolatedRequest.post('/catalog/definitions', {
      data: {
        entityKey: 'INC',
        name: incFixture.name || 'Incident',
        specification: incFixture.specification,
      },
    });
    if (!incCreateRes.ok()) {
      throw new Error(`Failed to create INC definition: ${incCreateRes.status()} ${await incCreateRes.text()}`);
    }

    const incValRes = await isolatedRequest.post('/catalog/definitions/INC/versions/1/validate');
    if (!incValRes.ok()) {
      throw new Error(`Failed to validate INC definition: ${incValRes.status()} ${await incValRes.text()}`);
    }

    const incPubRes = await isolatedRequest.post('/catalog/definitions/INC/versions/1/publish');
    if (!incPubRes.ok()) {
      throw new Error(`Failed to publish INC definition: ${incPubRes.status()} ${await incPubRes.text()}`);
    }

    if (options.failDuringReadiness) {
      throw new Error('Simulated failure during readiness');
    }

    // 9. Wait for /ready. `forceReadinessTimeout` redirects this at a path
    // that can never return 200, so the loop below genuinely runs to its
    // deadline and throws the real timeout error, rather than a test only
    // ever exercising the throw above.
    const readinessPath = options.forceReadinessTimeout ? '/__e2e_never_ready_probe__' : '/ready';
    const readinessTimeoutMs = options.readinessTimeoutMs ?? 15_000;
    const readyDeadline = Date.now() + readinessTimeoutMs;
    let ready = false;
    while (Date.now() < readyDeadline) {
      try {
        const res = await isolatedRequest.get(readinessPath);
        if (res.status() === 200) {
          ready = true;
          break;
        }
      } catch (err) {
        void err;
      }
      await sleep(100);
    }
    if (!ready) {
      throw new Error(`e2e_tickets_service did not become ready at ${baseUrl}${readinessPath} within ${readinessTimeoutMs}ms`);
    }

    return {
      dbName,
      runToken,
      port,
      baseUrl,
      jwtToken,
      isolatedRequest,
      cleanup: () => tracker.cleanup(),
    };
  } catch (setupError) {
    try {
      await tracker.cleanup();
    } catch (cleanupError) {
      // Neither error is allowed to hide the other: a caller that only
      // sees the cleanup failure has no idea setup failed too, and vice
      // versa.
      throw new Error(
        `Setup failed AND cleanup could not fully reclaim resources.\n` +
          `Setup error: ${describeError(setupError)}\n` +
          `Cleanup error: ${describeError(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw setupError;
  }
}
