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

test('the Team tab shows team-scoped tickets but not unassigned ones', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await page.getByRole('tab', { name: 'Team' }).click();
  // srv-1001 (assignedScope: 'mine') and srv-1002 (assignedScope: 'team')
  // both show under Team (mine ⊂ team ⊂ all); srv-error-demo
  // (assignedScope: 'unassigned') only shows under All.
  await expect(page.getByTestId('services-ticket-row-srv-1001')).toBeVisible();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toBeVisible();
  await expect(page.getByTestId('services-ticket-row-srv-error-demo')).toHaveCount(0);
});

test('a KPI filter with zero matching tickets shows the empty state, not a blank list', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  // Default scope is "mine" (only srv-1001); no mock ticket has status
  // 'ready'/'equipment_delivered', so this KPI always yields zero rows.
  await page.getByTestId('services-kpi-ready').click();
  await expect(page.getByText('No tickets in this view')).toBeVisible();
});

test('clicking a ticket row navigates to its SRV detail', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await page.getByTestId('services-ticket-row-srv-1001').click();
  await expect(page).toHaveURL(/\/app\/services\/tickets\/srv-1001/);
});
