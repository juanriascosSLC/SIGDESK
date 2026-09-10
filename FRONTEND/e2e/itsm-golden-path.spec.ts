import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mockAuthenticatedAdmin, SIG_DESK_API_BASE } from './support';
import { startIsolatedItsmStack } from './isolated-itsm-stack';
import {
  definitionData,
  type Definition,
} from './catalog-support';

// E2E contamination remediation, Workstream A (2026-09-06): this test now
// runs against the full multi-service isolated ITSM stack
// (`startIsolatedItsmStack` — tickets_service + problem_service +
// change_service + a run-owned Organization double), torn down in
// `finally` regardless of outcome. This file used to create a permanent
// INC + PRB + RFC + 2 Tasks on the shared local stack every run, with no
// cleanup at all, and depended on whatever Organization "Inventario"/
// "Servicios" departments happened to exist there.
//
// Routing summary (see isolated-itsm-stack.ts / support.ts for the exact
// contract each isolated process owns):
//   - /catalog/definitions/*, /entities/INC, /tickets/*      -> tickets_service
//   - /entities/PRB/*, /relationships/*  (ALL entity keys)   -> problem_service
//   - /changes, /changes/*                                   -> change_service
//   - /assets/sites (shared, read-only CMDB dependency)      -> the shared backend
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
  return jsonOrFailure<Definition>(await request.get(path), `GET ${path}`);
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
  const firstResponse = await request.post(`/entities/${entityKey}`, options);
  const first = await jsonOrFailure<Entity>(
    firstResponse,
    `create ${entityKey}`,
  );
  const replayResponse = await request.post(`/entities/${entityKey}`, options);
  const replay = await jsonOrFailure<Entity>(
    replayResponse,
    `replay ${entityKey}`,
  );
  expect(replay.id).toBe(first.id);
  return first;
}

/** Relations are centrally owned by problem_service (`/relationships/**`,
 *  for every entity key — see isolated-itsm-stack.ts's routing note), so
 *  `problemRequest` is always the right isolated context regardless of
 *  which entity is the relation's source. */
async function createRelationTwice(
  problemRequest: APIRequestContext,
  source: Entity,
  relationKey: string,
  target: Entity,
): Promise<Relation> {
  const url = `/relationships/${source.entityKey}/${source.id}`;
  const data = {
    relationKey,
    targetEntityKey: target.entityKey,
    targetEntityId: target.id,
  };
  const firstResponse = await problemRequest.post(url, { data });
  const first = await jsonOrFailure<Relation>(
    firstResponse,
    `create relation ${relationKey}`,
  );
  const replayResponse = await problemRequest.post(url, { data });
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
    await request.post(`/changes/${changeId}/transitions/${key}`),
    `transition RFC via ${key}`,
  );
}

