import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('KPI tiles filter the ticket list on click', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await expect(page.getByTestId('services-ticket-row-srv-1001')).toBeVisible();
  await page.getByTestId('services-kpi-requires-action').click();
  await expect(page.getByTestId('services-ticket-row-srv-1001')).toBeVisible();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toHaveCount(0);
});

test('scope tabs narrow the ticket list', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toBeVisible();
  await page.getByRole('tab', { name: 'My Work' }).click();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toHaveCount(0);
});

test('clicking a ticket row navigates to its SRV detail', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await page.getByTestId('services-ticket-row-srv-1001').click();
  await expect(page).toHaveURL(/\/app\/services\/tickets\/srv-1001/);
});
