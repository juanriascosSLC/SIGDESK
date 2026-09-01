import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

test('opens historical definitions that predate current editor metadata', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route(
    (url) => url.pathname === '/catalog/definitions',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'inc-v4',
              entityKey: 'INC',
              name: 'Incidente',
              version: 4,
              status: 'published',
              specification: {
                fields: [
                  { key: 'titulo', label: 'Título', type: 'text', required: true },
                ],
                lifecycle: {
                  states: [{ key: 'open', label: 'Abierto', initial: true }],
                  transitions: [],
                },
              },
            },
            {
              id: 'inc-v1',
              entityKey: 'INC',
              name: 'Incidente',
              version: 1,
              status: 'published',
              specification: {
                fields: [
                  { key: 'titulo', label: 'Título', type: 'text', required: true },
                ],
              },
            },
          ],
        }),
      });
    },
  );

  await page.goto('/app/admin/catalog-builder');

  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await expect(page.getByTestId('catalog-builder-render-error')).toHaveCount(0);
  await expect(page.getByText('INC-000001', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Ver historial/ }).click();
  await page.getByRole('button', { name: /Versión 1/ }).click();

  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await expect(page.getByTestId('catalog-builder-render-error')).toHaveCount(0);
});

test('opens the live Catalog Builder without mutating published definitions', async ({ page }) => {
  test.skip(
    !process.env.PLAYWRIGHT_SIGDESK_TOKEN,
    'Requires a valid local SIG-DESK token to exercise the live backend.',
  );
  await mockAuthenticatedAdmin(page);

  await page.goto('/app/admin/catalog-builder');

  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await expect(page.getByTestId('catalog-entity-INC')).toBeVisible();
  await expect(page.getByText('INC-000001', { exact: true })).toBeVisible();
  await expect(page.getByTestId('catalog-builder-render-error')).toHaveCount(0);
});
