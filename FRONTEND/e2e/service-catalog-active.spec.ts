import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

function definition(id: string, version: number, entityKey = 'INC') {
  return {
    id, entityKey, name: entityKey === 'INC' ? 'Incidente' : 'Problema', version, status: 'published',
    specification: {
      description: '', identity: { prefix: entityKey }, fields: [],
      lifecycle: { states: [], transitions: [] }, views: { create: [], summary: [] },
    },
  };
}

test('Service Catalog solicita activas y no duplica versiones históricas', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  let requestedActive = false;
  await page.route('**/catalog/definitions?*', (route) => {
    const url = new URL(route.request().url());
    requestedActive = url.searchParams.get('active') === 'true';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Incluye historia a propósito: verifica también la defensa del cliente
      // durante un despliegue donde el backend anterior ignore active=true.
      body: JSON.stringify({ items: [definition('inc-v9', 9), definition('inc-v8', 8), definition('prb-v1', 1, 'PRB')] }),
    });
  });

  await page.goto('/app/catalog');
  await expect(page.getByTestId('catalog-option-INC')).toHaveCount(1);
  await expect(page.getByTestId('catalog-option-PRB')).toHaveCount(1);
  await expect(page.getByTestId('catalog-option-INC')).toContainText('v9');
  expect(requestedActive).toBe(true);
});
