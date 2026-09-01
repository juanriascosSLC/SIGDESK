import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin, SIG_DESK_API_BASE } from './support';

test('beta: catálogo activo, formulario INC y sitios paginados funcionan juntos', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_SIGDESK_TOKEN, 'requiere backend local y PLAYWRIGHT_SIGDESK_TOKEN');
  await mockAuthenticatedAdmin(page);

  const thirdPageResponse = await request.get(`${SIG_DESK_API_BASE}/assets/sites?limit=100&cursor=200`);
  expect(thirdPageResponse.ok()).toBe(true);
  const thirdPage = await thirdPageResponse.json() as { items: Array<{ displayName: string }> };
  expect(thirdPage.items.length).toBeGreaterThan(0);
  const siteFromThirdPage = thirdPage.items[0].displayName;

  await page.goto('/app/catalog');
  await expect(page.getByTestId('catalog-option-INC')).toHaveCount(1);
  await expect(page.getByTestId('catalog-option-PRB')).toHaveCount(1);
  await expect(page.getByTestId('catalog-option-RFC')).toHaveCount(1);

  await page.getByTestId('catalog-option-INC').click();
  await expect(page.getByTestId('catalog-input-titulo')).toBeVisible();
  await expect(page.getByTestId('catalog-input-descripcion')).toBeVisible();
  const siteSearch = page.getByPlaceholder(/Buscar sitio por nombre o código/i);
  await expect(page.getByText(/de 248|entre 248 registros/)).toBeVisible();
  await siteSearch.fill(siteFromThirdPage);
  await expect(page.getByText(siteFromThirdPage, { exact: true }).first()).toBeVisible();
});
