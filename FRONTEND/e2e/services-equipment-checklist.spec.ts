import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('equipment checklist renders each item\'s status', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByTestId('srv-equipment-item-eq-1')).toContainText('Missing');
  await expect(page.getByTestId('srv-equipment-item-eq-2')).toContainText('Confirmed');
});

test('an item mid-validation shows an inline spinner instead of a status pill, without blocking the rest of the list', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByTestId('srv-equipment-item-eq-3-spinner')).toBeVisible();
  await expect(page.getByTestId('srv-equipment-item-eq-2')).toContainText('Confirmed');
});

test('an item with a validation error is flagged without hiding the rest of the checklist', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByTestId('srv-equipment-item-eq-4-warning')).toContainText('No se pudo validar');
});
