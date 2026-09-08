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

test('a broken SRV ticket shows ErrorState with a visible retry, not a silent blank page', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  // srv-error-demo is a deliberate mock-data sentinel (mockData.ts) that
  // always rejects — the only way SrvDetail's ticketQuery.isError branch
  // is ever exercised, since every "real" mock ticket resolves. SrvDetail's
  // page-level ErrorState has no explicit title (unlike the panel-level
  // ones), so this falls through to describeError's generic copy.
  await page.goto('/app/services/tickets/srv-error-demo');
  await expect(page.getByText('Something went wrong')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
