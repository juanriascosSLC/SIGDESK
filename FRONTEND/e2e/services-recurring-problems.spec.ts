import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('shows the recurring problems list for a dealership with open problems', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/dealerships/dealership-atl-01');
  await expect(page.getByText('Elevator lift intermittent fault')).toBeVisible();
  await expect(page.getByText('Bay door sensor misaligned')).toBeVisible();
});

test('shows a reassuring empty state for a dealership with no open problems', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/dealerships/dealership-chg-01');
  await expect(page.getByTestId('recurring-problems-empty')).toContainText(
    'Sin otros problemas abiertos en este dealership',
  );
});

test('shows an error state with retry for a dealership whose history fails to load', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/dealerships/dealership-error-demo');
  await expect(page.getByText('No se pudo cargar el historial de este sitio')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
