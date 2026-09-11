import { expect, test, type Page } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockAuthenticatedRequesterWithAssets,
  mockAuthenticatedTaskExecutor,
} from './support';

const serviceTask = {
  id: 'task-services-1',
  humanId: 'TSK-000101',
  changeId: 'change-1',
  title: 'Replace edge switch',
  description: 'Replace the failed switch and validate camera connectivity.',
  area: 'Servicios',
  team: 'Field Services',
  assigneeId: 'user-1',
  departmentId: 'department-services',
  teamId: 'team-services',
  assigneeUserId: 'user-1',
  assigneeName: 'Alex Morgan',
  organization: {
    departmentId: 'department-services',
    departmentName: 'Services',
    teamId: 'team-services',
    teamName: 'Field Services',
    assigneeUserId: 'user-1',
    assigneeName: 'Alex Morgan',
    assigneeEmail: 'alex@sig.systems',
    capturedAt: '2026-09-10T10:00:00Z',
  },
  priority: 'high',
  required: true,
  status: 'ready',
  dependencyIds: [],
  dueAt: '2026-09-12T18:00:00Z',
  blockedReason: '',
  evidence: [],
  createdBy: 'user-2',
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
  completedAt: null,
  assetContext: {
    siteAssetId: 'site-1',
    links: [{ assetId: 'switch-1', role: 'affected', snapshot: { displayName: 'Core Switch 01', assetType: 'switch', serial: 'SW-001', siteAssetId: 'site-1' } }],
  },
};

const otherDepartmentTask = {
  ...serviceTask,
  id: 'task-inventory-1',
  humanId: 'TSK-000102',
  title: 'Validate warehouse stock',
  area: 'Inventory',
  organization: { ...serviceTask.organization, departmentId: 'department-inventory', departmentName: 'Inventory' },
};

const change = { id: 'change-1', humanId: 'RFC-000050', state: 'implementing', title: 'Restore connectivity at North Site' };

