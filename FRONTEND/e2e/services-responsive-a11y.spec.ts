import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('KPI tiles are keyboard-activatable', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  const tile = page.getByTestId('services-kpi-requires-action');
  await tile.focus();
  await expect(tile).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('services-ticket-row-srv-1001')).toBeVisible();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toHaveCount(0);
});

test('ticket rows meet the 44px minimum touch target', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  const box = await page.getByTestId('services-ticket-row-srv-1001').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('KPI tiles collapse to a 2-column grid below the sm breakpoint', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/app/services');
  const grid = page.getByTestId('services-kpi-requires-action').locator('..');
  await expect(grid).toHaveClass(/grid-cols-2/);
});
