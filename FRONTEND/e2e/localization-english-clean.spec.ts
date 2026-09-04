import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin, mockAuthenticatedRequester, SIG_DESK_API_PORT } from './support';

// Common mojibake / encoding corruption patterns
const MOJIBAKE_REGEX = /[\uFFFD]|Ã[\x80-\xBF]|Â[\x80-\xBF]|â€[^\s]/;

// Forbidden Spanish words in system UI chrome
const FORBIDDEN_SPANISH_WORDS = [
  'Guardar',
  'Cancelar',
  'Cargando…',
  'Buscar tickets',
  'Nueva regla',
  'Nuevo flujo',
  'Crear entidad',
  'Editar datos',
  'Automatizaciones',
  'Políticas de SLA',
];

async function setupApiMocks(page: Page) {
  await page.route(
    (url) => url.port === String(SIG_DESK_API_PORT),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname.startsWith('/v1/session') || pathname.startsWith('/me')) {
        return route.fallback();
      }
      if (pathname.startsWith('/notifications')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) });
      }
      if (pathname.startsWith('/tickets')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: '1',
                humanId: 'INC-000001',
                title: 'Network connectivity issue',
                status: 'Open',
                priority: 'Medium',
                requesterDisplayName: 'Jane Doe',
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
          }),
        });
      }
      if (pathname.startsWith('/entities/INC')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: '1',
                humanId: 'INC-000001',
                entityKey: 'INC',
                state: 'abierto',
                prioridad: 'media',
                creadorNombre: 'Jane Doe',
                createdAt: new Date().toISOString(),
                data: { title: 'Network connectivity issue' },
              },
            ],
            total: 1,
          }),
        });
      }
      if (pathname.startsWith('/entities')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (pathname.startsWith('/problems')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ problems: [], total: 0 }) });
      }
      if (pathname.startsWith('/changes')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (pathname.startsWith('/sla/policies')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (pathname.startsWith('/workflows')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (pathname.startsWith('/catalog/definitions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'def-1',
                entityKey: 'INC',
                name: 'Incident',
                version: 1,
                status: 'published',
                specification: {
                  identity: { prefix: 'INC' },
                  fields: [],
                },
              },
            ],
          }),
        });
      }
      if (pathname.startsWith('/catalog/resources')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    },
  );
}

async function assertPageIsCleanEnglish(page: Page, expectedHeading?: string | RegExp) {
  if (expectedHeading) {
    await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible({ timeout: 7000 });
  }

  // Verify no mojibake exists anywhere in the body text
  const bodyText = (await page.locator('body').innerText()) ?? '';
  expect(bodyText).not.toMatch(MOJIBAKE_REGEX);

  // Verify none of the forbidden Spanish chrome phrases appear
  for (const phrase of FORBIDDEN_SPANISH_WORDS) {
    expect(bodyText).not.toContain(phrase);
  }
}

test.describe('Localization & UTF-8 Encoding Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('Tickets module (/app/tickets) renders clean English UI with no mojibake', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/tickets');
    await expect(page.getByRole('heading', { name: /ticket board/i })).toBeVisible({ timeout: 7000 });
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByTestId('tickets-list')).toBeVisible({ timeout: 7000 });
    await expect(page.getByPlaceholder(/search by title/i)).toBeVisible();
    await assertPageIsCleanEnglish(page);
  });

  test('Problems module (/app/problems) renders clean English UI with no mojibake', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/problems');
    await expect(page.getByRole('heading', { name: /problem management/i })).toBeVisible({ timeout: 7000 });
    await assertPageIsCleanEnglish(page);
  });

  test('Changes module (/app/changes) renders clean English UI with no mojibake', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/changes');
    await expect(page.getByRole('heading', { name: /change management/i })).toBeVisible({ timeout: 7000 });
    await assertPageIsCleanEnglish(page);
  });

  test('SLA Policies module (/app/settings/sla) renders clean English UI with no mojibake', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/settings/sla');
    await expect(page.getByRole('heading', { name: /sla policies/i })).toBeVisible({ timeout: 7000 });
    await assertPageIsCleanEnglish(page);
  });

  test('Automations module (/app/automations) renders clean English UI with no mojibake', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/automations');
    await expect(page.getByRole('heading', { name: /automations/i })).toBeVisible({ timeout: 7000 });
    await assertPageIsCleanEnglish(page);
  });

  test('Catalog Builder module (/app/admin/catalog-builder) renders clean English UI with no mojibake', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/app/admin/catalog-builder');
    await expect(page.getByTestId('catalog-builder')).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole('button', { name: 'Create entity' })).toBeVisible();
    await assertPageIsCleanEnglish(page);
  });

  test('Requester Portal renders clean English navigation and actions', async ({ page }) => {
    await mockAuthenticatedRequester(page, { forwardUnmatched: false });
    await setupApiMocks(page);
    await page.goto('/portal');
    await assertPageIsCleanEnglish(page);
  });
});
