import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

/**
 * Step 7: the 6-stage progress projection, variant S2.
 *
 * Read-only by design, and three distinct meanings (returned / unconfirmed /
 * plain progress) must stay visually distinct — none of them reusing the amber
 * ⚠ that already means "could not validate this equipment item".
 */

test('shows the six stages with the current one marked for assistive tech', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  const stepper = page.getByTestId('srv-status-stepper');
  await expect(stepper).toBeVisible();
  await expect(stepper.locator('li')).toHaveCount(6);

  // srv-1001 sits at Equipment: two done behind it, three pending ahead.
  await expect(page.getByTestId('srv-stage-equipment')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('srv-stage-diagnosis')).toHaveAttribute('data-stage-state', 'done');
  await expect(page.getByTestId('srv-stage-approval')).toHaveAttribute('data-stage-state', 'done');
  await expect(page.getByTestId('srv-stage-scheduling')).toHaveAttribute('data-stage-state', 'pending');
});

test('the stepper is a read-only projection, not a set of controls', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  // No step is a button or a link: this projects state, it never transitions it.
  const stepper = page.getByTestId('srv-status-stepper');
  await expect(stepper.locator('button')).toHaveCount(0);
  await expect(stepper.locator('a')).toHaveCount(0);
});

test('Next Action copy comes from the stage, and missing equipment still wins', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  // srv-1001 has a missing item, so PR1's blocker behaviour takes precedence
  // over the per-stage copy — the blocker is the more urgent truth.
  await expect(page.getByTestId('srv-next-action-button')).toHaveText('Resolve blockers');
  await expect(page.getByTestId('srv-next-action-button')).toBeEnabled();
});

test('the primary action is disabled and names who we are waiting on', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');

  // srv-1002 sits at Approval, waiting on someone else. A primary button that
  // looked actionable here would be lying about who can act.
  await expect(page.getByTestId('srv-stage-approval')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('srv-next-action-button')).toBeDisabled();
  await expect(page.getByTestId('srv-next-action-description')).toContainText(
    'Waiting on the Services approver',
  );
});

test('a returned visit rewinds the stepper and banners the reversal', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1003');

  // Returned is a REVERSAL, not a 7th stage: still six steps, and the current
  // one is the stage to redo.
  await expect(page.getByTestId('srv-status-stepper').locator('li')).toHaveCount(6);
  await expect(page.getByTestId('srv-stage-diagnosis')).toHaveAttribute(
    'data-stage-state',
    'returned',
  );
  await expect(page.getByTestId('srv-stepper-returned-banner')).toBeVisible();
  await expect(page.getByTestId('srv-stepper-returned-banner')).toContainText('Returned by IT');
});

test('the returned banner is visible on load, never behind a tab', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1003');

  // Blockers are never hidden behind interaction (design-rules R-6).
  await expect(page.getByTestId('srv-stepper-returned-banner')).toBeInViewport();
});
