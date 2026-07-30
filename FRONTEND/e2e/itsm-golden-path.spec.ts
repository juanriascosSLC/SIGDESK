import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import {
  definitionData,
  type Definition,
} from './catalog-support';

const apiBaseURL =
  process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8080/api/v1';

type Entity = {
  id: string;
  humanId: string;
  entityKey: string;
  definitionVersion: number;
  state: string;
  data: Record<string, unknown>;
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
): Promise<Entity> {
  const options = {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: { data },
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
  expect(replayResponse.headers()['idempotency-replayed']).toBe('true');
  return first;
}

async function createRelationTwice(
  request: APIRequestContext,
  source: Entity,
  relationKey: string,
  target: Entity,
): Promise<Relation> {
  const url = `${apiBaseURL}/entities/${source.entityKey}/${source.id}/relations`;
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
  expect(replayResponse.status()).toBe(200);
  expect(replay.id).toBe(first.id);
  expect(replay.contractVersion).toBeTruthy();
  return first;
}

test('executes and traces the metadata-driven INC → PRB → RFC golden path', async ({
  page,
  request,
}) => {
  const incDefinition = await getDefinition(
    request,
    '/entities/INC/presentation',
  );
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
    'playwright-itsm-golden-inc-v1',
  );

  await expect
    .poll(
      async () =>
        (
          await request.get(
            `${apiBaseURL}/tickets/${encodeURIComponent(incident.humanId)}`,
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
    '/entities/PRB/presentation',
  );
  const problem = await createEntityTwice(
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
    'playwright-itsm-golden-prb-v1',
  );
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
    headers: { 'Idempotency-Key': 'playwright-itsm-golden-rfc-v1' },
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
  expect(changeReplayResponse.headers()['idempotency-replayed']).toBe('true');
  expect(change.data.riskLevel).toBe('critical');

  const resolvedBy = await createRelationTwice(
    request,
    problem,
    'resolvedBy',
    change,
  );

  const incidentRelations = await jsonOrFailure<{ items: Relation[] }>(
    await request.get(
      `${apiBaseURL}/entities/INC/${incident.id}/relations`,
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
      `${apiBaseURL}/entities/RFC/${change.id}/relations`,
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

  await page.goto(`/app/tickets/${encodeURIComponent(incident.humanId)}`);
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
  await expect(page.getByText('Crítico', { exact: true }).first()).toBeVisible();
});
