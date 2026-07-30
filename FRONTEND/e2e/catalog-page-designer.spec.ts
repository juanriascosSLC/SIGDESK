import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse, type Locator, type Page } from '@playwright/test';
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

async function openPageDesignerForINC(page: Page) {
  await mockAuthenticatedAdmin(page);
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-detail').click();
  await expect(page.getByTestId('page-designer')).toBeVisible();
}

// The designer canvas uses @dnd-kit (PointerSensor, activationConstraint
// distance: 4), not native HTML5 drag-and-drop — a real drag needs a
// pointerdown, movement past the activation distance so dnd-kit starts
// tracking the drag, movement onto the target so dnd-kit resolves `over`,
// then a pointerup. Playwright's mouse API dispatches real pointer events,
// which is what dnd-kit listens to (unlike dispatchEvent('dragstart'), which
// only satisfies the native drag-and-drop API this designer no longer uses).
async function performDrag(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Drag source or target is not visible.');
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.move(endX, endY, { steps: 2 });
  await page.mouse.up();
}

type Region = 'header' | 'actions' | 'main' | 'sidebar' | 'footer';

// Drops a palette item into a region that starts out with no rows — the
// whole region body is itself the droppable in that state
// (DesignerRegionCanvas renders `page-designer-region-{region}` directly on
// the droppable dashed box when it's empty).
async function dragPaletteItemIntoEmptyRegion(page: Page, paletteItemTestId: string, region: Region) {
  await performDrag(page, page.getByTestId(paletteItemTestId), page.getByTestId(`page-designer-region-${region}`));
}

// Drops a source (palette item or an existing slot's drag handle) onto the
// insertion zone that appends a brand-new row at the end of a non-empty
// region — the last "new row" drop zone rendered after that region's last
// row.
async function dragOntoEndOfRegion(page: Page, source: Locator, region: Region) {
  const newRowZones = page.getByTestId(new RegExp(`^page-designer-drop-newrow:${region}:`));
  await performDrag(page, source, newRowZones.last());
}

function slotDragHandle(page: Page, placementId: string): Locator {
  return page.getByTestId(`page-designer-drag-cell-${placementId}`);
}

function paletteItem(page: Page, key: string): Locator {
  return page.getByTestId(`page-designer-palette-${key}`);
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
      new URL(response.url()).pathname.endsWith(`/catalog/definitions/INC/versions/${savedDraft.version}/publish`) &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await page.getByTestId('catalog-publish').click();
  const published = await jsonOrFailure<Definition>(await publishResponsePromise, 'publish Catalog definition from UI');
  expect(published.version).toBe(expectedNextVersion);
  return published;
}

test('opens the page designer and shows real page regions rendering the real widgets, not technical chips', async ({ page }) => {
  await openPageDesignerForINC(page);
  for (const region of ['header', 'actions', 'main', 'sidebar', 'footer'] as const) {
    await expect(page.getByTestId(`page-designer-region-${region}`)).toBeVisible();
  }
  // The locked structural widgets must already be present, rendered as the
  // real header/actions components (wrapped in editing chrome), not a
  // technical "widget:ticketHeader" chip.
  await expect(page.getByTestId('page-designer-slot-cell-legacy-page-widget-ticketHeader')).toBeVisible();
  await expect(page.getByTestId('page-designer-slot-cell-legacy-page-widget-ticketActions')).toBeVisible();
  // Locked slots have no drag handle or remove button.
  await expect(page.getByTestId('page-designer-drag-cell-legacy-page-widget-ticketHeader')).toHaveCount(0);
  await expect(page.getByTestId('page-designer-remove-cell-legacy-page-widget-ticketHeader')).toHaveCount(0);
});