async function stubServicesDomain(page: Page, taskSeed: typeof serviceTask = serviceTask) {
  let currentTask = structuredClone(taskSeed) as Omit<typeof serviceTask, 'status' | 'evidence' | 'blockedReason'> & {
    status: string;
    evidence: string[];
    blockedReason: string;
  };

  await page.route('**/notifications*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route('**/changes/tasks/assigned*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ task: currentTask, change }, { task: otherDepartmentTask, change }] }) }));
  await page.route('**/changes/change-1/tasks/task-services-1/transitions/*', async (route) => {
    const key = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = route.request().postDataJSON() as { evidence?: string[]; reason?: string };
    const status = key === 'start' ? 'in_progress' : key === 'complete' ? 'completed' : key === 'block' ? 'blocked' : 'ready';
    currentTask = {
      ...currentTask,
      status,
      evidence: body.evidence ?? currentTask.evidence,
      blockedReason: body.reason ?? '',
      ...(key === 'start' && !currentTask.assigneeUserId
        ? { assigneeUserId: 'playwright-warehouse', assigneeName: 'Playwright Warehouse', assigneeId: 'Playwright Warehouse' }
        : {}),
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentTask) });
  });

  await page.route('**/assets/sites*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'site-1', sourceSystem: 'sig_inventory', externalEntity: 'site', externalId: '101', externalKey: 'NORTH-101', kind: 'site', assetType: 'site', displayName: 'North Service Site', lifecycle: 'active', attributes: { address: '100 Main St', city: 'Atlanta' }, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false }], hasMore: false, stale: false }) }));
  await page.route('**/assets/sites/site-1/assets*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [
    { id: 'camera-1', sourceSystem: 'sig_inventory', externalEntity: 'camera', externalId: '1', externalKey: 'CAM-1', kind: 'device', siteAssetId: 'site-1', assetType: 'camera', displayName: 'Camera 01', lifecycle: 'active', serial: 'CAM-001', model: 'DS-2CD', ipAddress: '10.0.0.10', attributes: {}, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false },
    { id: 'switch-1', sourceSystem: 'sig_inventory', externalEntity: 'switch', externalId: '2', externalKey: 'SW-1', kind: 'device', siteAssetId: 'site-1', assetType: 'switch', displayName: 'Core Switch 01', lifecycle: 'active', serial: 'SW-001', model: 'C9300', ipAddress: '10.0.0.2', attributes: {}, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false },
    { id: 'pdu-1', sourceSystem: 'sig_inventory', externalEntity: 'pdu', externalId: '3', externalKey: 'PDU-1', kind: 'device', siteAssetId: 'site-1', assetType: 'pdu', displayName: 'Rack PDU', lifecycle: 'active', serial: 'PDU-001', attributes: {}, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false },
    { id: 'router-1', sourceSystem: 'sig_inventory', externalEntity: 'router', externalId: '4', externalKey: 'RTR-1', kind: 'device', siteAssetId: 'site-1', assetType: 'router', displayName: 'WAN Router', lifecycle: 'active', serial: 'RTR-001', attributes: {}, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false },
    { id: 'nvr-1', sourceSystem: 'sig_inventory', externalEntity: 'nvr', externalId: '5', externalKey: 'NVR-1', kind: 'system', siteAssetId: 'site-1', assetType: 'nvr', displayName: 'Video Recorder', lifecycle: 'active', serial: 'NVR-001', attributes: {}, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false },
    { id: 'server-1', sourceSystem: 'sig_inventory', externalEntity: 'server', externalId: '6', externalKey: 'SERVER-1', kind: 'device', siteAssetId: 'site-1', assetType: 'server', displayName: 'Recording Server', lifecycle: 'active', serial: 'SERVER-001', attributes: {}, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false },
  ], hasMore: false, stale: false }) }));
  await page.route('**/assets/site-1', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'site-1', sourceSystem: 'sig_inventory', externalEntity: 'site', externalId: '101', externalKey: 'NORTH-101', kind: 'site', assetType: 'site', displayName: 'North Service Site', lifecycle: 'active', attributes: { address: '100 Main St', city: 'Atlanta' }, lastSyncedAt: '2026-09-10T12:00:00Z', deleted: false }) }));
  await page.route('**/entities/INC*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: '10', humanId: 'INC-000010', title: 'Camera offline' }], hasMore: false }) }));
  await page.route('**/problems/by-asset-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'prb-1', humanId: 'PRB-000020', data: { title: 'Recurring camera outage' }, associationPath: 'via_incident', viaHumanId: 'INC-000010' }], resolvedByRfcRefs: [{ rfcHumanId: 'RFC-000050', viaProblemHumanId: 'PRB-000020' }] }) }));
  await page.route('**/changes/by-asset-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'change-1', humanId: 'RFC-000050', data: { title: 'Restore connectivity' }, associationPath: 'via_problem' }] }) }));
}

test('task-only Services operator sees real work orders but not tasks from another department', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.goto('/app/services');

  await expect(page.getByRole('heading', { name: 'Services operations' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'My full scope' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('service-work-order-task-services-1')).toBeVisible();
  await expect(page.getByText('TSK-000102')).toHaveCount(0);
  await expect(page.getByText('Alex Morgan')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Sites' })).toHaveCount(0);
});

test('work order executes the real task lifecycle and requires completion evidence', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.goto('/app/services/work-orders/change-1/task-services-1');

  await page.getByRole('button', { name: 'Start work' }).click();
  await expect(page.getByText('In progress', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete with evidence' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Complete', exact: true })).toBeDisabled();
  await dialog.getByLabel('Evidence or result').fill('Switch replaced; all cameras responding.');
  await dialog.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Switch replaced; all cameras responding.')).toBeVisible();
});

test('starting team-directed work claims it for the current Services operator', async ({ page }) => {
  const teamTask = {
    ...serviceTask,
    assigneeId: '',
    assigneeUserId: '',
    assigneeName: '',
    organization: {
      ...serviceTask.organization,
      assigneeUserId: '',
      assigneeName: '',
      assigneeEmail: '',
    },
  };
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await stubServicesDomain(page, teamTask);
  await page.goto('/app/services/work-orders/change-1/task-services-1');

  await expect(page.getByText('Starting this work order assigns it to you')).toBeVisible();
  await expect(page.getByText('Team assignment')).toBeVisible();
  await page.getByRole('button', { name: 'Start work' }).click();

  await expect(page.getByText('Playwright Warehouse')).toBeVisible();
  await expect(page.getByText('playwright-warehouse', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Starting this work order assigns it to you')).toHaveCount(0);
});

test('field execution waits until Change Management moves the RFC to Implementing', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.route('**/changes/tasks/assigned*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        task: { ...serviceTask, workflowKey: 'services_field_work' },
        change: { ...change, state: 'approved' },
      }],
    }),
  }));

  await page.goto('/app/services/work-orders/change-1/task-services-1');

  await expect(page.getByText(/cannot start until Change Management moves the source RFC to Implementing/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start work' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open RFC' })).toHaveAttribute('href', '/app/changes/RFC-000050');
});

