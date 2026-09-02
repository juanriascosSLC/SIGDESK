import { test, expect } from '@playwright/test';

test.describe('Golden Path vivo SIG-Desk', () => {
  test.skip(!process.env.LIVE_E2E, 'LIVE_E2E no está habilitado');

  test('login real y acceso al catálogo', async ({ page }) => {
    const username = process.env.SIGDESK_E2E_USERNAME;
    const password = process.env.SIGDESK_E2E_PASSWORD;
    test.skip(!username || !password, 'Faltan SIGDESK_E2E_USERNAME/PASSWORD');
    await page.goto('/login');
    await page.locator('input[name="username"]').fill(username!);
    await page.locator('input[name="password"]').fill(password!);
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/app/catalog');
    await expect(page.getByText(/service catalog|catálogo/i).first()).toBeVisible();
  });
});
