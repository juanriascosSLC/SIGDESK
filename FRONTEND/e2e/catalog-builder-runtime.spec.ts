import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import {
  conditionMatches,
  definitionData,
  type Definition,
} from './catalog-support';

const apiBaseURL =
  process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8080/api/v1';

type Entity = {
  id: string;
  humanId: string;
  definitionVersionId: string;
  definitionVersion: number;
  data: Record<string, unknown>;
};

type Manifest = {
  definitionVersionId: string;
  version: number;
  specification: Definition['specification'];
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

async function getPublishedDefinition(
  request: APIRequestContext,
): Promise<Definition> {
  return jsonOrFailure<Definition>(
    await request.get(`${apiBaseURL}/entities/INC/presentation`),
    'get published INC definition',
  );
}

async function createIncident(
  request: APIRequestContext,
  definition: Definition,
  title: string,
): Promise<Entity> {
  return jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': `catalog-builder-e2e-${randomUUID()}` },
      data: {
        data: definitionData(definition, {
          title,
          description:
            'Incidente creado antes de publicar una nueva definición del catálogo.',
          category: 'hardware',
          priority: 'high',
          assetId: 'CAM-CATALOG-HISTORY-001',
          site: 'E2E-CATALOG-SITE',
        }),
      },
    }),
    'create historical INC',
  );
}

async function waitForTicketProjection(
  request: APIRequestContext,
  humanId: string,
) {
  await expect
    .poll(
      async () =>
        (
          await request.get(
            `${apiBaseURL}/tickets/${encodeURIComponent(humanId)}`,
          )
        ).status(),
      {
        timeout: 15_000,
        message: `Tickets did not project ${humanId}.`,
      },
    )
    .toBe(200);
}

async function fillCatalogForm(
  page: Page,
  definition: Definition,
  data: Record<string, unknown>,
) {
  const createKeys =
    definition.specification.views?.create ??
    definition.specification.fields.map((field) => field.key);

  for (const field of definition.specification.fields) {
    if (
      !createKeys.includes(field.key) ||
      !conditionMatches(field.visibleWhen, data)
    ) {
      continue;
    }
    const value = data[field.key];
    if (value === undefined || value === null || value === '') continue;

    const input = page.getByTestId(`catalog-input-${field.key}`);
    await expect(input, `Missing runtime input for ${field.key}`).toBeVisible();
    if (field.type === 'boolean') {
      await input.setChecked(Boolean(value));
    } else if (field.type === 'select') {
      await input.selectOption(String(value));
    } else if (field.type === 'datetime') {
      await input.fill(String(value).slice(0, 16));
    } else {
      await input.fill(String(value));
    }
  }
}

