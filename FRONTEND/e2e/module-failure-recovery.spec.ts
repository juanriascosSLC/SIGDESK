import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

// La etiqueta que AutomationsList muestra para la accion `asignar_automatico`.
// Se declara aqui, junto a la asercion, para que quede claro que la prueba
// comprueba lo que ve una persona y no la clave interna del contrato.
//
// El sufijo "(legado)" ya no describe la realidad: `asignar_automatico` es la
// segunda capacidad completamente funcional de Automations (ADR-0037). Cambiar
// el texto de la interfaz queda para la ronda del disenador visual; esta prueba
// solo deja de mentir sobre lo que se renderiza hoy.
const ETIQUETA_ASIGNACION_AUTOMATICA = 'Asignación automática (legado)';

test('Inventory, SLA and Automations fail visibly and recover on an explicit retry', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });

  let inventoryRecovered = false;
  await page.route('**/assets/sites?*', (route) =>
    inventoryRecovered
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{
              id: 'site-recovered', sourceSystem: 'sig_inventory', externalEntity: 'site',
              externalId: '1', externalKey: 'sig_inventory/site/1', kind: 'site', assetType: 'site',
              displayName: 'Sitio recuperado', lifecycle: 'active', attributes: {},
              lastSyncedAt: '2026-08-30T10:00:00Z', deleted: false,
            }],
            hasMore: false,
            stale: false,
          }),
        })
      : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Inventory no responde temporalmente.' }) }),
  );
  await page.route('**/assets/sites/*/assets?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], hasMore: false, stale: false }) }));

  await page.goto('/app/assets');
  await expect(page.getByTestId('assets-sites-retry')).toBeVisible();
  inventoryRecovered = true;
  await page.getByTestId('assets-sites-retry').click();
  await expect(page.getByRole('button', { name: 'Sitio recuperado' })).toBeVisible();

  let slaRecovered = false;
  await page.route('**/sla/policies', (route) =>
    slaRecovered
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
      : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'SLA no responde temporalmente.' }) }),
  );
  await page.goto('/app/settings/sla');
  await expect(page.getByTestId('sla-policies-retry')).toBeVisible();
  slaRecovered = true;
  await page.getByTestId('sla-policies-retry').click();
  await expect(page.getByTestId('sla-policies-retry')).toHaveCount(0);

  let workflowsRecovered = false;
  await page.route('**/workflows', (route) =>
    workflowsRecovered
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [{
            id: 'workflow-recovered', categoria_id: 'INC', version: 1,
            estado: 'publicado', fecha_publicacion: '2026-08-30T10:00:00Z',
            reglas: [{ id: 'rule-1', accion: 'asignar_automatico', condicion: 'prioridad = critical' }],
          }] }),
        })
      : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Workflow service no responde temporalmente.' }) }),
  );
  await page.goto('/app/automations');
  await expect(page.getByTestId('automations-retry')).toBeVisible();
  workflowsRecovered = true;
  await page.getByTestId('automations-retry').click();
  // La lista pinta la ETIQUETA de la accion, no su clave tecnica: ver
  // `actionLabels` en AutomationsList.tsx. Buscar `asignar_automatico` fallaba
  // aunque la recuperacion funcionara perfectamente.
  await expect(page.getByText(ETIQUETA_ASIGNACION_AUTOMATICA)).toBeVisible();
  await expect(page.getByText('Automatizaciones no está disponible temporalmente')).toHaveCount(0);
});

test('Automations renders workflows from the live owner service', async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_SIGDESK_TOKEN, 'Requires the local workflow_service.');
  await mockAuthenticatedAdmin(page);
  await page.goto('/app/automations');
  await expect(page.getByTestId('automations-list')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'INC' }).first()).toBeVisible();
  await expect(page.getByText(ETIQUETA_ASIGNACION_AUTOMATICA).first()).toBeVisible();
  await expect(page.getByText('Automatizaciones no está disponible temporalmente')).toHaveCount(0);
});
