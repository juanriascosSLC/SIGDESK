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

test('KPI tiles actually scroll horizontally below the sm breakpoint, not just wrap into a static grid', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/app/services');
  const row = page.getByTestId('services-kpi-requires-action').locator('..');
  // A static 2x2 grid (the original, buggy implementation) has
  // scrollWidth === clientWidth — nothing to scroll. The 4 tiles at
  // w-[45%] each in a flex row genuinely overflow.
  const { scrollWidth, clientWidth } = await row.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});
