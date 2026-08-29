import type { Page } from '@playwright/test';

/**
 * Real organization_service shapes (Docs/plans/conexion-backend-frontend-identidad-rol-plan.md
 * Milestone 2) — GET /me is flat, `role_id` singular, `permissions` are
 * "entity:action:scope" strings, never a role name. `'*'` is the documented
 * global wildcard (FRONTEND-HANDOFF.md §6); the `roles:`/`usuarios:` entries
 * are what actually grants `canManageUsersAndRoles` (AuthProvider.tsx) so
 * specs that need /app/admin/users can rely on this fixture too.
 *
 * `tickets:read:global` is listed explicitly even though `'*'` already covers
 * it: the ticket surfaces are gated by `canViewTickets` (AuthProvider.tsx),
 * an entity-prefix capability, and every spec that visits /app/tickets should
 * say so in its identity rather than lean silently on the wildcard — that
 * wildcard is precisely what hid the broken dotted gate from this suite.
 */
const adminIdentity = {
  username: 'playwright',
  displayName: 'Playwright Admin',
  roleId: 'e2e-admin-role',
  permissions: [
    '*',
    'roles:read:global',
    'roles:update:global',
    'usuarios:read:global',
    'usuarios:update:global',
    'tickets:read:global',
  ],
};

/**
 * Milestone 3 (Docs/plans/conexion-backend-frontend-identidad-rol-plan.md)
 * — "a second user sees exactly what their role permits", the negative
 * case for /app/admin/users. `tickets:read:global` satisfies the OUTER
 * /app/* gate, while `canManageUsersAndRoles` requires a read grant over
 * `roles` or `usuarios`, so this
 * identity reaches `/app` but must still bounce off the INNER
 * `/app/admin/users` guard (`requireCondition={canManageUsersAndRoles}
 * fallbackTo="/app"`). A narrower identity with no permissions at all
 * would fail the OUTER gate instead and never reach `/app` to begin with
 * — that's a real but different assertion (see
 * users-roles-milestone3.spec.ts for both).
 */
const agentWithoutAdminAccessIdentity = {
  username: 'playwright-agent',
  displayName: 'Playwright Agent',
  roleId: 'e2e-agent-role',
  permissions: ['tickets:read:global'],
};

/** SIG-DESK's own API, behind Kong — bare paths, no /api/v1 (see
 *  apiClient.ts). Override via PLAYWRIGHT_API_URL if the dev server under
 *  test was started with a different VITE_API_URL than this fixture. */
export const SIG_DESK_API_BASE = (process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8000').replace(
  /\/$/,
  '',
);
const SIG_DESK_API_PORT = new URL(SIG_DESK_API_BASE).port;

type MockIdentity = {
  username: string;
  displayName: string;
  roleId: string;
  permissions: string[];
};

type AuthMockOptions = {
  /** Integrated specs forward domain calls to Kong. Guard-only specs can
   *  turn that off so an absent backend cannot leave route.fetch pending. */
  forwardUnmatched?: boolean;
};

/**
 * Shared implementation behind mockAuthenticatedAdmin/mockAuthenticatedAgent
 * — SIGTools `/me/` plus SIG-DESK `POST /v1/session`, parameterized by
 * identity so a spec can assert what a DIFFERENT role sees, not just the
 * admin fixture every other spec already relies on.
 */
async function mockAuthenticatedIdentity(
  page: Page,
  identity: MockIdentity,
  { forwardUnmatched = true }: AuthMockOptions = {},
) {
  // SIGTools always lives under /api/v1/web-auth on its own origin
  // (sigtoolsClient.ts hardcodes that regardless of VITE_API_URL) —
  // independent of the Gateway change above, so this pattern is unaffected.
  await page.route('**/api/v1/web-auth/me/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        name: identity.displayName,
        email: `${identity.username}@sig.systems`,
        username: identity.username,
      }),
    });
  });

  // SIG-DESK's own API. POST /v1/session is stubbed with its real shape;
  // everything else on this origin is forwarded to a live backend (e2e
  // specs beyond auth need real tickets/catalog data), rewriting only the
  // origin — no path prefix to strip on either side anymore.
  // Matched by port rather than hostname: the dev server may be reached as
  // localhost or 127.0.0.1 depending on how it was started, but the Kong
  // dev proxy port is stable.
  await page.route(
    (url) => url.port === SIG_DESK_API_PORT,
    async (route) => {
      const requestURL = new URL(route.request().url());
      if (requestURL.pathname === '/v1/session') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token:
              process.env.PLAYWRIGHT_SIGDESK_TOKEN ?? `e2e-token-${identity.username}`,
            expires_in: 900,
            role_id: identity.roleId,
            permissions: identity.permissions,
          }),
        });
        return;
      }

      // Kept as a contract stub for screens/tests that query the decoded
      // identity directly, even though AuthProvider currently hydrates from
      // POST /v1/session.
      if (requestURL.pathname === '/me') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sub: identity.username,
            email: `${identity.username}@sig.systems`,
            company_id: 'e2e-company',
            role_id: identity.roleId,
            permissions: identity.permissions,
          }),
        });
        return;
      }

      if (!forwardUnmatched) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error_code: 'E2E_NOT_STUBBED', message: requestURL.pathname }),
        });
        return;
      }

      const response = await route.fetch({
        url: `${SIG_DESK_API_BASE}${requestURL.pathname}${requestURL.search}`,
      });
      await route.fulfill({ response });
    },
  );
}

export async function mockAuthenticatedAdmin(page: Page, options?: AuthMockOptions) {
  await mockAuthenticatedIdentity(page, adminIdentity, options);
}

/** Milestone 3's "second user" fixture — see agentWithoutAdminAccessIdentity. */
export async function mockAuthenticatedAgentWithoutAdminAccess(
  page: Page,
  options?: AuthMockOptions,
) {
  await mockAuthenticatedIdentity(page, agentWithoutAdminAccessIdentity, options);
}
