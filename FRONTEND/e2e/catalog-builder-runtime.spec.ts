import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Response,
} from '@playwright/test';
import { mockAuthenticatedAdmin, SIG_DESK_API_BASE, createMutationAuditor } from './support';
import {
  conditionMatches,
  definitionData,
  type Definition,
} from './catalog-support';
import { startIsolatedCatalogStack } from './isolated-catalog-stack';

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
  response: APIResponse | Response,
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
    await request.get('/catalog/definitions/INC'),
    'get published INC definition',
  );
}

async function createIncident(
  request: APIRequestContext,
  definition: Definition,
  title: string,
): Promise<Entity> {
  const sites = await jsonOrFailure<{ items: Array<{ id: string }> }>(
    await request.get(`${SIG_DESK_API_BASE}/assets/sites?limit=1`),
    'load one CMDB site',
  );
  const siteId = sites.items[0]?.id;
  expect(siteId).toBeTruthy();
  return jsonOrFailure<Entity>(
    await request.post('/entities/INC', {
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
        recursoId: siteId,
        assetContext: { siteAssetId: siteId, links: [] },
      },
    }),
    'create historical INC',
  );
}

async function waitForTicketProjection(
  request: APIRequestContext,
  id: string,
) {
  await expect
    .poll(
      async () =>
        (
          await request.get(
            `/tickets/${encodeURIComponent(id)}`,
          )
        ).status(),
      {
        timeout: 15_000,
        message: `Tickets did not project ${id}.`,
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
    if (field.bindsTo) {
      const kind = field.bindsTo === 'agenteItId' ? 'agenteIt' : field.bindsTo === 'siteAssetId' ? 'site' : field.bindsTo === 'assetId' ? 'asset' : 'recurso';
      const picker = page.getByTestId(`binding-picker-${kind}`);
      await expect(picker, `Missing binding picker for ${field.key}`).toBeVisible();
      const option = picker.getByTestId(new RegExp(`^binding-picker-option-${kind}-`)).first();
      if (kind === 'asset' && await option.count() === 0 && !field.required) continue;
      await expect(option, `No binding option available for ${field.key}`).toBeVisible();
      await option.click();
      continue;
    }
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

test('canonical catalog-inc-v1.json fixture is clean of E2E markers and labels', () => {
  const fixturePath = path.resolve(__dirname, '../../BACKEND/scripts/fixtures/catalog-inc-v1.json');
  expect(fs.existsSync(fixturePath)).toBeTruthy();
  const content = fs.readFileSync(fixturePath, 'utf8');
  expect(content).not.toContain('Contexto de resolución E2E');
  expect(content).not.toContain('catalog-builder-e2e');
  expect(content).not.toContain('Entidad E2E');
  expect(content).not.toContain('ENTIDADE2E');
});

test('publishes Catalog Builder changes and preserves historical ticket manifests', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stack = await startIsolatedCatalogStack();
  const auditor = createMutationAuditor();
  try {
    await mockAuthenticatedAdmin(page, {
      catalogApiUrl: stack.baseUrl,
      sessionToken: stack.jwtToken,
      mutationAuditor: auditor,
    });
    await page.setViewportSize({ width: 1400, height: 1200 });
    const baseline = await getPublishedDefinition(stack.isolatedRequest);
    const historicalTitle = `Historical INC on definition v${baseline.version}`;
    const historical = await createIncident(stack.isolatedRequest, baseline, historicalTitle);
    await waitForTicketProjection(stack.isolatedRequest, historical.id);

    const triggerField =
      baseline.specification.fields.find((field) => field.key === 'title') ??
      baseline.specification.fields.find((field) => field.type === 'text');
    expect(triggerField, 'INC needs a text field to drive the conditional rule').toBeTruthy();

    const nextVersion = baseline.version + 1;
    const triggerValue = `Catalog runtime trigger v${nextVersion}`;
    const fieldLabel = `Contexto de resolución E2E v${nextVersion}`;
    const runtimeValue = `Visible únicamente en INC v${nextVersion}`;

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

    await expect(page.getByTestId('catalog-save-draft')).toBeVisible();
    await expect(page.getByTestId('catalog-save-draft')).toBeEnabled();

    const editorError = page.getByTestId('catalog-editor-error');
    const saveResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/catalog/definitions' &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId('catalog-save-draft').click();

    let saveResponse: Awaited<typeof saveResponsePromise>;
    try {
      saveResponse = await saveResponsePromise;
    } catch (timeoutError) {
      if (await editorError.isVisible()) {
        throw new Error(
          `catalog-save-draft validation error: ${await editorError.textContent()}`,
          { cause: timeoutError },
        );
      }
      throw timeoutError;
    }
    const savedDraft = await jsonOrFailure<Definition>(
      saveResponse,
      'save Catalog draft from UI',
    );
    expect(savedDraft.version).toBeGreaterThan(0);
    await expect(page.getByTestId('catalog-notice')).toContainText(
      /(?:Borrador.*guardado|Draft.*saved)/i,
    );

    await expect(page.getByTestId('catalog-publish')).toBeVisible();
    await expect(page.getByTestId('catalog-publish')).toBeEnabled();

    const [publishResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith(
            `/catalog/definitions/INC/versions/${savedDraft.version}/publish`,
          ) &&
          response.request().method() === 'POST' &&
          response.ok(),
      ),
      page.getByTestId('catalog-publish').click(),
    ]);
    const published = await jsonOrFailure<Definition>(
      publishResponse,
      'publish Catalog definition from UI',
    );
    expect(published.version).toBeGreaterThan(baseline.version);
    await expect(page.getByTestId('catalog-notice')).toContainText(
      /(?:INC ya tiene los cambios publicados|INC.*published)/i,
    );

    const runtimeDefinition = await getPublishedDefinition(stack.isolatedRequest);
    expect(runtimeDefinition.version).toBe(published.version);
    const publishedField = runtimeDefinition.specification.fields.find(
      (field) => field.key === newFieldKey,
    );
    expect(publishedField).toBeTruthy();
    expect(publishedField?.label).toBe(fieldLabel);
    expect(publishedField?.visibleWhen).toEqual({
      field: triggerField!.key,
      operator: 'equals',
      value: triggerValue,
    });
    expect(publishedField?.requiredWhen).toEqual({
      field: triggerField!.key,
      operator: 'equals',
      value: triggerValue,
    });

    const createView = runtimeDefinition.specification.views?.create ?? [];
    expect(createView).toContain(newFieldKey);

    const createPageRaw = runtimeDefinition.specification.createPage as Record<string, unknown> | undefined;
    const layoutDoc = (createPageRaw?.default ?? createPageRaw) as
      | Record<string, { rows?: Array<{ cells?: Array<{ placement?: { source?: string; fieldKey?: string } }> }> }>
      | undefined;
    const allPlacements: Array<{ source?: string; fieldKey?: string }> = [];
    if (layoutDoc) {
      for (const regionName of ['header', 'main', 'sidebar', 'footer']) {
        const region = layoutDoc[regionName];
        if (region?.rows) {
          for (const row of region.rows) {
            for (const cell of row.cells ?? []) {
              if (cell.placement) allPlacements.push(cell.placement);
            }
          }
        }
      }
    }
    const createdPlacement = allPlacements.find((p) => p.fieldKey === newFieldKey);
    if (createdPlacement) {
      expect(createdPlacement).toMatchObject({
        source: 'catalog',
        fieldKey: newFieldKey,
      });
    }

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
        new URL(response.url()).pathname === '/entities/INC' &&
        response.request().method() === 'POST' &&
        response.ok(),
    );
    await page.getByTestId('catalog-form-submit').click();
    const runtimeEntity = await jsonOrFailure<Entity>(
      await createResponsePromise,
      'create INC from metadata-driven form',
    );
    expect(runtimeEntity.definitionVersion).toBe(published.version);
    expect(runtimeEntity.data[newFieldKey]).toBe(runtimeValue);
    await expect(
      page.getByText(runtimeEntity.humanId, { exact: true }),
    ).toBeVisible();
    await waitForTicketProjection(stack.isolatedRequest, runtimeEntity.id);

    await page.goto(
      `/app/tickets/${encodeURIComponent(runtimeEntity.id)}`,
    );
    await expect(page.getByTestId('ticket-detail')).toBeVisible();
    const runtimeDetailField = page.getByTestId(
      `ticket-detail-field-catalog-${newFieldKey}`,
    );
    await expect(runtimeDetailField).toBeVisible();
    await expect(runtimeDetailField).toContainText(fieldLabel);
    await expect(runtimeDetailField).toContainText(runtimeValue);

    const runtimeManifest = await jsonOrFailure<Manifest>(
      await stack.isolatedRequest.get(
        `/entities/INC/${runtimeEntity.id}/manifest`,
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
      `/app/tickets/${encodeURIComponent(historical.id)}`,
    );
    await expect(page.getByTestId('ticket-detail')).toBeVisible();
    await expect(
      page.getByText(historicalTitle, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId(`ticket-detail-field-catalog-${newFieldKey}`),
    ).toHaveCount(0);

    const historicalManifest = await jsonOrFailure<Manifest>(
      await stack.isolatedRequest.get(
        `/entities/INC/${historical.id}/manifest`,
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

    auditor.assertAllMutationsIsolated({ origin: new URL(stack.baseUrl).origin, runToken: stack.runToken });
  } finally {
    await stack.cleanup();
  }
});

test('creates and publishes a new catalog entity from the Builder', async ({ page }) => {
  test.setTimeout(180_000);
  const stack = await startIsolatedCatalogStack();
  const auditor = createMutationAuditor();
  try {
    const entityName = `Entidad E2E ${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;

    await mockAuthenticatedAdmin(page, {
      catalogApiUrl: stack.baseUrl,
      sessionToken: stack.jwtToken,
      mutationAuditor: auditor,
    });
    await page.goto('/app/admin/catalog-builder');
    await expect(page.getByTestId('catalog-builder')).toBeVisible();
    await page.getByRole('button', { name: 'Create entity' }).click();

    await page.getByTestId('catalog-panel-general').getByLabel('Display Name').fill(entityName);

    const entityKey = (await page.getByTestId('catalog-entity-key').innerText()).trim();
    expect(entityKey).toMatch(/^[A-Z0-9_]+$/);
    await page.getByTestId('catalog-section-fields').click();
    await expect(page.getByTestId(/^catalog-field-editor-/)).toHaveCount(1);
    await page.getByTestId('catalog-section-workflow').click();
    await page.getByTestId('catalog-section-relations').click();
    await page.getByTestId('catalog-section-resources').click();
    await page.getByTestId('catalog-section-review').click();

    const saveResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/catalog/definitions' &&
        response.request().method() === 'POST' && response.ok(),
    );
    await page.getByTestId('catalog-save-draft').click();
    const draft = await jsonOrFailure<Definition>(await saveResponse, 'create catalog entity draft');
    expect(draft.entityKey).toBe(entityKey);
    expect(draft.name).toBe(entityName);
    expect(draft.specification.fields.length).toBeGreaterThan(0);

    const publishResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith(
        `/catalog/definitions/${entityKey}/versions/${draft.version}/publish`,
      ) && response.request().method() === 'POST' && response.ok(),
    );
    await page.getByTestId('catalog-publish').click();
    const published = await jsonOrFailure<Definition>(await publishResponse, 'publish new catalog entity');
    expect(published.entityKey).toBe(entityKey);
    expect(published.status).toBe('published');

    const active = await jsonOrFailure<Definition>(
      await stack.isolatedRequest.get(`/catalog/definitions/${entityKey}`),
      'reload published catalog entity',
    );
    expect(active.entityKey).toBe(entityKey);
    expect(active.version).toBe(published.version);
    expect(active.specification.fields).toEqual(published.specification.fields);

    auditor.assertAllMutationsIsolated({ origin: new URL(stack.baseUrl).origin, runToken: stack.runToken });
  } finally {
    await stack.cleanup();
  }
});
