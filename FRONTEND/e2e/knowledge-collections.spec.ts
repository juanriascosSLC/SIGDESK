import { expect, test } from '@playwright/test';
import { mockAuthenticatedRequester } from './support';

const articles = {
  items: [
    { articulo_id: 4, numero_visible: 'KB-000004', titulo: 'Acceder y navegar en SIG-DESK', audiencia: 'general', publicado_en: '2026-09-09T00:00:00Z', contenido: '---\ntitulo: Acceder y navegar en SIG-DESK\ncategoria: Uso de SIG-DESK\n---\n# Acceso\nInicia sesión con tu cuenta.' },
    { articulo_id: 3, numero_visible: 'KB-000003', titulo: 'Standard Operating Procedure - Inventory Shipping', audiencia: 'general', publicado_en: '2026-09-09T00:00:00Z', contenido: '---\ncategoria: Logística\n---\n# Shipping\nFollow the standard operating procedure.' },
    { articulo_id: 1, numero_visible: 'KB-000001', titulo: 'Configuración de VPN', audiencia: 'general', publicado_en: '2026-09-09T00:00:00Z', contenido: '---\ncategoria: Red\n---\n# VPN\nConnect to the corporate network.' },
    { articulo_id: 5, numero_visible: 'KB-000005', titulo: 'Service Desk lifecycle overview', audiencia: 'general', publicado_en: '2026-09-09T00:00:00Z', contenido: '---\ncategoria: Gobierno\n---\n# Lifecycle\nAn overview of ownership.' },
  ],
};

test('Knowledge Base filters its permitted articles by navigation collection', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.route('**/knowledge/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', service: 'knowledge_service' }) }));
  await page.route('**/knowledge/articulos**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(articles) }));

  await page.goto('/portal/knowledge');
  await expect(page.getByRole('tab', { name: /All knowledge/ })).toContainText('(4)');
  await expect(page.getByRole('tab', { name: /Guides/ })).toContainText('(1)');
  await expect(page.getByRole('tab', { name: /Manuals/ })).toContainText('(2)');
  await expect(page.getByRole('tab', { name: /Articles/ })).toContainText('(1)');

  await page.getByRole('tab', { name: /Manuals/ }).click();
  await expect(page.getByText('Acceder y navegar en SIG-DESK')).toBeVisible();
  await expect(page.getByText('Standard Operating Procedure - Inventory Shipping')).toBeVisible();
  await expect(page.getByText('Configuración de VPN')).toHaveCount(0);
  await expect(page.getByText('categoria: Uso de SIG-DESK')).toHaveCount(0);
});