test('work order can be blocked, resumed, completed, and reopened through backend transitions', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.goto('/app/services/work-orders/change-1/task-services-1');

  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Report blocker' }).click();
  await page.getByLabel('Reason for blocking').fill('Waiting for site access.');
  await page.getByRole('dialog').getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByText('Current blocker')).toBeVisible();
  await page.getByRole('button', { name: 'Clear blocker' }).click();
  await expect(page.getByText('Ready to start', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start work' }).click();
  await expect(page.getByText('In progress', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete with evidence' }).click();
  await page.getByLabel('Evidence or result').fill('Access obtained and connectivity validated.');
  await page.getByRole('dialog').getByRole('button', { name: 'Complete', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.getByText('Ready to start', { exact: true })).toBeVisible();
});

test('Services site combines real equipment, work orders, and INC/PRB/RFC history', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.goto('/app/services');
  await page.getByRole('tab', { name: 'Sites' }).click();
  await page.getByTestId('service-site-site-1').click();

  await expect(page.getByRole('heading', { name: 'North Service Site' })).toBeVisible();
  await expect(page.getByText('Camera 01')).toBeVisible();
  await expect(page.getByText('Core Switch 01')).toBeVisible();
  await expect(page.getByText('Rack PDU')).toBeVisible();
  await expect(page.getByText('WAN Router')).toBeVisible();
  await expect(page.getByText('Video Recorder')).toBeVisible();
  await expect(page.getByText('Recording Server')).toBeVisible();
  await expect(page.getByTestId('service-work-order-task-services-1')).toBeVisible();
  await expect(page.getByRole('link', { name: /INC-000010/ })).toHaveAttribute('href', '/app/tickets/10');
  await expect(page.getByRole('link', { name: /PRB-000020/ })).toHaveAttribute('href', '/app/problems/PRB-000020');
  await expect(page.getByRole('link', { name: 'RFC-000050 · Restore connectivity' })).toHaveAttribute('href', '/app/changes/RFC-000050');
});

test('assets-only user enters Services directly and sees sites without work-order data', async ({ page }) => {
  await mockAuthenticatedRequesterWithAssets(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.goto('/app/services');

  await expect(page.getByRole('heading', { name: 'Services operations' })).toBeVisible();
  await expect(page.getByTestId('service-site-site-1')).toBeVisible();
  await expect(page.getByText('Service work orders are RFC tasks')).toHaveCount(0);
});

test('Services shows a recoverable error instead of fabricated fallback data', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await page.route('**/notifications*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route('**/changes/tasks/assigned*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Change service unavailable' }) }));
  await page.goto('/app/services');

  await expect(page.getByRole('heading', { name: 'Service temporarily unavailable' })).toBeVisible();
  await expect(page.getByTestId(/^service-work-order-/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
