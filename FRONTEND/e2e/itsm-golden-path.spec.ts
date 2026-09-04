import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mockAuthenticatedAdmin, SIG_DESK_API_BASE } from './support';
import {
  definitionData,
  type Definition,
} from './catalog-support';

const apiBaseURL = SIG_DESK_API_BASE;

type Entity = {
  id: string;
  humanId: string;
  entityKey: string;
  definitionVersion: number;
  state: string;
  data: Record<string, unknown>;
  updatedAt: string;
};
type Relation = {
  id: string;
  relationKey: string;
  sourceEntityId: string;
  sourceHumanId: string;
  targetEntityId: string;
  targetHumanId: string;
  contractVersion: string;
};
type ChangeTask = {
  id: string;
  humanId: string;
  status: string;
  area: string;
  departmentId: string;
  teamId: string;
  assigneeUserId: string;
};
type AssignmentDirectory = {
  departments: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string; departmentId: string }>;
  assignees: Array<{ id: string; name: string; email: string; teamId: string }>;
};

async function jsonOrFailure<T>(
  response: APIResponse,
  operation: string,
): Promise<T> {
  expect(
    response.ok(),
    `${operation} failed (${response.status()}): ${await response.text()}`,
  ).toBeTruthy();
  return response.json() as Promise<T>;
}

async function getDefinition(
  request: APIRequestContext,
  path: string,
): Promise<Definition> {
  return jsonOrFailure<Definition>(
    await request.get(`${apiBaseURL}${path}`),
    `GET ${path}`,
  );
}

async function createEntityTwice(
  request: APIRequestContext,
  entityKey: string,
  data: Record<string, unknown>,
  idempotencyKey: string,
  extra: Record<string, unknown> = {},
): Promise<Entity> {
  const options = {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: { data, ...extra },
  };
  const firstResponse = await request.post(
    `${apiBaseURL}/entities/${entityKey}`,
    options,
  );
  const first = await jsonOrFailure<Entity>(
    firstResponse,
    `create ${entityKey}`,
  );
  const replayResponse = await request.post(
    `${apiBaseURL}/entities/${entityKey}`,
    options,
  );
  const replay = await jsonOrFailure<Entity>(
    replayResponse,
    `replay ${entityKey}`,
  );
  expect(replay.id).toBe(first.id);
  return first;
}

async function createRelationTwice(
  request: APIRequestContext,
  source: Entity,
  relationKey: string,
  target: Entity,
): Promise<Relation> {
  const url = `${apiBaseURL}/relationships/${source.entityKey}/${source.id}`;
  const data = {
    relationKey,
    targetEntityKey: target.entityKey,
    targetEntityId: target.id,
  };
  const firstResponse = await request.post(url, { data });
  const first = await jsonOrFailure<Relation>(
    firstResponse,
    `create relation ${relationKey}`,
  );
  const replayResponse = await request.post(url, { data });
  const replay = await jsonOrFailure<Relation>(
    replayResponse,
    `replay relation ${relationKey}`,
  );
  expect(replay.id).toBe(first.id);
  expect(replay.contractVersion).toBeTruthy();
  return first;
}

