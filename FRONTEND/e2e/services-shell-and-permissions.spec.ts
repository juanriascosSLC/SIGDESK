import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor, mockAuthenticatedTaskExecutor } from './support';

test('Services is reachable from the sidebar and carries the department skin on all three routes', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app');
  await page.locator('#app-nav').getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/\/app\/services$/);
  await expect(page.locator('[data-department="services"]').first()).toBeVisible();

  await page.goto('/app/services/dealerships/dealership-atl-01');
  await expect(page.locator('[data-department="services"]').first()).toBeVisible();

  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.locator('[data-department="services"]').first()).toBeVisible();
});

test('an identity without sigdesk.changes.view cannot reach /app/services', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await expect(page).not.toHaveURL(/\/app\/services/);
});

test('the Services nav link itself is hidden for an identity without sigdesk.changes.view', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await page.goto('/app');
  await expect(page.locator('#app-nav').getByRole('link', { name: 'Services' })).toHaveCount(0);
});
