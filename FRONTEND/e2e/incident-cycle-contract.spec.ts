import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { canonicalUntriagedIncidentCycle, setupThemeTestMocks } from './theme-test-support';
import type { IncidentOperationalCycle } from '../src/features/tickets/types';

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

test('IT 1 completion captures a structured diagnostic report instead of generic notes', async ({ page }) => {
  const cycle = canonicalUntriagedIncidentCycle(1) as unknown as IncidentOperationalCycle;
  cycle.triage = {
    ...cycle.triage,
    claimedByUserId: '00000000-0000-0000-0000-000000000001',
    claimedDepartmentId: '00000000-0000-0000-0000-000000000010',
    claimedTeamId: '00000000-0000-0000-0000-000000000011',
    claimedAt: '2026-09-01T09:00:00Z', duplicateDecision: 'not_duplicate',
    decidedByUserId: '00000000-0000-0000-0000-000000000001', decidedAt: '2026-09-01T09:01:00Z', revision: 3,
  };
  cycle.workItems = [{
    id: 91, ticketId: 1, workKey: 'it1_remote_troubleshooting', kind: 'it1_remote_troubleshooting',
    workType: 'it1_remote_troubleshooting', title: 'IT 1 remote troubleshooting', instructions: 'Diagnose remotely.',
    status: 'in_progress', required: true, createdByType: 'service', createdById: 'workflow_service',
    startedById: '00000000-0000-0000-0000-000000000001', assigneeUserId: '00000000-0000-0000-0000-000000000001',
    evidence: [], notes: [], revision: 2, createdAt: '2026-09-01T09:02:00Z', updatedAt: '2026-09-01T09:03:00Z',
  }];
  let submitted: Record<string, unknown> | undefined;
  await openTicketWithCycle(page, cycle);
  await page.route(/\/entities\/INC\/1\/work-items\/91\/transitions\/complete$/, async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...cycle.workItems[0], status: 'resolved', outcomeCode: 'escalate_to_it2' }) });
  });

  await page.getByRole('button', { name: 'Escalate to IT 2' }).click();
  const form = page.getByTestId('troubleshooting-diagnostic-form');
  await expect(form).toBeVisible();
  await form.getByLabel('Symptom summary').fill('Camera is unreachable from monitoring.');
  await form.getByLabel('Impact assessment').fill('Exterior security monitoring is unavailable.');
  await form.getByLabel('Affected services or components *').fill('CAM 01\nVideo surveillance');
  await page.getByRole('button', { name: 'Next' }).click();
  await form.getByLabel('Check 1 performed').fill('Ping camera management IP');
  await form.getByLabel('Check 1 status').selectOption('failed');
  await form.getByLabel('Check 1 observed result').fill('100% packet loss for five minutes');
  await page.getByRole('button', { name: 'Next' }).click();
  await form.getByLabel('Suspected root cause').fill('Network path or switch port failure');
  await form.getByLabel('Why this must continue').fill('Remote recovery actions are exhausted');
  await form.getByLabel('Recommended next action').fill('IT 2 must inspect switch telemetry and port state');
  await form.getByLabel('Evidence references *').fill('monitoring:event-42');
  await page.getByRole('button', { name: 'Save outcome' }).click();

  await expect.poll(() => submitted).toBeTruthy();
  expect(submitted?.outcomeCode).toBe('escalate_to_it2');
  expect(submitted?.notesArray).toEqual(['Remote recovery actions are exhausted']);
  expect(submitted?.troubleshootingReport).toMatchObject({
    contractVersion: 1,
    symptomSummary: 'Camera is unreachable from monitoring.',
    affectedServices: ['CAM 01', 'Video surveillance'],
    suspectedCause: 'Network path or switch port failure',
    escalationReason: 'Remote recovery actions are exhausted',
    nextAction: 'IT 2 must inspect switch telemetry and port state',
    checks: [{ category: 'connectivity', action: 'Ping camera management IP', status: 'failed', result: '100% packet loss for five minutes' }],
  });
  expect(submitted?.formData).toMatchObject({
    symptom_summary: 'Camera is unreachable from monitoring.',
    affected_services: ['CAM 01', 'Video surveillance'],
    escalation_reason: 'Remote recovery actions are exhausted',
  });
});
