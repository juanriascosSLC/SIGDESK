import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

test('SIG Assistant responde el último INC de un sitio con consulta estructurada', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const siteId = '11111111-1111-1111-1111-111111111111';
  let ragCalls = 0;

  await page.route('**/assets/sites?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        id: siteId, sourceSystem: 'sig_inventory', externalEntity: 'site', externalId: '3281',
        externalKey: 'AS-3281', kind: 'site', assetType: 'site', displayName: 'AS 3281 Storage Lot',
        lifecycle: 'active', attributes: {}, lastSyncedAt: '2026-09-02T12:00:00Z', deleted: false,
      }],
      hasMore: false,
      stale: false,
    }),
  }));
  await page.route((url) => url.pathname === '/entities/INC' && url.searchParams.get('assetId') === siteId, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [
        {
          id: '41', humanId: 'INC-000041', entityKey: 'INC', state: 'resuelto',
          data: { title: 'Ticket anterior' }, prioridad: 'media', createdAt: '2026-08-30T10:00:00Z',
        },
        {
          id: '42', humanId: 'INC-000042', entityKey: 'INC', state: 'en_progreso',
          data: { title: 'Cámara sin señal' }, prioridad: 'alta', createdAt: '2026-09-01T12:00:00Z',
        },
      ],
      hasMore: false,
    }),
  }));
  await page.route('**/ia_advisor/chat', (route) => {
    ragCalls += 1;
    return route.fulfill({ status: 500, body: '{}' });
  });

  await page.goto('/app');
  await page.getByRole('button', { name: 'Abrir asistente RAG' }).click();
  await page.getByPlaceholder(/Escribe tu consulta/).fill('cual es el ultimo ticket del AS 3281 storage lot');
  await page.getByRole('button', { name: 'Enviar consulta' }).click();

  await expect(page.getByText(/INC-000042: «Cámara sin señal»/)).toBeVisible();
  await expect(page.getByText(/Estado: In Progress/)).toBeVisible();
  expect(ragCalls).toBe(0);
});
