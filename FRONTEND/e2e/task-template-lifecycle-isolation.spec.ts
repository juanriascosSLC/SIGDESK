import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { definitionData, type Definition } from './catalog-support';
import { isolatedRequestFor, startIsolatedItsmStack } from './isolated-itsm-stack';
import { mintE2EJWT, resolveJwtSecret } from './isolated-catalog-stack';
import { mockAuthenticatedAdmin, mockAuthenticatedTaskExecutor } from './support';

const e2eDirectory = path.dirname(fileURLToPath(import.meta.url));

type Entity = { id: string; humanId: string; state: string; data: Record<string, unknown> };
type TaskTemplate = {
  id: number;
  familyKey: string;
  version: number;
  status: 'draft' | 'published' | 'retired';
  workType: string;
  definition: Record<string, unknown>;
  updatedAt: string;
};
type ChangeTask = {
  id: string;
  humanId: string;
  title: string;
  changeId: string;
  workflowKey: string;
  workType: string;
  status: string;
  templateFamilyKey: string;
  templateVersion: number;
  taskTemplate: {
    title: string;
    fields: Array<{ key: string; label: string }>;
    outcomes: Array<{ code: string; requiredFields: string[] }>;
  } | null;
  collectedData: Record<string, unknown>;
};

async function jsonOrFailure<T>(response: APIResponse, operation: string): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${operation} failed (${response.status()}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function publishRfcDefinition(tickets: APIRequestContext): Promise<void> {
  const backendRoot = process.env.SIGDESK_E2E_BACKEND_ROOT
    ? path.resolve(process.env.SIGDESK_E2E_BACKEND_ROOT)
    : path.resolve(e2eDirectory, '../../BACKEND');
  const fixturePath = path.join(backendRoot, 'scripts/fixtures/catalog-rfc-v1.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    entityKey: string;
    name: string;
    specification: Record<string, unknown>;
  };
  const draft = await jsonOrFailure<{ version: number }>(
    await tickets.post('/catalog/definitions', { data: fixture }),
    'create RFC definition draft',
  );
  await jsonOrFailure(
    await tickets.post(`/catalog/definitions/RFC/versions/${draft.version}/publish`),
    'publish RFC definition',
  );
}

async function createIncident(tickets: APIRequestContext): Promise<Entity> {
  const definition = await jsonOrFailure<Definition>(
    await tickets.get('/catalog/definitions/INC'),
    'load active INC definition',
  );
  return jsonOrFailure<Entity>(
    await tickets.post('/entities/INC', {
      headers: { 'Idempotency-Key': `task-template-inc-${crypto.randomUUID()}` },
      data: {
        data: definitionData(definition, {
          title: 'Versioned task-template lifecycle',
          description: 'Disposable incident for immutable task-template verification.',
          priority: 'high',
          category: 'Hardware',
          requester: 'Playwright Administrator',
        }),
        recursoId: '00000000-0000-4000-8000-0000000000aa',
        assetContext: { siteAssetId: '00000000-0000-4000-8000-0000000000aa', links: [] },
      },
    }),
    'create disposable incident',
  );
}

async function createServiceEscalation(
  baseUrl: string,
  internalSecret: string,
  incident: Entity,
  executionId: string,
): Promise<Entity> {
  const now = Date.now();
  const response = await fetch(`${baseUrl}/internal/changes/service-escalations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret },
    body: JSON.stringify({
      executionId,
      incidentId: incident.id,
      incidentHumanId: incident.humanId,
      incidentTitle: String(incident.data.title ?? incident.humanId),
      incidentDescription: String(incident.data.description ?? ''),
      workItemId: 91,
      workKey: 'it2_troubleshooting',
      outcomeNotes: 'IT 2 confirmed that governed field service is required.',
      evidence: ['diagnostic:task-template-e2e'],
      incidentContext: {
        incident: {
          id: incident.id,
          humanId: incident.humanId,
          title: String(incident.data.title ?? incident.humanId),
          description: String(incident.data.description ?? ''),
          requesterId: '00000000-0000-0000-0000-000000000003',
          requesterName: 'Playwright Administrator',
        },
        evidence: ['diagnostic:task-template-e2e'],
      },
      creatorId: '00000000-0000-0000-0000-000000000003',
      creatorName: 'Playwright Administrator',
      organizationUnitId: '',
      interestedUserIds: [],
      interestedUnitIds: [],
      assets: [],
      serviceAffected: 'Video surveillance',
      changeType: 'normal',
      impact: 'high',
      probability: 'medium',
      urgency: 'high',
      plannedStart: new Date(now + 3_600_000).toISOString(),
      plannedEnd: new Date(now + 14_400_000).toISOString(),
      implementationPlan: 'Dispatch a governed field-service cycle.',
      rollbackPlan: 'Restore the previous configuration.',
      validationPlan: 'IT validates service restoration.',
      requestApproval: true,
      serviceName: 'workflow_service',
    }),
  });
  const responseText = await response.text();
  expect(response.status, responseText).toBe(201);
  const body = JSON.parse(responseText) as { result: string; change: Entity };
  expect(body.result).toBe('applied');
  expect(body.change.state).toBe('pending_approval');
  return body.change;
}

async function approveAndLoadTasks(
  changeRequest: APIRequestContext,
  change: Entity,
  outputTail: () => string,
): Promise<ChangeTask[]> {
  const approvalResponse = await changeRequest.post(`/changes/${change.id}/transitions/approve`, {
    headers: { 'Idempotency-Key': `approve-${change.id}-${crypto.randomUUID()}` },
  });
  if (!approvalResponse.ok()) {
    throw new Error(`approve service RFC failed (${approvalResponse.status()}): ${await approvalResponse.text()}\n${outputTail()}`);
  }
  const result = await jsonOrFailure<{ items: ChangeTask[] }>(
    await changeRequest.get(`/changes/${change.id}/tasks`),
    'load governed task pack',
  );
  expect(result.items).toHaveLength(6);
  return result.items;
}

test('real Catalog to RFC flow freezes task-template versions and renders the governed operator form', async ({ page }) => {
  test.setTimeout(180_000);
  const stack = await startIsolatedItsmStack();
  let executorRequest: APIRequestContext | null = null;
  try {
    await publishRfcDefinition(stack.tickets.isolatedRequest);

    await mockAuthenticatedAdmin(page, {
      changeApiUrl: stack.change.baseUrl,
      sessionToken: stack.jwtToken,
      runToken: stack.runToken,
      specLabel: 'task-template-lifecycle-isolation.spec.ts / administrator',
    });
    await page.goto('/app/admin/task-experience');
    await expect(page.getByRole('heading', { name: 'Task Experience Builder' })).toBeVisible();
    await page.getByRole('button', { name: 'New template', exact: true }).click();
    await page.getByLabel('Work type').selectOption('inventory_readiness');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByTestId('task-template-preview')).toContainText('Inventory Readiness');
    const completionForm = page.getByRole('heading', { name: 'Completion form' }).locator('xpath=ancestor::section[1]');
    await completionForm.getByRole('button', { name: 'Add field' }).click();
    const addedFieldLabel = completionForm.locator('input[value="New field"]:visible');
    const addedField = addedFieldLabel.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await addedField.getByLabel('Required').check();
    await addedField.getByLabel('Operator guidance').fill('Confirm that the readiness review is complete.');
    await addedFieldLabel.fill('Readiness confirmation');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByRole('status')).toContainText('satisfies the controlled task contract');
    await page.getByRole('button', { name: 'Review & publish' }).click();
    await page.getByRole('button', { name: 'Publish version' }).click();
    await expect(page.getByText(/inventory_readiness v1 is published/)).toBeVisible();

    const incident = await createIncident(stack.tickets.isolatedRequest);
    const firstChange = await createServiceEscalation(
      stack.change.baseUrl,
      stack.changeInternalSecret,
      incident,
      `automation:task-template-v1:${crypto.randomUUID()}`,
    );
    const firstTasks = await approveAndLoadTasks(stack.change.isolatedRequest, firstChange, stack.change.outputTail);
    const firstInventory = firstTasks.find((task) => task.workflowKey === 'inventory_readiness');
    expect(firstInventory).toBeTruthy();
    expect(firstInventory).toMatchObject({
      templateFamilyKey: 'inventory_readiness',
      templateVersion: 1,
      status: 'ready',
    });
    expect(firstInventory?.taskTemplate?.fields.some((field) => field.label === 'Readiness confirmation')).toBe(true);
    expect(firstInventory?.collectedData).toEqual({});

    const templates = await jsonOrFailure<{ items: TaskTemplate[] }>(
      await stack.change.isolatedRequest.get('/change-task-templates'),
      'list task templates',
    );
    const v1 = templates.items.find((item) => item.familyKey === 'inventory_readiness' && item.status === 'published');
    expect(v1?.version).toBe(1);
    const v2Draft = await jsonOrFailure<TaskTemplate>(
      await stack.change.isolatedRequest.post('/change-task-templates/drafts', {
        data: {
          familyKey: 'inventory_readiness',
          workType: 'inventory_readiness',
          definition: { ...v1!.definition, title: 'Inventory Readiness v2' },
        },
      }),
      'create task-template v2 draft',
    );
    await jsonOrFailure(
      await stack.change.isolatedRequest.post('/change-task-templates/inventory_readiness/draft/validate', { data: {} }),
      'validate task-template v2',
    );
    await jsonOrFailure(
      await stack.change.isolatedRequest.post('/change-task-templates/inventory_readiness/draft/publish', {
        data: { expectedUpdatedAt: v2Draft.updatedAt },
      }),
      'publish task-template v2',
    );

    const firstTasksAfterV2 = await jsonOrFailure<{ items: ChangeTask[] }>(
      await stack.change.isolatedRequest.get(`/changes/${firstChange.id}/tasks`),
      'reload v1 task after v2 publication',
    );
    const frozenV1 = firstTasksAfterV2.items.find((task) => task.id === firstInventory!.id);
    expect(frozenV1?.templateVersion).toBe(1);
    expect(frozenV1?.taskTemplate?.title).toBe('Inventory Readiness');

    const secondChange = await createServiceEscalation(
      stack.change.baseUrl,
      stack.changeInternalSecret,
      incident,
      `automation:task-template-v2:${crypto.randomUUID()}`,
    );
    const secondTasks = await approveAndLoadTasks(stack.change.isolatedRequest, secondChange, stack.change.outputTail);
    const secondInventory = secondTasks.find((task) => task.workflowKey === 'inventory_readiness');
    expect(secondInventory?.templateVersion).toBe(2);
    expect(secondInventory?.taskTemplate?.title).toBe('Inventory Readiness v2');

    const inventoryOperator = stack.organization.units.Inventario;
    const executorToken = mintE2EJWT(
      resolveJwtSecret(),
      inventoryOperator.agentId,
      inventoryOperator.agentName,
      ['change_tasks:read:propio', 'change_tasks:update:propio'],
    );
    executorRequest = await isolatedRequestFor(stack.change.baseUrl, executorToken);
    await jsonOrFailure(
      await executorRequest.post(`/changes/${firstChange.id}/tasks/${firstInventory!.id}/transitions/start`, {
        headers: { 'Idempotency-Key': `start-${firstInventory!.id}` },
        data: {},
      }),
      'claim and start inventory task',
    );
    const rejected = await executorRequest.post(
      `/changes/${firstChange.id}/tasks/${firstInventory!.id}/transitions/complete`,
      {
        headers: { 'Idempotency-Key': `invalid-complete-${firstInventory!.id}` },
        data: {
          outcomeCode: 'parts_not_required',
          notes: ['Inventory reviewed'],
          evidence: ['evidence:inventory-review'],
          collectedData: {},
          parts: [],
        },
      },
    );
    expect(rejected.status()).toBe(422);

    const assignedTaskResponse = await executorRequest.get(`/changes/tasks/assigned/${firstInventory!.humanId}`);
    if (!assignedTaskResponse.ok()) {
      throw new Error(
        `load assigned task before rendering operator workspace failed (${assignedTaskResponse.status()}): ` +
        `${await assignedTaskResponse.text()}\n${stack.change.outputTail()}`,
      );
    }

    const operatorPage = await page.context().newPage();
    try {
      await mockAuthenticatedTaskExecutor(operatorPage, {
        changeApiUrl: stack.change.baseUrl,
        sessionToken: executorToken,
        runToken: stack.runToken,
        specLabel: 'task-template-lifecycle-isolation.spec.ts / operator',
      });
      await operatorPage.goto(`/app/services/work-orders/${firstChange.id}/${firstInventory!.humanId}`);
      await expect(operatorPage.getByRole('heading', { name: firstInventory!.title })).toBeVisible();
      await expect(operatorPage.getByText(firstInventory!.taskTemplate!.title, { exact: true })).toBeVisible();
      await operatorPage.getByRole('button', { name: 'No parts required' }).click();
      await operatorPage.getByLabel('Work notes 1', { exact: true }).fill('No replacement parts are required.');
      await operatorPage.getByLabel('Evidence 1', { exact: true }).fill('evidence:inventory-review');
      await operatorPage.getByLabel('Readiness confirmation').fill('Readiness review completed and documented.');
      const [completionResponse] = await Promise.all([
        operatorPage.waitForResponse((response) => response.url().includes('/transitions/complete')),
        operatorPage.getByRole('button', { name: 'Record governed outcome' }).click(),
      ]);
      if (!completionResponse.ok()) {
        throw new Error(
          `complete governed task failed (${completionResponse.status()}): ${await completionResponse.text()}\n` +
          stack.change.outputTail(),
        );
      }
      await expect(operatorPage.getByText('Completed', { exact: true })).toBeVisible();
    } finally {
      await operatorPage.close();
    }

    const completed = await jsonOrFailure<{ task: ChangeTask }>(
      await executorRequest.get(`/changes/tasks/assigned/${firstInventory!.humanId}`),
      'reload completed inventory task',
    );
    expect(completed.task.status).toBe('completed');
    expect(completed.task.templateVersion).toBe(1);
    expect(completed.task.collectedData).toEqual({ field_3: 'Readiness review completed and documented.' });
  } finally {
    await executorRequest?.dispose();
    await stack.cleanup();
  }
});