async function transitionTask(request: APIRequestContext, changeId: string, taskId: string, key: string, data: Record<string, unknown> = {}) {
  return jsonOrFailure<ChangeTask>(
    await request.post(`/changes/${changeId}/tasks/${taskId}/transitions/${key}`, { data }),
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

/**
 * `startIsolatedCatalogStack` only auto-seeds a MINIMAL "PRB Stub" catalog
 * definition (a single `title` field, `open`/`closed` lifecycle) — enough
 * for isolated-ticket-collaboration.spec.ts's relation-existence checks,
 * not for this test's real PRB data (`impact`/`serviceAffected`/`owner`/
 * `rootCause`/`workaround`/`permanentSolution`). Found live while
 * migrating this spec: creating a PRB with those fields against the stub
 * 422'd with "datos de problema inválidos" — tickets_service's generic
 * catalog validation (shared by INC/PRB/RFC) rejects data for fields the
 * active definition doesn't declare. This publishes a real PRB v2 on top
 * of the stub, via the SAME tickets_service catalog engine problem_service
 * itself calls out to for validation. `known_error`/`resolved` are NOT
 * catalog-lifecycle states at all — `Problem.Transition` (problem_service/
 * domain/models.go) hardcodes their rootCause/workaround/permanentSolution
 * business rules independently of whatever lifecycle the catalog
 * declares — so the lifecycle below only needs to be non-empty and
 * distinct from "open", not literally include "known_error".
 */
async function publishRealPrbDefinition(ticketsRequest: APIRequestContext): Promise<void> {
  const draft = await jsonOrFailure<Definition & { version: number }>(
    await ticketsRequest.post('/catalog/definitions', {
      data: {
        entityKey: 'PRB',
        name: 'Problema (E2E golden path)',
        specification: {
          metamodelVersion: '1.6',
          identity: { prefix: 'PRB' },
          fields: [
            { key: 'title', label: 'Title', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea', required: true },
            { key: 'impact', label: 'Impact', type: 'text', required: false },
            { key: 'serviceAffected', label: 'Service affected', type: 'text', required: false },
            { key: 'owner', label: 'Owner', type: 'text', required: false },
            { key: 'rootCause', label: 'Root cause', type: 'text', required: false },
            { key: 'workaround', label: 'Workaround', type: 'text', required: false },
            { key: 'permanentSolution', label: 'Permanent solution', type: 'text', required: false },
          ],
          lifecycle: {
            states: [
              { key: 'open', label: 'Open', initial: true },
              { key: 'known_error', label: 'Known error' },
              { key: 'resolved', label: 'Resolved' },
              { key: 'closed', label: 'Closed' },
            ],
            transitions: [
              { key: 'mark_known_error', label: 'Mark known error', from: 'open', to: 'known_error' },
              { key: 'resolve', label: 'Resolve', from: 'known_error', to: 'resolved' },
              { key: 'close', label: 'Close', from: 'resolved', to: 'closed' },
            ],
          },
        },
      },
    }),
    'create real PRB definition draft',
  );
  await jsonOrFailure(
    await ticketsRequest.post(`/catalog/definitions/PRB/versions/${draft.version}/publish`),
    'publish real PRB definition',
  );
}

test('executes and traces the metadata-driven INC → PRB → RFC golden path', async ({
  page,
  request,
}) => {
  const stack = await startIsolatedItsmStack();
  try {
    await publishRealPrbDefinition(stack.tickets.isolatedRequest);

    const incDefinition = await getDefinition(stack.tickets.isolatedRequest, '/catalog/definitions/INC');
    // Sites are a shared, read-only CMDB dependency — same carve-out as
    // every other isolated-stack spec.
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
      deviceType: 'camera',
      deviceModel: 'DS-2CD2043',
      cameraChannel: 1,
    });
    const incident = await createEntityTwice(
      stack.tickets.isolatedRequest,
      'INC',
      incData,
      `playwright-itsm-golden-inc-${randomUUID()}`,
      { recursoId: siteId, assetContext: { siteAssetId: siteId, links: [] } },
    );

    await expect
      .poll(
        async () => (await stack.tickets.isolatedRequest.get(`/tickets/${incident.id}`)).status(),
        {
          timeout: 15_000,
          message: 'Tickets did not project the Catalog INC.',
        },
      )
      .toBe(200);

    const problemDefinition = await getDefinition(stack.tickets.isolatedRequest, '/catalog/definitions/PRB');
    let problem = await createEntityTwice(
      stack.problem.isolatedRequest,
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
      await stack.problem.isolatedRequest.patch(`/entities/PRB/${problem.id}`, {
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
      await stack.problem.isolatedRequest.post(`/entities/PRB/${problem.id}/transitions/mark_known_error`),
      'mark PRB as known error',
    );
    expect(problem.state).toBe('known_error');
    const investigates = await createRelationTwice(
      stack.problem.isolatedRequest,
      problem,
      'investigates',
      incident,
    );

    const changeDefinition = await getDefinition(stack.change.isolatedRequest, '/changes/definition');
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
    const changeResponse = await stack.change.isolatedRequest.post('/changes', changeOptions);
    const change = await jsonOrFailure<Entity>(changeResponse, 'create RFC');
    const changeReplayResponse = await stack.change.isolatedRequest.post('/changes', changeOptions);
    const changeReplay = await jsonOrFailure<Entity>(
      changeReplayResponse,
      'replay RFC',
    );
    expect(changeReplay.id).toBe(change.id);
    expect(change.data.riskLevel).toBe('high');

    let changeInProgress = await transitionChange(stack.change.isolatedRequest, change.id, 'submit');
    changeInProgress = await transitionChange(stack.change.isolatedRequest, changeInProgress.id, 'request_approval');
    changeInProgress = await transitionChange(stack.change.isolatedRequest, changeInProgress.id, 'approve');
    expect(changeInProgress.state).toBe('approved');

    const assignmentDirectory = await jsonOrFailure<AssignmentDirectory>(
      await stack.change.isolatedRequest.get('/changes/assignment-directory'),
      'load the Organization assignment directory',
    );
    const inventoryAssignment = assignmentFor(assignmentDirectory, 'Inventario');
    const servicesAssignment = assignmentFor(assignmentDirectory, 'Servicios');

    const inventoryTask = await jsonOrFailure<ChangeTask>(
      await stack.change.isolatedRequest.post(`/changes/${change.id}/tasks`, {
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
      await stack.change.isolatedRequest.post(`/changes/${change.id}/tasks`, {
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

    await transitionTask(stack.change.isolatedRequest, change.id, inventoryTask.id, 'start');
    await transitionTask(stack.change.isolatedRequest, change.id, inventoryTask.id, 'complete', { evidence: ['Stock validated'] });
    await transitionTask(stack.change.isolatedRequest, change.id, installationTask.id, 'mark_ready');
    await transitionTask(stack.change.isolatedRequest, change.id, installationTask.id, 'start');
    await transitionTask(stack.change.isolatedRequest, change.id, installationTask.id, 'complete', { evidence: ['Deployment validated'] });

    await transitionChange(stack.change.isolatedRequest, change.id, 'schedule');
    await transitionChange(stack.change.isolatedRequest, change.id, 'start');
    await transitionChange(stack.change.isolatedRequest, change.id, 'complete');
    changeInProgress = await transitionChange(stack.change.isolatedRequest, change.id, 'close');
    expect(changeInProgress.state).toBe('closed');

    const resolvedBy = await createRelationTwice(
      stack.problem.isolatedRequest,
      problem,
      'resolvedBy',
      change,
    );

    const incidentRelations = await jsonOrFailure<{ items: Relation[] }>(
      await stack.problem.isolatedRequest.get(`/relationships/INC/${incident.id}`),
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
      await stack.problem.isolatedRequest.get(`/relationships/RFC/${change.id}`),
      'list RFC relations',
    );
    expect(
      changeRelations.items.some(
        (relation) =>
          relation.id === resolvedBy.id &&
          relation.sourceHumanId === problem.humanId,
      ),
    ).toBeTruthy();

    await mockAuthenticatedAdmin(page, {
      catalogApiUrl: stack.tickets.baseUrl,
      problemApiUrl: stack.problem.baseUrl,
      changeApiUrl: stack.change.baseUrl,
      sessionToken: stack.jwtToken,
      runToken: stack.runToken,
      specLabel: 'itsm-golden-path.spec.ts',
    });

    // Same documented contract as the other migrated specs (api.ts:292-296):
    // the ticket-detail route takes the raw integer id, never humanId.
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
  } finally {
    await stack.cleanup();
  }
});
