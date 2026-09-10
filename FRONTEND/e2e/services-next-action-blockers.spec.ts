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

  // The assertion's INTENT is unchanged — no blocker banner, and the primary
  // action is not actionable. What changed in PR2 is the label: the Next
  // Action copy now comes from the visit's stage (spec §4) instead of always
  // reading "Resolve blockers". srv-1002 sits at Approval waiting on someone
  // else, so a button still saying "Resolve blockers" would have been naming
  // an action that does not apply here.
  await expect(page.getByTestId('srv-next-action-button')).toBeDisabled();
  await expect(page.getByTestId('srv-next-action-button')).toHaveText('Waiting on approval');
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