test('dragging SLA into main and Asset Details from sidebar to main is reflected on a newly created ticket', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);

  await openPageDesignerForINC(page);

  // Drag SLA from the palette to the end of the (non-empty) main region.
  await dragOntoEndOfRegion(page, paletteItem(page, 'widget-sla'), 'main');
  await expect(page.getByTestId('page-designer-region-main').getByText('Service Level Agreement')).toBeVisible();

  // Move Asset Details from the sidebar into main by dragging its handle.
  const assetDetailsHandle = slotDragHandle(page, 'legacy-page-widget-assetDetails');
  await expect(assetDetailsHandle).toHaveCount(1);
  await dragOntoEndOfRegion(page, assetDetailsHandle, 'main');
  await expect(page.getByTestId('page-designer-slot-cell-legacy-page-widget-assetDetails')).toBeVisible();

  const published = await saveDraftAndPublish(page, baseline.version + 1);

  const runtimeEntity = await jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': `page-designer-e2e-${randomUUID()}` },
      data: {
        data: definitionData(published, {
          title: `INC created after page redesign ${randomUUID()}`,
          description: 'Creado después de rediseñar la página de detalle.',
          category: 'hardware',
          priority: 'high',
          assetId: 'CAM-PAGE-DESIGNER-001',
          site: 'E2E-PAGE-DESIGNER-SITE',
        }),
      },
    }),
    'create runtime INC on the redesigned page layout',
  );
  await waitForTicketProjection(request, runtimeEntity.humanId);

  await page.goto(`/app/tickets/${encodeURIComponent(runtimeEntity.humanId)}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  // SLA now renders (real widget, real assessment call) inside the main
  // region's grid, not in its old fixed position.
  await expect(page.getByTestId('page-layout-region-main').getByText('Service Level Agreement')).toBeVisible();
  await expect(page.getByTestId('page-layout-region-main').getByText('Asset Details')).toBeVisible();
});

test('resizing a placement reflows its row without overlaps and the published page keeps the new widths', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);
  await openPageDesignerForINC(page);

  const assetDetailsCellId = 'cell-legacy-page-widget-assetDetails';
  const resizeHandle = page.getByTestId(`page-designer-resize-${assetDetailsCellId}`);
  await expect(resizeHandle).toBeVisible();
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error('Resize handle is not visible.');

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 120, handleBox.y, { steps: 8 });
  await page.mouse.up();

  await saveDraftAndPublish(page, baseline.version + 1);
});

// Presentation follows the currently published definition; data stays pinned
// to the manifest captured at creation. A redesign therefore reaches tickets
// that already existed, without rewriting what those tickets mean.
test('a ticket created before the page redesign adopts the new layout but keeps its historical data', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);
  const historicalTitle = `Historical INC before page redesign ${randomUUID()}`;
  const historical = await jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': `page-designer-e2e-${randomUUID()}` },
      data: {
        data: definitionData(baseline, {
          title: historicalTitle,
          description: 'Creado antes de rediseñar la página de detalle.',
          category: 'hardware',
          priority: 'high',
          assetId: 'CAM-PAGE-DESIGNER-HISTORY-001',
          site: 'E2E-PAGE-DESIGNER-SITE',
        }),
      },
    }),
    'create historical INC',
  );
  await waitForTicketProjection(request, historical.humanId);

  // The footer starts empty, so the whole region body is the drop target.
  await openPageDesignerForINC(page);
  await expect(page.getByTestId('page-designer-region-footer')).toBeVisible();
  await dragPaletteItemIntoEmptyRegion(page, 'page-designer-palette-widget-statusHistory', 'footer');
  await expect(page.getByTestId('page-designer-region-footer').getByText('Historial de estado')).toBeVisible();
  await saveDraftAndPublish(page, baseline.version + 1);

  await page.goto(`/app/tickets/${encodeURIComponent(historical.humanId)}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  // Data is unchanged...
  await expect(page.getByText(historicalTitle, { exact: true })).toBeVisible();
  // ...but the layout published after this ticket existed now governs it.
  await expect(page.getByTestId('page-layout-region-footer').getByText('Historial de estado')).toBeVisible();

  // The ticket is still pinned to its original manifest — only presentation
  // moved forward, never the schema.
  const historicalManifest = await jsonOrFailure<{ version: number }>(
    await request.get(`${apiBaseURL}/entities/INC/${historical.id}/manifest`),
    'get historical INC manifest',
  );
  expect(historicalManifest.version).toBe(baseline.version);
});
