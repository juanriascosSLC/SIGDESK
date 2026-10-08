import { expect, test } from '@playwright/test';
import { mockAuthenticatedTaskExecutor } from './support';

// The Services card shows the deadline whenever dueAt exists, classified as
// overdue, due soon (within 24 hours) or future, and says "No deadline" only
// when dueAt is genuinely absent. Offsets are relative to the real clock and
// chosen away from rounding boundaries of formatRelativeTime.

const HOUR = 60 * 60 * 1000;

function workOrder(id: string, humanId: string, dueAt: string | null) {
  return {
    task: {
      id,
      humanId,
      changeId: 'change-deadlines',
      title: `Work order ${humanId}`,
      description: '',
      area: 'Services',
      team: 'Field Services',
      assigneeId: 'user-1',
      departmentId: 'department-services',
      teamId: 'team-services',
      assigneeUserId: 'user-1',
      assigneeName: 'Alex Morgan',
      organization: {
        departmentId: 'department-services', departmentName: 'Services',
        teamId: 'team-services', teamName: 'Field Services',
        assigneeUserId: 'user-1', assigneeName: 'Alex Morgan',
        assigneeEmail: 'alex@sig.systems', capturedAt: '2026-09-10T10:00:00Z',
      },
      priority: 'high',
      required: true,
      workflowKey: 'services_field_work',
      workType: 'field_work_order',
      outcomeCode: '',
      notes: [],
      status: 'ready',
      dependencyIds: [],
      dueAt,
      blockedReason: '',
      evidence: [],
      createdBy: 'user-2',
      createdAt: '2026-09-10T10:00:00Z',
      updatedAt: '2026-09-10T10:00:00Z',
      completedAt: null,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledBy: '',
      revision: 1,
    },
    change: { id: 'change-deadlines', humanId: 'RFC-000070', state: 'implementing', title: 'Deadline presentation' },
  };
}

test('work order cards distinguish overdue, due-soon, future and absent deadlines', async ({ page }) => {
  const now = Date.now();
  const items = [
    workOrder('task-overdue', 'TSK-000201', new Date(now - 2 * HOUR).toISOString()),
    workOrder('task-due-soon', 'TSK-000202', new Date(now + 3 * HOUR).toISOString()),
    workOrder('task-future', 'TSK-000203', new Date(now + 10 * 24 * HOUR).toISOString()),
    workOrder('task-no-deadline', 'TSK-000204', null),
  ];
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await page.route('**/notifications*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route(/\/changes\/tasks\/assigned(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) }));

  await page.goto('/app/services');

  const deadline = (id: string) => page.getByTestId(`service-work-order-${id}`).getByTestId('work-order-deadline');

  await expect(deadline('task-overdue')).toHaveText('Overdue 2 hours ago');
  await expect(deadline('task-overdue')).toHaveAttribute('data-attention', 'overdue');

  await expect(deadline('task-due-soon')).toHaveText('Due in 3 hours');
  await expect(deadline('task-due-soon')).toHaveAttribute('data-attention', 'due-soon');

  await expect(deadline('task-future')).toHaveText('Due in 10 days');
  await expect(deadline('task-future')).toHaveAttribute('data-attention', 'on-track');

  await expect(deadline('task-no-deadline')).toHaveText('No deadline');
  await expect(deadline('task-no-deadline')).toHaveAttribute('data-attention', 'none');
  for (const id of ['task-overdue', 'task-due-soon', 'task-future']) {
    await expect(page.getByTestId(`service-work-order-${id}`).getByText('No deadline')).toHaveCount(0);
  }
});
