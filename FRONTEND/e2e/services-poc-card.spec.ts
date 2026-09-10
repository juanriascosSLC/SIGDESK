import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('POCCard shows the receiving contact when one is assigned', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByTestId('poc-card')).toContainText('Marcus Webb');
});

test('POCCard shows "no POC assigned" for a dealership with none', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByTestId('poc-card-empty')).toContainText('Sin POC asignado');
  await expect(page.getByTestId('poc-request-it')).toBeVisible();
});