async function transitionChange(request: APIRequestContext, changeId: string, key: string) {
  return jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/changes/${changeId}/transitions/${key}`),
    `transition RFC via ${key}`,
  );
}

async function transitionTask(request: APIRequestContext, changeId: string, taskId: string, key: string, data: Record<string, unknown> = {}) {
  return jsonOrFailure<ChangeTask>(
    await request.post(`${apiBaseURL}/changes/${changeId}/tasks/${taskId}/transitions/${key}`, { data }),
    `transition Task via ${key}`,
  );
}

function assignmentFor(directory: AssignmentDirectory, departmentName: string) {
  const department = directory.departments.find(
    (candidate) => candidate.name.toLocaleLowerCase() === departmentName.toLocaleLowerCase(),
  );
  expect(department, `Organization must expose the ${departmentName} department`).toBeTruthy();
  const team = directory.teams.find((candidate) => candidate.departmentId === department!.id);
  expect(team, `${departmentName} must expose an operational team`).toBeTruthy();
  const assignee = directory.assignees.find((candidate) => candidate.teamId === team!.id);
  expect(assignee, `${departmentName} must expose an eligible task assignee`).toBeTruthy();
  return { department: department!, team: team!, assignee: assignee! };
}

test('executes and traces the metadata-driven INC → PRB → RFC golden path', async ({
  page,
  request,
}) => {
  const incDefinition = await getDefinition(
    request,
    '/catalog/definitions/INC',
  );
  const sites = await jsonOrFailure<{ items: Array<{ id: string }> }>(
    await request.get(`${apiBaseURL}/assets/sites?limit=1`),
    'load one CMDB site',
  );
  const siteId = sites.items[0]?.id;
  expect(siteId).toBeTruthy();
  const incData = definitionData(incDefinition, {
    title: 'E2E recurring camera outage',
    description:
      'A deterministic recurring camera outage used to validate the complete ITSM flow.',
    priority: 'critical',
    category: 'Hardware',
    requester: 'Playwright Admin',
    site: 'E2E-SITE',
    deviceType: 'camera',
    assetId: 'CAM-E2E-GOLDEN-001',
    deviceModel: 'DS-2CD2043',
    cameraChannel: 1,
  });
  const incident = await createEntityTwice(
    request,
    'INC',
    incData,
    `playwright-itsm-golden-inc-${randomUUID()}`,
    { recursoId: siteId, assetContext: { siteAssetId: siteId, links: [] } },
  );

  await expect
    .poll(
      async () =>
        (
          await request.get(
            `${apiBaseURL}/tickets/${encodeURIComponent(incident.id)}`,
          )
        ).status(),
      {
        timeout: 15_000,
        message: 'Tickets did not project the Catalog INC.',
      },
    )
    .toBe(200);

  const problemDefinition = await getDefinition(
    request,
    '/catalog/definitions/PRB',
  );
  let problem = await createEntityTwice(
    request,
    'PRB',
    definitionData(problemDefinition, {
      title: 'Recurring camera outage root cause',
      description:
        'Repeated camera disconnects require a dedicated root-cause investigation.',
      impact: 'critical',
      serviceAffected: 'E2E camera monitoring',
      owner: 'Playwright Admin',
    }),
    `playwright-itsm-golden-prb-${randomUUID()}`,
  );
  problem = await jsonOrFailure<Entity>(
    await request.patch(`${apiBaseURL}/entities/PRB/${problem.id}`, {
      data: {
        data: {
          ...problem.data,
          rootCause: 'Firmware watchdog defect confirmed across the affected cameras.',
          workaround: 'Restart the video service while the controlled RFC is implemented.',
          permanentSolution: 'Deploy the validated firmware and monitoring change.',
        },
        expectedUpdatedAt: problem.updatedAt,
      },
    }),
    'record PRB root cause and workaround',
  );
  problem = await jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/PRB/${problem.id}/transitions/mark_known_error`),
    'mark PRB as known error',
  );
  expect(problem.state).toBe('known_error');
  const investigates = await createRelationTwice(
    request,
    problem,
    'investigates',
    incident,
  );

  const changeDefinition = await getDefinition(request, '/changes/definition');
  const changeData = definitionData(
    changeDefinition,
    {
      title: 'Eliminate recurring camera outage',
      description:
        'Controlled firmware and network remediation for the recurring camera outage.',
      changeType: 'normal',
      requester: 'Playwright Admin',
      changeOwner: 'Playwright Admin',
      serviceAffected: 'E2E camera monitoring',
      reason:
        'Eliminate the documented root cause and prevent additional incidents.',
      impact: 'critical',
      urgency: 'high',
      likelihood: 'high',
    },
    new Set(['riskLevel', 'relatedProblemId', 'relatedIncidentIds']),
  );
  const changeOptions = {
    headers: { 'Idempotency-Key': `playwright-itsm-golden-rfc-${randomUUID()}` },
    data: { data: changeData },
  };
  const changeResponse = await request.post(
    `${apiBaseURL}/changes`,
    changeOptions,
  );
  const change = await jsonOrFailure<Entity>(changeResponse, 'create RFC');
  const changeReplayResponse = await request.post(
    `${apiBaseURL}/changes`,
    changeOptions,
  );
  const changeReplay = await jsonOrFailure<Entity>(
    changeReplayResponse,
    'replay RFC',
  );
  expect(changeReplay.id).toBe(change.id);
  expect(change.data.riskLevel).toBe('high');

  let changeInProgress = await transitionChange(request, change.id, 'submit');
  changeInProgress = await transitionChange(request, changeInProgress.id, 'request_approval');
  changeInProgress = await transitionChange(request, changeInProgress.id, 'approve');
  expect(changeInProgress.state).toBe('approved');

  const assignmentDirectory = await jsonOrFailure<AssignmentDirectory>(
    await request.get(`${apiBaseURL}/changes/assignment-directory`),
    'load the Organization assignment directory',
  );
  const inventoryAssignment = assignmentFor(assignmentDirectory, 'Inventario');
  const servicesAssignment = assignmentFor(assignmentDirectory, 'Servicios');

  const inventoryTask = await jsonOrFailure<ChangeTask>(
    await request.post(`${apiBaseURL}/changes/${change.id}/tasks`, {
      data: {
        title: 'Validate replacement stock', description: 'Confirm the required equipment.',
        area: '', team: '', assigneeId: '',
        departmentId: inventoryAssignment.department.id,
        teamId: inventoryAssignment.team.id,
        assigneeUserId: inventoryAssignment.assignee.id,
        priority: 'high',
        required: true, dependencyIds: [], dueAt: '', assetIds: [],
      },
    }),
    'create Inventory task',
  );
  const installationTask = await jsonOrFailure<ChangeTask>(
    await request.post(`${apiBaseURL}/changes/${change.id}/tasks`, {
      data: {
        title: 'Deploy and validate remediation', description: 'Install, configure and validate service.',
        area: '', team: '', assigneeId: '',
        departmentId: servicesAssignment.department.id,
        teamId: servicesAssignment.team.id,
        assigneeUserId: servicesAssignment.assignee.id,
        priority: 'high',
        required: true, dependencyIds: [inventoryTask.id], dueAt: '', assetIds: [],
      },
    }),
    'create Services task',
  );
  expect(inventoryTask.departmentId).toBe(inventoryAssignment.department.id);
  expect(installationTask.departmentId).toBe(servicesAssignment.department.id);

  await transitionTask(request, change.id, inventoryTask.id, 'start');
  await transitionTask(request, change.id, inventoryTask.id, 'complete', { evidence: ['Stock validated'] });
  await transitionTask(request, change.id, installationTask.id, 'mark_ready');
  await transitionTask(request, change.id, installationTask.id, 'start');
  await transitionTask(request, change.id, installationTask.id, 'complete', { evidence: ['Deployment validated'] });

  await transitionChange(request, change.id, 'schedule');
  await transitionChange(request, change.id, 'start');
  await transitionChange(request, change.id, 'complete');
  changeInProgress = await transitionChange(request, change.id, 'close');
  expect(changeInProgress.state).toBe('closed');

  const resolvedBy = await createRelationTwice(
    request,
    problem,
    'resolvedBy',
    change,
  );

  const incidentRelations = await jsonOrFailure<{ items: Relation[] }>(
    await request.get(
      `${apiBaseURL}/relationships/INC/${incident.id}`,
    ),
    'list INC relations',
  );
  expect(
    incidentRelations.items.some(
      (relation) =>
        relation.id === investigates.id &&
        relation.sourceHumanId === problem.humanId,
    ),
  ).toBeTruthy();

  const changeRelations = await jsonOrFailure<{ items: Relation[] }>(
    await request.get(
      `${apiBaseURL}/relationships/RFC/${change.id}`,
    ),
    'list RFC relations',
  );
  expect(
    changeRelations.items.some(
      (relation) =>
        relation.id === resolvedBy.id &&
        relation.sourceHumanId === problem.humanId,
    ),
  ).toBeTruthy();

  await mockAuthenticatedAdmin(page);

  await page.goto(`/app/tickets/${encodeURIComponent(incident.id)}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(page.getByText(problem.humanId, { exact: true })).toBeVisible();

  await page.goto(`/app/problems/${encodeURIComponent(problem.humanId)}`);
  await expect(
    page.getByRole('heading', {
      name: 'Recurring camera outage root cause',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(incident.humanId, { exact: true })).toBeVisible();
  await expect(page.getByText(change.humanId, { exact: true })).toBeVisible();

  await page.goto(`/app/changes/${encodeURIComponent(change.humanId)}`);
  await expect(
    page.getByRole('heading', {
      name: 'Eliminate recurring camera outage',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(problem.humanId, { exact: true })).toBeVisible();
  // ChangeDetail renders this badge as "Risk: {label}" in English today
  // (riskLabel maps 'high' -> 'High') — this test asserted the stale
  // Spanish "Riesgo Alto", which no longer exists anywhere in the
  // component and made the assertion fail instead of finding the real text.
  await expect(page.getByText('Risk: High', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Validate replacement stock', { exact: true })).toBeVisible();
  await expect(page.getByText('Deploy and validate remediation', { exact: true })).toBeVisible();
});
