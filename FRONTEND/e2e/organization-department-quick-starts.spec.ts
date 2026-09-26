import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin, SIG_DESK_API_PORT } from './support';

/**
 * ADR-0035 — "Department quick starts" in the Organization tab
 * (UsersManager.tsx). Five explicit presets (Services, Accounting,
 * Purchasing, IT, Central Station) prefill the existing generic company
 * creation form as `departamento`; nothing is sent to the backend until the
 * user submits that form themselves, and the section only renders for an
 * identity that can actually create companies (`companies:create`) — never
 * hardcoded, always derived from the real JWT grant.
 */

const ROOT_COMPANY = { id: 'org-root', nombre: 'SIG', tipo: 'empresa' as const };

async function stubAdminSurface(page: Page) {
  await page.route('**/admin/roles', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route('**/admin/permissions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ acciones: [], alcances: [], entidades: [] }),
    }),
  );
  await page.route(/:8000\/admin\/users$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route('**/admin/companies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [ROOT_COMPANY] }) }),
  );
}

/**
 * An identity that can manage users (so it clears the /admin/users route
 * guard, App.tsx `canManageUsersAndRoles`) and can read companies (so the
 * Organization tab itself shows up), but was deliberately NOT granted
 * `companies:create` — the negative case ADR-0035 requires: quick starts
 * must depend on the real grant, not merely on reaching this screen at all.
 */
async function mockAuthenticatedUsersReaderWithoutCompanyCreate(page: Page) {
  await page.route('**/api/v1/web-auth/me/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 2,
        name: 'Playwright Users Reader',
        email: 'playwright-users-reader@sig.systems',
        username: 'playwright-users-reader',
      }),
    }),
  );
  await page.route(
    (url) => url.port === SIG_DESK_API_PORT,
    async (route) => {
      const requestURL = new URL(route.request().url());
      if (requestURL.pathname === '/v1/session') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'e2e-token-playwright-users-reader',
            expires_in: 900,
            role_id: 'e2e-users-reader-role',
            permissions: ['usuarios:read:global', 'companies:read:global'],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error_code: 'E2E_NOT_STUBBED', message: requestURL.pathname }),
      });
    },
  );
  await page.route('**/admin/users', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route('**/admin/companies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [ROOT_COMPANY] }) }),
  );
}

test('un admin ve los department quick starts y un preset prellena el formulario sin mutar red hasta enviar', async ({
  page,
}) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubAdminSurface(page);

  let companyCreateRequests = 0;
  await page.route('**/companies', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    companyCreateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({
      nombre: 'Accounting',
      tipo: 'departamento',
      parent_id: 'org-root',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'dept-accounting', nombre: 'Accounting', tipo: 'departamento', parent_id: 'org-root' }),
    });
  });

  await page.goto('/app/admin/users');
  await page.getByRole('button', { name: 'Organization' }).click();

  const quickStarts = page.getByRole('group', { name: 'Department quick starts' });
  await expect(quickStarts).toBeVisible();
  for (const label of ['Services', 'Accounting', 'Purchasing', 'IT', 'Central Station']) {
    await expect(quickStarts.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  await quickStarts.getByRole('button', { name: 'Accounting', exact: true }).click();

  await expect(page.getByLabel('Area or team name')).toHaveValue('Accounting');
  await expect(page.getByLabel('Type')).toHaveValue('departamento');
  await expect(page.getByLabel('Belongs to')).toHaveValue('org-root');

  // Prefilling must be purely local state — no mutation before submit.
  expect(companyCreateRequests).toBe(0);

  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect.poll(() => companyCreateRequests).toBe(1);
});

test('un usuario sin companies:create no ve los department quick starts', async ({ page }) => {
  await mockAuthenticatedUsersReaderWithoutCompanyCreate(page);

  await page.goto('/app/admin/users');
  await expect(page).toHaveURL(/\/app\/admin\/users$/);

  await page.getByRole('button', { name: 'Organization' }).click();

  await expect(page.getByRole('group', { name: 'Department quick starts' })).toHaveCount(0);
  // Sanity check that this identity really lacks companies:create — the
  // generic creation entry point should be gone too, not just the presets.
  await expect(page.getByRole('button', { name: 'Add area or team' })).toHaveCount(0);
});
