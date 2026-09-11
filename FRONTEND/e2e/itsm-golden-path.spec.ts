import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mockAuthenticatedAdmin,
  mockAuthenticatedTaskExecutor,
  SIG_DESK_API_BASE,
} from './support';
import { startIsolatedItsmStack } from './isolated-itsm-stack';
import { mintE2EJWT, resolveJwtSecret } from './isolated-catalog-stack';
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
//   - asset validation during creation                       -> run-owned tickets stub
const apiBaseURL = SIG_DESK_API_BASE;
const e2eDirectory = path.dirname(fileURLToPath(import.meta.url));

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
          relations: [
            {
              key: 'investigates', label: 'Investigated incident', targetEntityKey: 'INC',
              inverseKey: 'affectedByProblem', inverseLabel: 'Related problem', cardinality: 'many', contractVersion: '1',
            },
            {
              key: 'resolvedBy', label: 'Resolution change', targetEntityKey: 'RFC',
              inverseKey: 'resolvesProblem', inverseLabel: 'Resolves problem', cardinality: 'many', contractVersion: '1',
            },
          ],
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

async function publishCanonicalRfcDefinition(ticketsRequest: APIRequestContext): Promise<void> {
  const fixturePath = path.resolve(e2eDirectory, '../../BACKEND/scripts/fixtures/catalog-rfc-v1.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    entityKey: 'RFC';
    name: string;
    specification: Record<string, unknown>;
  };
  const draft = await jsonOrFailure<Definition & { version: number }>(
    await ticketsRequest.post('/catalog/definitions', { data: fixture }),
    'create canonical RFC definition draft',
  );
  await jsonOrFailure(
    await ticketsRequest.post(`/catalog/definitions/RFC/versions/${draft.version}/publish`),
    'publish canonical RFC definition',
  );
}

test('the scoped browser session overrides the release-gate administrator header', async ({ browser }) => {
  const gateToken = 'release-gate-administrator-token';
  const scopedToken = 'services-operator-session-token';
  const receivedAuthorization: string[] = [];
  const server = http.createServer((request, response) => {
    receivedAuthorization.push(request.headers.authorization ?? '');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ items: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const context = await browser.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${gateToken}` },
  });
  try {
    const routedPage = await context.newPage();
    const port = (server.address() as AddressInfo).port;
    await mockAuthenticatedTaskExecutor(routedPage, {
      changeApiUrl: `http://127.0.0.1:${port}`,
      sessionToken: scopedToken,
      runToken: 'scoped-token-regression',
      specLabel: 'itsm-golden-path.spec.ts / scoped-token regression',
    });

    const response = await routedPage.goto(`${apiBaseURL}/changes/tasks/assigned?assignedToMe=true`);
    expect(response?.status()).toBe(200);
    expect(receivedAuthorization).toEqual([`Bearer ${scopedToken}`]);
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('executes and traces the metadata-driven INC → PRB → RFC golden path', async ({ page }) => {
  const stack = await startIsolatedItsmStack();
  try {
    await publishRealPrbDefinition(stack.tickets.isolatedRequest);
    await publishCanonicalRfcDefinition(stack.tickets.isolatedRequest);

    const incDefinition = await getDefinition(stack.tickets.isolatedRequest, '/catalog/definitions/INC');
    // The isolated tickets process owns a deterministic resolver that
    // accepts this synthetic site identity and persists its snapshot. No
    // shared Resource/Inventory service participates in this golden path.
    const siteId = '00000000-0000-4000-8000-0000000000aa';
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
        probability: 'high',
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
    expect(change.data.riskLevel).toBe('critical');

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

    // Exercise the Services workspace against the REAL isolated
    // change_service instead of finishing its task through a setup API call.
    // The browser identity has only change_tasks permissions and its signed
    // JWT subject is the actual assignee. It can execute the Work Order but
    // cannot open the parent RFC.
    const servicesPage = await page.context().newPage();
    try {
      const servicesToken = mintE2EJWT(
        resolveJwtSecret(),
        servicesAssignment.assignee.id,
        servicesAssignment.assignee.name,
        ['change_tasks:read:propio', 'change_tasks:update:propio'],
      );
      await mockAuthenticatedTaskExecutor(servicesPage, {
        changeApiUrl: stack.change.baseUrl,
        sessionToken: servicesToken,
        runToken: stack.runToken,
        specLabel: 'itsm-golden-path.spec.ts / Services Work Order',
      });
      await servicesPage.route('**/notifications*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], unread: 0 }),
      }));

      await servicesPage.goto('/app/services');
      await expect(servicesPage.getByRole('heading', { name: 'Services operations' })).toBeVisible();
      const workOrder = servicesPage.getByTestId(`service-work-order-${installationTask.id}`);
      await expect(workOrder).toContainText(installationTask.humanId);
      await expect(workOrder).toContainText(servicesAssignment.assignee.name);
      await expect(servicesPage.getByText(inventoryTask.humanId, { exact: true })).toHaveCount(0);
      await workOrder.click();

      await expect(servicesPage.getByRole('heading', { name: 'Deploy and validate remediation' })).toBeVisible();
      await expect(servicesPage.getByRole('link', { name: 'Open RFC' })).toHaveCount(0);
      await servicesPage.getByRole('button', { name: 'Start work' }).click();
      await servicesPage.getByRole('button', { name: 'Report blocker' }).click();
      await servicesPage.getByLabel('Reason for blocking').fill('Waiting for the approved maintenance window.');
      await servicesPage.getByRole('dialog').getByRole('button', { name: 'Block', exact: true }).click();
      await expect(servicesPage.getByText('Waiting for the approved maintenance window.')).toBeVisible();
      await servicesPage.getByRole('button', { name: 'Clear blocker' }).click();
      await expect(servicesPage.getByText('Ready to start', { exact: true })).toBeVisible();
      await servicesPage.getByRole('button', { name: 'Start work' }).click();
      await servicesPage.getByRole('button', { name: 'Complete with evidence' }).click();
      const completionDialog = servicesPage.getByRole('dialog');
      await expect(completionDialog.getByRole('button', { name: 'Complete', exact: true })).toBeDisabled();
      await completionDialog.getByLabel('Evidence or result').fill('Deployment validated from the Services workspace.');
      await completionDialog.getByRole('button', { name: 'Complete', exact: true }).click();
      await expect(servicesPage.getByText('Deployment validated from the Services workspace.')).toBeVisible();
      await expect(servicesPage.getByText('Completed', { exact: true })).toBeVisible();

      // Reopen is also a real domain transition. Return the task to a valid
      // terminal state afterwards so the RFC can continue and close.
      await servicesPage.getByRole('button', { name: 'Reopen' }).click();
      await servicesPage.getByRole('button', { name: 'Start work' }).click();
      await servicesPage.getByRole('button', { name: 'Complete with evidence' }).click();
      await servicesPage.getByLabel('Evidence or result').fill('Final Services verification after reopening.');
      await servicesPage.getByRole('dialog').getByRole('button', { name: 'Complete', exact: true }).click();
      await expect(servicesPage.getByText('Final Services verification after reopening.')).toBeVisible();
    } finally {
      await servicesPage.close();
    }

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
    // All three canonical risk inputs are high, so the domain calculation
    // must preserve its highest band in both the API and the real detail UI.
    await expect(page.getByText('Risk: Critical', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Validate replacement stock', { exact: true })).toBeVisible();
    await expect(page.getByText('Deploy and validate remediation', { exact: true })).toBeVisible();
  } finally {
    await stack.cleanup();
  }
});
