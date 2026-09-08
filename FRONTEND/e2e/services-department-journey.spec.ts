import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('nav exposes Services, and the full journey stays inside /app/services', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });

  await page.goto('/app');
  await page.locator('#app-nav').getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/\/app\/services$/);

  await page.getByTestId('services-ticket-row-srv-1001').click();
  await expect(page).toHaveURL(/\/app\/services\/tickets\/srv-1001/);
  // Unambiguous: the page title is unique, unlike "Requires Action" (which
  // also appears as the KPI tile label back on the dashboard) — asserting
  // on it first proves SrvDetail actually mounted before checking its pill.
  await expect(page.getByRole('heading', { name: 'Elevator inspection — 15ft ladder required' })).toBeVisible();
  await expect(page.getByTestId('srv-equipment-checklist').getByText('Missing')).toBeVisible();

  await page.getByRole('option', { name: /Ironclad Facilities Services/ }).click();
  await expect(page.getByRole('option', { name: /Ironclad Facilities Services/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.goto('/app/services/dealerships/dealership-atl-01');
  await expect(page.getByText('Elevator lift intermittent fault')).toBeVisible();
});
