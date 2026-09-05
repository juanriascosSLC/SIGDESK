import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('SrvDetail shows subcontractor options for the dealership region and lets the agent pick one', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByText('Nighthawk Technologies Solutions')).toBeVisible();
  await page.getByRole('option', { name: /Ironclad Facilities Services/ }).click();
  await expect(page.getByRole('option', { name: /Ironclad Facilities Services/ })).toHaveAttribute('aria-selected', 'true');
});

test('SubcontractorPicker shows a request-coverage empty state for a region with no coverage', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByTestId('subcontractor-picker-empty')).toContainText(
    'No hay subcontractors disponibles en esta región todavía',
  );
  await expect(page.getByTestId('subcontractor-request-coverage')).toBeVisible();
});
