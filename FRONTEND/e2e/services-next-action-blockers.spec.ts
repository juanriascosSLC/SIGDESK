import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('the status pill in the header reflects the ticket\'s real status', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByText('Requires Action')).toBeVisible();
});

test('a missing equipment item surfaces as a page-level blocker banner, and the primary action is enabled', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByText('Missing equipment is blocking dispatch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resolve blockers' })).toBeEnabled();
});

test('a ticket with no missing equipment shows no blocker banner, and the primary action is disabled', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByText('Missing equipment is blocking dispatch')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resolve blockers' })).toBeDisabled();
});
