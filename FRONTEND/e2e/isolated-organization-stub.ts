import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * E2E contamination remediation, Workstream A, Corrections 4 & 5
 * (2026-09-06): the isolated ticket/ITSM flow must not depend on whatever
 * Organization records happen to exist in the shared local environment.
 * This is a minimal, contract-accurate HTTP test double for
 * organization_service, owned entirely by the run that starts it — no
 * shared credentials, no shared organizational data, a fresh deterministic
 * seed every time.
 *
 * It implements exactly the surface the isolated stacks consume:
 *  - `GET /agentes_it` and `GET /organization/assignment-directory` — the
 *    two BROWSER/test-facing, session-authenticated reads
 *    (`incident-flow.spec.ts`'s `creationBindings` calls these directly,
 *    the same way it already treats Assets/CMDB sites as a read-only
 *    dependency).
 *  - `GET /internal/agentes_it/{id}` and
 *    `POST /internal/organization/assignment/resolve` — the two
 *    INTERNAL-SECRET-gated reads `OrganizationServiceHttpAdapter`
 *    (tickets_service/adapters/out/organization_http_adapter.go,
 *    organization_asignacion_adapter.go) calls server-side, matching their
 *    exact request/response shapes.
 *  - `GET /internal/organization/assignment/directory` — the
 *    INTERNAL-SECRET-gated read change_service's own `organization.Client`
 *    calls for `GET /changes/assignment-directory` (a DIFFERENT path and
 *    payload shape — `nombre`/`department_id`/`team_id` snake_case keys —
 *    from the browser-facing one above; found live while migrating
 *    `itsm-golden-path.spec.ts`, which needs a full Task assignment
 *    directory with at least two named departments).
 *
 * This is deliberately NOT a real organization_service instance (no
 * database, no schema, no other endpoint) — a lightweight double scoped to
 * what today's isolated stacks need, generalized (2026-09-06, Correction 5)
 * from a single department/team/agent to N named departments so
 * `itsm-golden-path.spec.ts`'s "Inventario"/"Servicios" task-assignment
 * flow has real, distinct destinations to resolve against.
 */

export interface OrganizationUnitSeed {
  departmentId: string;
  departmentName: string;
  teamId: string;
  teamName: string;
  agentId: string;
  agentName: string;
}