test('publishes Catalog Builder changes and preserves historical ticket manifests', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedDefinition(request);
  const historicalTitle = `Historical INC on definition v${baseline.version}`;
  const historical = await createIncident(request, baseline, historicalTitle);
  await waitForTicketProjection(request, historical.humanId);

  const triggerField =
    baseline.specification.fields.find((field) => field.key === 'title') ??
    baseline.specification.fields.find((field) => field.type === 'text');
  expect(triggerField, 'INC needs a text field to drive the conditional rule').toBeTruthy();

  const nextVersion = baseline.version + 1;
  const triggerValue = `Catalog runtime trigger v${nextVersion}`;
  const fieldLabel = `Contexto de resolución E2E v${nextVersion}`;
  const detailLabel = `Contexto publicado v${nextVersion}`;
  const runtimeValue = `Visible únicamente en INC v${nextVersion}`;

  await mockAuthenticatedAdmin(page);
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-fields').click();

  const existingFieldCount = await page
    .getByTestId(/^catalog-field-editor-/)
    .count();
  await page.getByTestId('catalog-add-field').click();
  const newFieldEditor = page.getByTestId(/^catalog-field-editor-/).last();
  await expect(page.getByTestId(/^catalog-field-editor-/)).toHaveCount(
    existingFieldCount + 1,
  );

  const fieldEditorTestId = await newFieldEditor.getAttribute('data-testid');
  expect(fieldEditorTestId).toMatch(/^catalog-field-editor-/);
  const newFieldKey = fieldEditorTestId!.replace(
    'catalog-field-editor-',
    '',
  );
  await newFieldEditor.locator('input').first().fill(fieldLabel);

  for (const rule of ['visible', 'required'] as const) {
    const condition = page.getByTestId(
      `catalog-condition-${rule}-${newFieldKey}`,
    );
    await condition.getByRole('switch').click();
    await condition.locator('select').nth(0).selectOption(triggerField!.key);
    await condition.locator('select').nth(1).selectOption('equals');
    await condition.locator('input').fill(triggerValue);
  }

  await page.getByTestId('catalog-section-detail').click();
  await page
    .getByTestId(`catalog-layout-library-catalog-${newFieldKey}`)
    .click();

  const newPlacement = page.getByTestId(
    `catalog-layout-placement-catalog-${newFieldKey}`,
  );
  await expect(newPlacement).toBeVisible();
  await newPlacement.locator('input').fill(detailLabel);
  await newPlacement.locator('select').selectOption('full');

  const placements = page.locator(
    '[data-testid^="catalog-layout-placement-"]',
  );
  expect(await placements.count()).toBeGreaterThan(1);
  await newPlacement.dispatchEvent('dragstart');
  await expect(newPlacement).toHaveClass(/opacity-60/);
  await placements.first().dispatchEvent('dragover');
  await placements.first().dispatchEvent('drop');
  await newPlacement.dispatchEvent('dragend');
  await expect(placements.first()).toHaveAttribute(
    'data-testid',
    `catalog-layout-placement-catalog-${newFieldKey}`,
  );

  const saveResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/catalog/definitions' &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await page.getByTestId('catalog-save-draft').click();
  const savedDraft = await jsonOrFailure<Definition>(
    await saveResponsePromise,
    'save Catalog draft from UI',
  );
  await expect(page.getByTestId('catalog-notice')).toContainText(
    'Borrador guardado',
  );

  const publishResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        `/catalog/definitions/INC/versions/${savedDraft.version}/publish`,
      ) &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await page.getByTestId('catalog-publish').click();
  const published = await jsonOrFailure<Definition>(
    await publishResponsePromise,
    'publish Catalog definition from UI',
  );
  expect(published.version).toBeGreaterThan(baseline.version);
  await expect(page.getByTestId('catalog-notice')).toContainText(
    'INC ya tiene los cambios publicados',
  );

  const runtimeDefinition = await getPublishedDefinition(request);
  expect(runtimeDefinition.id).toBe(published.id);
  const runtimeField = runtimeDefinition.specification.fields.find(
    (field) => field.key === newFieldKey,
  );
  expect(runtimeField).toMatchObject({
    label: fieldLabel,
    visibleWhen: {
      field: triggerField!.key,
      operator: 'equals',
      value: triggerValue,
    },
    requiredWhen: {
      field: triggerField!.key,
      operator: 'equals',
      value: triggerValue,
    },
  });
  expect(
    runtimeDefinition.specification.detailLayout?.fields?.[0],
  ).toMatchObject({
    source: 'catalog',
    fieldKey: newFieldKey,
    label: detailLabel,
    width: 'full',
  });

  await page.goto('/app/catalog/INC');
  await expect(
    page.getByText(`INC · v${published.version}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId(`catalog-input-${newFieldKey}`)).toHaveCount(0);
  await page
    .getByTestId(`catalog-input-${triggerField!.key}`)
    .fill(triggerValue);

  const conditionalInput = page.getByTestId(
    `catalog-input-${newFieldKey}`,
  );
  await expect(conditionalInput).toBeVisible();
  await expect(conditionalInput).toHaveAttribute('required', '');

  const newEntityData = definitionData(runtimeDefinition, {
    title: triggerValue,
    description:
      'Incidente creado desde el formulario dinámico después de publicar la definición.',
    category: 'hardware',
    priority: 'critical',
    assetId: 'CAM-CATALOG-RUNTIME-002',
    site: 'E2E-CATALOG-SITE',
    [newFieldKey]: runtimeValue,
  });
  await fillCatalogForm(page, runtimeDefinition, newEntityData);

  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/entities/INC' &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await page.getByRole('button', { name: 'Crear INC', exact: true }).click();
  const runtimeEntity = await jsonOrFailure<Entity>(
    await createResponsePromise,
    'create INC from metadata-driven form',
  );
  expect(runtimeEntity.definitionVersion).toBe(published.version);
  expect(runtimeEntity.data[newFieldKey]).toBe(runtimeValue);
  await expect(
    page.getByText(runtimeEntity.humanId, { exact: true }),
  ).toBeVisible();
  await waitForTicketProjection(request, runtimeEntity.humanId);

  await page.goto(
    `/app/tickets/${encodeURIComponent(runtimeEntity.humanId)}`,
  );
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  const runtimeDetailField = page.getByTestId(
    `ticket-detail-field-catalog-${newFieldKey}`,
  );
  await expect(runtimeDetailField).toBeVisible();
  await expect(runtimeDetailField).toContainText(detailLabel);
  await expect(runtimeDetailField).toContainText(runtimeValue);

  const runtimeManifest = await jsonOrFailure<Manifest>(
    await request.get(
      `${apiBaseURL}/entities/INC/${runtimeEntity.id}/manifest`,
    ),
    'get runtime INC manifest',
  );
  expect(runtimeManifest.version).toBe(published.version);
  expect(
    runtimeManifest.specification.fields.some(
      (field) => field.key === newFieldKey,
    ),
  ).toBeTruthy();

  await page.goto(
    `/app/tickets/${encodeURIComponent(historical.humanId)}`,
  );
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(
    page.getByText(historicalTitle, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId(`ticket-detail-field-catalog-${newFieldKey}`),
  ).toHaveCount(0);

  const historicalManifest = await jsonOrFailure<Manifest>(
    await request.get(
      `${apiBaseURL}/entities/INC/${historical.id}/manifest`,
    ),
    'get historical INC manifest',
  );
  expect(historical.definitionVersion).toBe(baseline.version);
  expect(historicalManifest.version).toBe(baseline.version);
  expect(
    historicalManifest.specification.fields.some(
      (field) => field.key === newFieldKey,
    ),
  ).toBeFalsy();
});
