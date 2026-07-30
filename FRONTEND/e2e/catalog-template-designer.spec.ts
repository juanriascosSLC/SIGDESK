import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { definitionData, type Definition } from './catalog-support';

const apiBaseURL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8080/api/v1';

type Entity = {
  id: string;
  humanId: string;
  definitionVersionId: string;
  definitionVersion: number;
  data: Record<string, unknown>;
};

async function jsonOrFailure<T>(response: APIResponse, operation: string): Promise<T> {
  expect(response.ok(), `${operation} failed (${response.status()}): ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function getPublishedIncDefinition(request: APIRequestContext): Promise<Definition> {
  return jsonOrFailure<Definition>(
    await request.get(`${apiBaseURL}/entities/INC/presentation`),
    'get published INC definition',
  );
}

async function waitForTicketProjection(request: APIRequestContext, humanId: string) {
  await expect
    .poll(
      async () => (await request.get(`${apiBaseURL}/tickets/${encodeURIComponent(humanId)}`)).status(),
      { timeout: 15_000, message: `Tickets did not project ${humanId}.` },
    )
    .toBe(200);
}

async function openTemplateDesignerForINC(page: Page) {
  await mockAuthenticatedAdmin(page);
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-detail').click();
  await expect(page.getByTestId('template-designer')).toBeVisible();
}

// Section testids are `template-designer-section-{uuid}`, but the section's
// own canvas div is `template-designer-section-{uuid}-canvas` and would also
// match a naive `^template-designer-section-` prefix — excluded here.
const sectionOnly = /^template-designer-section-(?!.*-canvas)/;

async function addSectionAndCaptureId(page: Page): Promise<string> {
  const before = await page.getByTestId(sectionOnly).count();
  await page.getByTestId('template-designer-add-section').click();
  const sections = page.getByTestId(sectionOnly);
  await expect(sections).toHaveCount(before + 1);
  const testId = await sections.last().getAttribute('data-testid');
  return testId!.replace('template-designer-section-', '');
}

async function dragIntoSectionCanvas(page: Page, sourceTestId: string, sectionId: string) {
  const source = page.getByTestId(sourceTestId);
  const target = page.getByTestId(`template-designer-section-${sectionId}-canvas`);
  await source.dispatchEvent('dragstart');
  await target.dispatchEvent('dragover');
  await target.dispatchEvent('drop');
  await source.dispatchEvent('dragend');
}

async function saveDraftAndPublish(page: Page, expectedNextVersion: number): Promise<Definition> {
  const saveResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/catalog/definitions' &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await page.getByTestId('catalog-save-draft').click();
  const savedDraft = await jsonOrFailure<Definition>(await saveResponsePromise, 'save Catalog draft from UI');
  expect(savedDraft.version).toBe(expectedNextVersion);

  const publishResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        `/catalog/definitions/INC/versions/${savedDraft.version}/publish`,
      ) &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await page.getByTestId('catalog-publish').click();
  const published = await jsonOrFailure<Definition>(await publishResponsePromise, 'publish Catalog definition from UI');
  expect(published.version).toBe(expectedNextVersion);
  return published;
}

test('designs a create-layout section visually and the runtime create form reflects it', async ({ page, request }) => {
  const baseline = await getPublishedIncDefinition(request);

  await openTemplateDesignerForINC(page);
  await page.getByTestId('template-designer-kind-create').click();

  const sectionId = await addSectionAndCaptureId(page);
  await dragIntoSectionCanvas(page, 'template-designer-palette-field-catalog-category', sectionId);

  const placements = page.getByTestId(/^template-designer-placement-/);
  await expect(placements).toHaveCount(1);

  const published = await saveDraftAndPublish(page, baseline.version + 1);
  expect(
    published.specification.fields.some((field) => field.key === 'category'),
    'category must still be a real field on the published definition',
  ).toBeTruthy();

  await page.goto('/app/catalog/INC');
  await expect(page.getByText(`INC · v${published.version}`, { exact: true })).toBeVisible();
  await expect(page.getByTestId('catalog-input-category')).toBeVisible();
});

test('a detail section designed visually renders on new tickets and historical tickets keep their own layout', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);
  const historicalTitle = `Historical INC before detail redesign ${randomUUID()}`;
  const historical = await jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': `template-designer-e2e-${randomUUID()}` },
      data: {
        data: definitionData(baseline, {
          title: historicalTitle,
          description: 'Creado antes de rediseñar el detalle con el constructor visual.',
          category: 'hardware',
          priority: 'high',
          assetId: 'CAM-TEMPLATE-HISTORY-001',
          site: 'E2E-TEMPLATE-SITE',
        }),
      },
    }),
    'create historical INC',
  );
  await waitForTicketProjection(request, historical.humanId);

  await openTemplateDesignerForINC(page);
  await page.getByTestId('template-designer-kind-detail').click();

  const sectionId = await addSectionAndCaptureId(page);
  await dragIntoSectionCanvas(page, 'template-designer-palette-field-catalog-site', sectionId);

  const published = await saveDraftAndPublish(page, baseline.version + 1);

  const newEntity = await jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': `template-designer-e2e-${randomUUID()}` },
      data: {
        data: definitionData(published, {
          title: `INC created after visual detail redesign ${randomUUID()}`,
          description: 'Creado después de publicar el nuevo layout de detalle.',
          category: 'hardware',
          priority: 'high',
          assetId: 'CAM-TEMPLATE-RUNTIME-002',
          site: 'E2E-TEMPLATE-RUNTIME-SITE',
        }),
      },
    }),
    'create runtime INC on the redesigned definition',
  );
  await waitForTicketProjection(request, newEntity.humanId);

  await page.goto(`/app/tickets/${encodeURIComponent(newEntity.humanId)}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(page.getByTestId('ticket-detail-field-catalog-site')).toBeVisible();
  await expect(page.getByTestId('ticket-detail-field-catalog-site')).toContainText('E2E-TEMPLATE-RUNTIME-SITE');

  // The historical ticket was created before this section existed and must
  // keep rendering its own manifest's layout, unaffected by the republish.
  await page.goto(`/app/tickets/${encodeURIComponent(historical.humanId)}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(page.getByText(historicalTitle, { exact: true })).toBeVisible();
  const historicalManifest = await jsonOrFailure<{ version: number }>(
    await request.get(`${apiBaseURL}/entities/INC/${historical.id}/manifest`),
    'get historical INC manifest',
  );
  expect(historicalManifest.version).toBe(baseline.version);
});

test('editing a ticket through the designed edit layout never drops fields outside that layout', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);

  // Build an edit layout that only exposes `category` — `site` deliberately
  // stays out of it, the same way an admin might scope an edit form down.
  await openTemplateDesignerForINC(page);
  await page.getByTestId('template-designer-kind-edit').click();
  const sectionId = await addSectionAndCaptureId(page);
  await dragIntoSectionCanvas(page, 'template-designer-palette-field-catalog-category', sectionId);
  const published = await saveDraftAndPublish(page, baseline.version + 1);

  const entity = await jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': `template-designer-e2e-${randomUUID()}` },
      data: {
        data: definitionData(published, {
          title: `INC for edit-preservation check ${randomUUID()}`,
          description: 'Verifica que editar no borre campos fuera del layout de edición.',
          category: 'hardware',
          priority: 'high',
          assetId: 'CAM-TEMPLATE-EDIT-003',
          site: 'E2E-TEMPLATE-EDIT-SITE-ORIGINAL',
        }),
      },
    }),
    'create INC for the edit-preservation check',
  );
  await waitForTicketProjection(request, entity.humanId);

  await page.goto(`/app/tickets/${encodeURIComponent(entity.humanId)}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await page.getByRole('button', { name: 'Editar datos' }).click();

  // `site` must not even be rendered — it is outside the edit layout.
  await expect(page.getByTestId('catalog-input-site')).toHaveCount(0);
  await page.getByTestId('catalog-input-category').selectOption('software');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Los datos se guardaron', { exact: false })).toBeVisible();

  const updated = await jsonOrFailure<Entity>(
    await request.get(`${apiBaseURL}/entities/INC/${entity.id}`),
    'get updated INC entity',
  );
  expect(updated.data.category).toBe('software');
  expect(
    updated.data.site,
    'a field left outside the edit layout must keep its previous value, not be dropped',
  ).toBe('E2E-TEMPLATE-EDIT-SITE-ORIGINAL');
});