export interface IsolatedOrganizationStub {
  baseUrl: string;
  internalSecret: string;
  /** Deterministic seed, so callers can assert against exact known values
   *  instead of "whatever happened to exist." `seed` is the first unit —
   *  kept for backward compatibility with specs written against the
   *  single-department shape (`incident-flow.spec.ts`); `units` exposes
   *  all of them, keyed by department name. */
  seed: OrganizationUnitSeed;
  units: Record<string, OrganizationUnitSeed>;
  cleanup: () => Promise<void>;
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

// Found live (2026-09-06): tickets_service/change_service persist these ids
// into real `uuid`-typed columns (`ticket_asignacion.agente_it_id`,
// `ticket_asignacion_org.departamento_id`/`equipo_id`, change_service's
// `tasks.department_id`/`team_id`/`assignee_user_id`) — a human-readable
// prefixed string ("dept-e2e-...") 500s with "invalid input syntax for
// type uuid". Real UUIDs required, not just unique strings.
function newUnit(departmentName: string, teamName: string, agentName: string): OrganizationUnitSeed {
  return {
    departmentId: crypto.randomUUID(),
    departmentName,
    teamId: crypto.randomUUID(),
    teamName,
    agentId: crypto.randomUUID(),
    agentName,
  };
}

export interface IsolatedOrganizationStubOptions {
  /** Additional named departments beyond the default "IT" one, each with
   *  its own team and assignee. `itsm-golden-path.spec.ts` needs
   *  "Inventario" and "Servicios" (task assignment); other specs can omit
   *  this and get just the default single department. */
  extraDepartments?: string[];
}

export async function startIsolatedOrganizationStub(
  options: IsolatedOrganizationStubOptions = {},
): Promise<IsolatedOrganizationStub> {
  const internalSecret = `dev-only-e2e-org-stub-internal-secret-${crypto.randomUUID()}`;

  const defaultUnit = newUnit('IT (E2E aislado)', 'Soporte Nivel 1 (E2E aislado)', 'Agente E2E aislado');
  const units: Record<string, OrganizationUnitSeed> = { [defaultUnit.departmentName]: defaultUnit };
  for (const name of options.extraDepartments ?? []) {
    units[name] = newUnit(name, `Equipo ${name} (E2E aislado)`, `Responsable ${name} (E2E aislado)`);
  }
  const allUnits = Object.values(units);
  // Real UUID, not a placeholder string — found live (2026-09-06) that
  // problem_service persists `actor_company_id` from the scope-resolution
  // response into a real `uuid`-typed column.
  const companyId = crypto.randomUUID();

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', 'http://internal');
        const method = req.method ?? 'GET';

        // --- Browser/test-facing, session-authenticated reads ---
        if (method === 'GET' && url.pathname === '/agentes_it') {
          sendJson(res, 200, { items: allUnits.map((u) => ({ id: u.agentId, nombre: u.agentName })) });
          return;
        }
        if (method === 'GET' && url.pathname === '/organization/assignment-directory') {
          sendJson(res, 200, {
            teams: allUnits.map((u) => ({ id: u.teamId, department_id: u.departmentId, nombre: u.teamName })),
          });
          return;
        }

        // --- Internal-secret-gated reads ---
        if (url.pathname.startsWith('/internal/')) {
          if (req.headers['x-internal-secret'] !== internalSecret) {
            sendJson(res, 401, { error_code: 'SECRETO_INTERNO_INVALIDO', message: 'secreto interno inválido' });
            return;
          }
          const matchedAgent = url.pathname.startsWith('/internal/agentes_it/')
            ? allUnits.find((u) => `/internal/agentes_it/${u.agentId}` === url.pathname)
            : undefined;
          if (method === 'GET' && matchedAgent) {
            sendJson(res, 200, { id: matchedAgent.agentId, nombre: matchedAgent.agentName });
            return;
          }
          if (method === 'GET' && url.pathname.startsWith('/internal/agentes_it/')) {
            sendJson(res, 404, { error_code: 'NO_ENCONTRADO', message: 'agente no encontrado' });
            return;
          }
          if (method === 'POST' && url.pathname === '/internal/authorization/scope') {
            // problem_service's (and, per the same contract, other
            // services') `organization.Client.Scope` — called by every
            // authorized request's middleware, unconditionally (no stub
            // fallback exists in problem_service's own code, unlike
            // tickets_service's `StubRolePermission`). Found live while
            // migrating `itsm-golden-path.spec.ts`: creating a PRB 503'd
            // with "Organization no pudo resolver el alcance" without
            // this endpoint. Always grants global scope — this stub's
            // JWTs already carry `permissions: ['*']`, so this mirrors
            // that same "admin, no restrictions" intent at the
            // scope-resolution layer.
            const body = (await readJsonBody(req)) as { actor_usuario_id?: string };
            sendJson(res, 200, {
              actor_usuario_id: body.actor_usuario_id ?? '',
              actor_company_id: companyId,
              alcance: 'global',
              organization_unit_ids: [],
              global: true,
            });
            return;
          }
          if (method === 'GET' && url.pathname === '/internal/organization/assignment/directory') {
            // change_service's organization.Client.AssignmentDirectory contract
            // (adapters/organization/client.go): snake_case keys, `nombre` for
            // display names — a DIFFERENT shape from the browser-facing
            // /organization/assignment-directory above.
            sendJson(res, 200, {
              departments: allUnits.map((u) => ({ id: u.departmentId, nombre: u.departmentName })),
              teams: allUnits.map((u) => ({ id: u.teamId, nombre: u.teamName, department_id: u.departmentId })),
              assignees: allUnits.map((u) => ({ id: u.agentId, nombre: u.agentName, email: `${u.agentId}@e2e.invalid`, team_id: u.teamId })),
            });
            return;
          }
          if (method === 'POST' && url.pathname === '/internal/organization/assignment/resolve') {
            const body = (await readJsonBody(req)) as {
              department_id?: string;
              team_id?: string;
              assignee_user_id?: string;
              capability?: string;
            };
            const match = allUnits.find((u) => u.departmentId === body.department_id && u.teamId === body.team_id);
            if (!match) {
              sendJson(res, 422, {
                error_code: 'DESTINO_ASIGNACION_INVALIDO',
                message: 'departamento o equipo no encontrado, o el equipo no pertenece a ese departamento',
              });
              return;
            }
            sendJson(res, 200, {
              department: { id: match.departmentId, nombre: match.departmentName },
              team: { id: match.teamId, nombre: match.teamName },
              assignee:
                body.assignee_user_id && body.assignee_user_id === match.agentId
                  ? { id: match.agentId, nombre: match.agentName, email: `${match.agentId}@e2e.invalid` }
                  : null,
            });
            return;
          }
        }

        sendJson(res, 404, { error_code: 'NO_IMPLEMENTADO', message: `ruta no soportada por el stub aislado de Organization: ${method} ${url.pathname}` });
      } catch (err) {
        sendJson(res, 500, { error_code: 'ERROR_INTERNO', message: err instanceof Error ? err.message : String(err) });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    internalSecret,
    seed: defaultUnit,
    units,
    cleanup: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
