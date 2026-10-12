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
  workflowKey: 'services_field_work',
  workType: 'field_work_order',
  outcomeCode: '',
  notes: [],
  status: 'ready',
  dependencyIds: [],
  dueAt: '2026-09-12T18:00:00Z',
  blockedReason: '',
  evidence: [],
  createdBy: 'user-2',
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
  completedAt: null,
  scheduledStart: '2026-09-12T17:00:00Z',
  scheduledEnd: '2026-09-12T18:00:00Z',
  scheduledBy: 'user-2',
  revision: 1,
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

async function stubServicesDomain(page: Page, taskSeed: typeof serviceTask = serviceTask, onTransition?: (body: Record<string, unknown>) => void) {
  let currentTask = structuredClone(taskSeed) as Omit<typeof serviceTask, 'status' | 'evidence' | 'notes' | 'outcomeCode' | 'blockedReason'> & {
    status: string;
    evidence: string[];
    notes: string[];
    outcomeCode: string;
    blockedReason: string;
  };

  await page.route('**/notifications*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route(/\/changes\/tasks\/assigned(?:\/[^/?]+)?(?:\?.*)?$/, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === '/changes/tasks/assigned'
      ? { items: [{ task: currentTask, change }, { task: otherDepartmentTask, change }] }
      : { task: currentTask, change };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/changes/change-1/tasks/task-services-1/transitions/*', async (route) => {
    const key = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = route.request().postDataJSON() as { evidence?: string[]; notes?: string[]; outcomeCode?: string; reason?: string; collectedData?: Record<string, unknown> };
    onTransition?.(body);
    const status = key === 'start' ? 'in_progress' : key === 'complete' ? 'completed' : key === 'block' ? 'blocked' : 'ready';
    currentTask = {
      ...currentTask,
      status,
      evidence: body.evidence ?? currentTask.evidence,
      notes: body.notes ?? currentTask.notes,
      outcomeCode: body.outcomeCode ?? currentTask.outcomeCode,
      blockedReason: body.reason ?? '',
      ...(key === 'start' && !currentTask.assigneeUserId
        ? { assigneeUserId: 'playwright-warehouse', assigneeName: 'Playwright Warehouse', assigneeId: 'Playwright Warehouse' }
        : {}),
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentTask) });
  });
  await page.route('**/changes/change-1/tasks/task-services-1/attachments', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    }
    return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ message: 'Not supported by this scenario' }) });
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
  await page.getByRole('button', { name: 'Work completed' }).click();
  await expect(page.getByRole('button', { name: 'Record governed outcome' })).toBeDisabled();
  await expect(page.getByText('Execute the approved on-site work and preserve a complete technical record.')).toBeVisible();
  await page.getByLabel('Work performed 1', { exact: true }).fill('Switch replacement completed.');
  await page.getByLabel('Completion evidence 1', { exact: true }).fill('Switch replaced; all cameras responding.');
  await page.getByRole('button', { name: 'Record governed outcome' }).click();
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

test('professional completion keeps focus while typing and supports multiple structured entries', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page, { ...serviceTask, status: 'in_progress' });
  await page.goto('/app/services/work-orders/change-1/task-services-1');
  await page.getByRole('button', { name: 'Work completed' }).click();

  const firstNote = page.getByLabel('Work performed 1', { exact: true });
  await firstNote.pressSequentially('Replaced switch and restored uplink', { delay: 5 });
  await expect(firstNote).toHaveValue('Replaced switch and restored uplink');
  await expect(firstNote).toBeFocused();

  await page.getByRole('button', { name: 'Add entry' }).first().click();
  await page.getByLabel('Work performed 2', { exact: true }).fill('Validated all downstream cameras');
  await page.getByLabel('Completion evidence 1', { exact: true }).fill('Photo set WO-001');
  await page.getByRole('button', { name: 'Add entry' }).nth(1).click();
  await page.getByLabel('Completion evidence 2', { exact: true }).fill('Monitoring graph returned to green');

  await page.getByRole('button', { name: 'Record governed outcome' }).click();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
});

test('published task-template snapshot renders custom required fields and submits their values', async ({ page }) => {
  const templatedTask = {
    ...serviceTask,
    status: 'in_progress',
    templateFamilyKey: 'services_field_work',
    templateVersion: 3,
    collectedData: {},
    taskTemplate: {
      title: 'Camera Field Restoration',
      summary: 'Capture the governed restoration measurement.',
      instructions: ['Measure signal before leaving site.'],
      fields: [
        { key: 'work_notes', label: 'Work performed', type: 'textarea', required: true, multiple: true, options: [] },
        { key: 'signal_dbm', label: 'Final signal (dBm)', type: 'number', required: true, options: [], helpText: 'Measured after restoration.' },
        { key: 'evidence', label: 'Photo evidence', type: 'attachment', required: true, multiple: true, evidence: true, options: [] },
      ],
      outcomes: [{ code: 'work_completed', label: 'Restoration completed', description: 'Field restoration succeeded.', requiredFields: ['work_notes', 'signal_dbm', 'evidence'] }],
      sections: [{ id: 'execution', title: 'Execution', fieldKeys: ['work_notes', 'signal_dbm', 'evidence'] }],
    },
  };
  let completionBody: Record<string, unknown> | undefined;
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page, templatedTask, (body) => { completionBody = body; });
  await page.goto('/app/services/work-orders/change-1/task-services-1');

  await expect(page.getByText('Camera Field Restoration')).toBeVisible();
  await page.getByRole('button', { name: 'Restoration completed' }).click();
  await expect(page.getByTestId('task-template-instructions')).toContainText('Measure signal before leaving site.');
  await expect(page.getByTestId('task-runtime-section-execution')).toContainText('Execution');
  await page.getByLabel('Work performed 1', { exact: true }).fill('Replaced and aligned the camera.');
  await page.getByLabel('Photo evidence 1', { exact: true }).fill('photo://camera-restored');
  await page.getByLabel('Final signal (dBm)').fill('-48');
  await page.getByRole('button', { name: 'Record governed outcome' }).click();

  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  expect(completionBody?.collectedData).toEqual({ signal_dbm: -48 });
});

