import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { canonicalUntriagedIncidentCycle, setupThemeTestMocks } from './theme-test-support';

// Contract for GET /entities/INC/{id}/operational-cycle (tickets_service):
// `triage` is always present. An incident without a persisted triage row —
// historical records included — gets the canonical untriaged record from
// domain.NewIncidentTriage. These tests pin both shapes and prove that a
// response violating the contract is reported, never rendered as invented
// triage data and never allowed to crash the Ticket Detail screen.

async function openTicketWithCycle(page: Page, cycle: unknown) {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await setupThemeTestMocks(page);
  await page.route(/\/entities\/INC\/1\/operational-cycle$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(cycle),
  }));
  await page.goto('/app/tickets/1');
}

test('a historical incident without a persisted triage row shows the canonical untriaged state', async ({ page }) => {
  await openTicketWithCycle(page, canonicalUntriagedIncidentCycle(1));

  const panel = page.getByTestId('incident-operational-cycle');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('IT 1 claim required')).toBeVisible();
  await expect(panel.getByText('Not a duplicate', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Could not display this screen')).toHaveCount(0);
});

test('a completely triaged incident shows its recorded duplicate decision', async ({ page }) => {
  const complete = canonicalUntriagedIncidentCycle(1);
  complete.triage = {
    ...complete.triage,
    claimedByUserId: 'it1-user',
    claimedDepartmentId: 'it',
    claimedTeamId: 'it1',
    claimedAt: '2026-09-01T09:00:00Z',
    duplicateDecision: 'not_duplicate',
    decidedByUserId: 'it1-user',
    decidedAt: '2026-09-01T09:05:00Z',
    revision: 3,
  };
  await openTicketWithCycle(page, complete);

  const panel = page.getByTestId('incident-operational-cycle');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Not a duplicate', { exact: true })).toBeVisible();
  await expect(panel.getByText('IT 1 claim required')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Duplicate of another incident' })).toHaveCount(0);
});

test('a lifecycle response without triage is reported instead of crashing Ticket Detail', async ({ page }) => {
  const { triage: _omitted, ...withoutTriage } = canonicalUntriagedIncidentCycle(1);
  void _omitted;
  await openTicketWithCycle(page, withoutTriage);

  await expect(page.getByText('Incident lifecycle is unavailable')).toBeVisible();
  await expect(page.getByText('The incident lifecycle response is missing its triage record.')).toBeVisible();
  await expect(page.getByTestId('incident-operational-cycle')).toHaveCount(0);
  await expect(page.getByText('Could not display this screen')).toHaveCount(0);
});
