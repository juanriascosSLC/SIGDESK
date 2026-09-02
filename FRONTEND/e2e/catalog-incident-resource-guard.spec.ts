import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

test('un INC sin vínculo de recurso se detiene antes de enviar un 4xx al backend', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route((url) => url.pathname === '/catalog/definitions/INC', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'inc-without-resource',
        entityKey: 'INC',
        name: 'Incidente',
        version: 1,
        status: 'published',
        specification: {
          fields: [
            { key: 'title', label: 'Título', type: 'text', required: false },
            { key: 'requester', label: 'Responsable IT', type: 'text', required: false, bindsTo: 'agenteItId' },
          ],
          createPage: {
            default: {
              header: { columns: 12, placements: [{ id: 'header', kind: 'widget', widgetKey: 'formHeader', column: 0, columnSpan: 12, row: 0 }] },
              main: { columns: 12, placements: [{ id: 'title', kind: 'field', source: 'catalog', fieldKey: 'title', column: 0, columnSpan: 12, row: 0 }] },
              sidebar: { columns: 12, placements: [] },
              actions: { columns: 12, placements: [{ id: 'actions', kind: 'widget', widgetKey: 'formActions', column: 0, columnSpan: 12, row: 0 }] },
              footer: { columns: 12, placements: [] },
              sidebarColumns: 4,
            },
          },
          lifecycle: { states: [{ key: 'open', label: 'Abierto', initial: true }], transitions: [] },
        },
      }),
    });
  });

  let attemptedCreate = false;
  await page.route((url) => url.pathname === '/entities/INC', async (route) => {
    attemptedCreate = true;
    await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'should not be called' }) });
  });

  await page.goto('/app/catalog/INC');
  await expect(page.getByTestId('catalog-input-title')).toBeVisible();
  await page.getByRole('button', { name: 'Crear INC', exact: true }).click();

  await expect(page.getByText('Esta definición de INC no tiene un campo de recurso o CMDB.', { exact: false })).toBeVisible();
  expect(attemptedCreate).toBe(false);
});