test('field execution waits until Change Management moves the RFC to Implementing', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.route(/\/changes\/tasks\/assigned(?:\/[^/?]+)?(?:\?.*)?$/, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const item = {
      task: { ...serviceTask, workflowKey: 'services_field_work' },
      change: { ...change, state: 'approved' },
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pathname === '/changes/tasks/assigned' ? { items: [item] } : item),
    });
  });

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
  await page.getByRole('button', { name: 'Work completed' }).click();
  await page.getByLabel('Work performed 1', { exact: true }).fill('Site access obtained.');
  await page.getByLabel('Completion evidence 1', { exact: true }).fill('Access obtained and connectivity validated.');
  await page.getByRole('button', { name: 'Record governed outcome' }).click();
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

test('detail opened by humanId shows a transition immediately without reload', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  const detailReads: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/changes/tasks/assigned/')) detailReads.push(pathname);
  });

  await page.goto('/app/services/work-orders/change-1/TSK-000101');
  await expect(page.getByText('Ready to start', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start work' }).click();

  // The new status must come from the cache entry rendering this page (keyed
  // by the humanId in the URL), not from a reload or a second detail read.
  await expect(page.getByText('In progress', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Work completed' })).toBeVisible();
  expect(detailReads).toEqual(['/changes/tasks/assigned/TSK-000101']);
});

test('scheduling resolves its field Work Order directly instead of scanning the bounded list', async ({ page }) => {
  const schedulingTask = {
    ...serviceTask,
    id: 'task-schedule-1',
    humanId: 'TSK-000100',
    title: 'Schedule field visit',
    workflowKey: 'services_schedule',
    workType: 'service_scheduling',
    status: 'in_progress',
    scheduledStart: null,
    scheduledEnd: null,
    scheduledBy: '',
  };
  let fieldWorkTask = { ...serviceTask, status: 'pending', scheduledStart: null as string | null, scheduledEnd: null as string | null, scheduledBy: '' };
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  let listReads = 0;
  const relatedReads: string[] = [];
  await page.route(/\/changes\/tasks\/assigned(?:\/.*)?(?:\?.*)?$/, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/changes/tasks/assigned') {
      listReads += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    }
    if (pathname === '/changes/tasks/assigned/task-schedule-1') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: schedulingTask, change }) });
    }
    if (pathname === '/changes/tasks/assigned/task-schedule-1/related/services_field_work') {
      relatedReads.push(pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: fieldWorkTask, change }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NO_ENCONTRADO', message: 'Not found' }) });
  });
  await page.route('**/changes/change-1/tasks/task-services-1/schedule', async (route) => {
    const body = route.request().postDataJSON() as { start: string; end: string };
    fieldWorkTask = { ...fieldWorkTask, scheduledStart: body.start, scheduledEnd: body.end, scheduledBy: 'admin' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fieldWorkTask) });
  });

  await page.goto('/app/services/work-orders/change-1/task-schedule-1');
  await page.getByLabel('Start', { exact: true }).fill('2026-10-12T09:00');
  await page.getByLabel('End', { exact: true }).fill('2026-10-12T11:00');
  await page.getByRole('button', { name: 'Schedule field work' }).click();

  await expect(page.getByText('The field Work Order was scheduled.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Schedule field work' })).toHaveCount(0);
  expect(relatedReads.length).toBeGreaterThanOrEqual(2);
  expect(listReads).toBe(0);
});

test('work order cards label generic work as an operational task and typed work by its stage', async ({ page }) => {
  const genericTask = { ...serviceTask, id: 'task-generic-1', humanId: 'TSK-000301', title: 'Inspect cabinet seals', workflowKey: '', workType: 'generic' };
  const restorationTask = { ...serviceTask, id: 'task-restoration-1', humanId: 'TSK-000302', title: 'Confirm cameras recover', workflowKey: '', workType: 'restoration_validation' };
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await stubServicesDomain(page);
  await page.route(/\/changes\/tasks\/assigned(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [{ task: genericTask, change }, { task: serviceTask, change }, { task: restorationTask, change }] }),
  }));

  await page.goto('/app/services');

  const card = (id: string) => page.getByTestId(`service-work-order-${id}`);
  await expect(card('task-generic-1').getByText('Operational task', { exact: true })).toBeVisible();
  await expect(card('task-services-1').getByText('Field execution', { exact: true })).toBeVisible();
  await expect(card('task-services-1').getByText('Operational task', { exact: true })).toHaveCount(0);
  await expect(card('task-restoration-1').getByText('Technical validation', { exact: true })).toBeVisible();
  await expect(card('task-restoration-1').getByText('Operational task', { exact: true })).toHaveCount(0);
});
