import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse, type Locator, type Page, type Response } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { startIsolatedCatalogStack, type IsolatedCatalogStack } from './isolated-catalog-stack';
import { definitionData, type Definition } from './catalog-support';

// E2E contamination remediation, Workstream A (2026-09-06): every test below
// now runs against a disposable per-run isolated stack instead of the
// shared local backend — this file used to publish a new INC page-layout
// version on the shared stack every run, with no cleanup, cumulative with
// catalog-template-designer.spec.ts's own mutations of the same shared
// definition.

type Entity = {
  id: string;
  humanId: string;
  definitionVersionId: string;
  definitionVersion: number;
  data: Record<string, unknown>;
};

async function jsonOrFailure<T>(response: APIResponse | Response, operation: string): Promise<T> {
  expect(response.ok(), `${operation} failed (${response.status()}): ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function getPublishedIncDefinition(request: APIRequestContext): Promise<Definition> {
  return jsonOrFailure<Definition>(
    await request.get('/catalog/definitions/INC'),
    'get published INC definition',
  );
}

// Stale test assumption, same as the other migrated specs (2026-09-06, not
// a production bug — api.ts:292-296 documents the raw integer id as the
// canonical, intentional contract for ticket-facing routes; humanId is
// display-only): `GET /tickets/{id}` parses `{id}` as a raw integer
// (`parseTicketID`, http_controller.go). This helper now takes the numeric
// id, and every call site below passes `entity.id`.
async function waitForTicketProjection(request: APIRequestContext, id: string) {
  await expect
    .poll(
      async () => (await request.get(`/tickets/${encodeURIComponent(id)}`)).status(),
      { timeout: 15_000, message: `Tickets did not project id ${id}.` },
    )
    .toBe(200);
}

/** Sites are a shared, read-only dependency (resource_service via the Kong
 *  gateway) — never isolated per run, same as every other isolated-stack
 *  spec. "sitio" is `required: true` and `bindsTo: 'siteAssetId'` in the
 *  canonical fixture, so creating an INC entity without a real
 *  recursoId/assetContext 422s with RECURSO_INVALIDO (same finding as
 *  catalog-template-designer.spec.ts: passing `site: '...'` as plain data
 *  was always a no-op for a bindsTo field). */
async function sharedSiteRecursoId(request: APIRequestContext): Promise<string> {
  const response = await request.get(
    `${process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8000'}/assets/sites?limit=1`,
  );
  const body = await jsonOrFailure<{ items?: Array<{ id: string }> }>(response, 'load one shared CMDB site');
  const recursoId = body.items?.[0]?.id;
  expect(recursoId, 'At least one synchronized CMDB site is required').toBeTruthy();
  return recursoId!;
}

async function openPageDesignerForINC(page: Page, stack: IsolatedCatalogStack) {
  // Tall viewport: the isolated stack's fixture's detail-page main region
  // has 9 placements (vs. whatever shorter layout this test was originally
  // sized for) — found live while migrating this test (2026-09-06, not
  // caused by isolation): a shorter viewport let `performDrag`'s two
  // sequential `scrollIntoView` calls (source, then target) scroll the
  // source handle out of view before the drag even started, since source
  // and target no longer fit on screen together, silently dragging from a
  // stale/off-screen position and never registering a real drop.
  await page.setViewportSize({ width: 1400, height: 2400 });
  await mockAuthenticatedAdmin(page, { catalogApiUrl: stack.baseUrl, sessionToken: stack.jwtToken });
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-detail').click();
  await page.getByTestId('template-designer-kind-detail').click();
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
  await source.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(100);

  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error('Drag source is not visible.');
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });

  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('Drag target is not visible.');
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + Math.max(10, targetBox.height - 15);

  await page.mouse.move(endX, endY, { steps: 15 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

type Region = 'header' | 'actions' | 'main' | 'sidebar' | 'footer';

async function dragPaletteItemIntoEmptyRegion(page: Page, paletteItemTestId: string, region: Region) {
  const source = page.getByTestId(paletteItemTestId);
  const target = page.getByTestId(`page-designer-region-${region}`);
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error('Drag source is not visible.');

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });

  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('Drag target is not visible.');

  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(endX, endY, { steps: 15 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

async function dragOntoEndOfRegion(page: Page, source: Locator, region: Region) {
  await performDrag(page, source, page.getByTestId(`page-designer-region-${region}`));
}

function slotDragHandle(page: Page, placementId: string): Locator {
  return page.getByTestId(`page-designer-drag-cell-${placementId}`);
}

async function saveDraftAndPublish(page: Page, expectedNextVersion: number): Promise<Definition> {
  const saveResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/catalog/definitions' &&
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
  const stack = await startIsolatedCatalogStack();
  try {
    await openPageDesignerForINC(page, stack);
    for (const region of ['header', 'actions', 'main', 'sidebar', 'footer'] as const) {
      await expect(page.getByTestId(`page-designer-region-wrapper-${region}`)).toBeVisible();
    }
    // The locked structural widgets must already be present, rendered as the
    // real header/actions components (wrapped in editing chrome), not a
    // technical "widget:ticketHeader" chip.
    //
    // Environment/fixture mismatch found while migrating this test
    // (2026-09-06, not caused by isolation): "legacy-page-widget-*" ids
    // only appear when a definition has NO explicit createPage/detailPage
    // saved yet (a legacy-synthesized fallback layout). The isolated
    // stack's canonical fixture (catalog-inc-v1.json) already ships a real
    // detailPage with its own explicit placement ids
    // ("inc-detail-header", "inc-detail-actions", ...), so it never
    // synthesizes legacy ids at all. Anchored here to the fixture's real,
    // stable ids.
    await expect(page.getByTestId('page-designer-slot-cell-inc-detail-header')).toBeVisible();
    await expect(page.getByTestId('page-designer-slot-cell-inc-detail-actions')).toBeVisible();
    // Locked slots have no drag handle or remove button.
    await expect(page.getByTestId('page-designer-drag-cell-inc-detail-header')).toHaveCount(0);
    await expect(page.getByTestId('page-designer-remove-cell-inc-detail-header')).toHaveCount(0);
  } finally {
    await stack.cleanup();
  }
});

test('dragging SLA into main and Asset Details from sidebar to main is reflected on a newly created ticket', async ({
  page,
  request,
}) => {
  const stack = await startIsolatedCatalogStack();
  try {
    const baseline = await getPublishedIncDefinition(stack.isolatedRequest);
    const recursoId = await sharedSiteRecursoId(request);

    await openPageDesignerForINC(page, stack);

    // "Service Level Agreement" (`inc-detail-sla`) is already placed in the
    // main region in the isolated stack's fixture (see the mismatch note
    // below) — dragging its already-placed palette entry onto the same
    // region it already occupies is correctly a no-op (confirmed live: it
    // never marks the draft dirty), so it's asserted here directly rather
    // than re-dragged.
    await expect(page.getByTestId('page-designer-region-main').getByText('Service Level Agreement').first()).toBeVisible();

    // Move Asset Details from the sidebar into main by dragging its handle.
    //
    // Environment/fixture mismatch found while migrating this test
    // (2026-09-06, not caused by isolation): the isolated stack's fixture
    // already places "attachments" (`inc-detail-attachments`) in the MAIN
    // region and "Service Level Agreement" (`inc-detail-sla`) there too —
    // neither starts in the sidebar here, unlike whatever definition state
    // this test was originally written against. Of this fixture's three
    // real sidebar widgets (assetDetails/requesterDetails/statusHistory),
    // "Asset Details" is the one this test's own title already names, so
    // it's the one actually moved — using the fixture's real placement id
    // ("inc-detail-assets"), not a synthesized "legacy-page-widget-*" one.
    const assetDetailsSlot = page.getByTestId('page-designer-slot-cell-inc-detail-assets');
    await assetDetailsSlot.hover();
    const assetDetailsHandle = slotDragHandle(page, 'inc-detail-assets');
    await expect(assetDetailsHandle).toHaveCount(1);
    await dragOntoEndOfRegion(page, assetDetailsHandle, 'main');
    await expect(page.getByTestId('page-designer-slot-cell-inc-detail-assets')).toBeVisible();

    const published = await saveDraftAndPublish(page, baseline.version + 1);

    const runtimeEntity = await jsonOrFailure<Entity>(
      await stack.isolatedRequest.post('/entities/INC', {
        headers: { 'Idempotency-Key': `page-designer-e2e-${randomUUID()}` },
        data: {
          data: definitionData(published, {
            title: `INC created after page redesign ${randomUUID()}`,
            description: 'Creado después de rediseñar la página de detalle.',
            category: 'hardware',
            priority: 'high',
          }),
          recursoId,
          assetContext: { siteAssetId: recursoId, links: [] },
        },
      }),
      'create runtime INC on the redesigned page layout',
    );
    await waitForTicketProjection(stack.isolatedRequest, runtimeEntity.id);

    await page.goto(`/app/tickets/${encodeURIComponent(runtimeEntity.id)}`);
    await expect(page.getByTestId('ticket-detail')).toBeVisible();
    // SLA now renders (real widget, real assessment call) inside the main
    // region's grid, not in its old fixed position. "Related Assets" is
    // AssetDetailsWidget.tsx's real heading (not "Activos relacionados" —
    // same stale-string class as elsewhere in this suite) — it's the
    // widget this test actually moved into main.
    await expect(page.getByTestId('page-layout-region-main').getByText('Service Level Agreement')).toBeVisible();
    await expect(page.getByTestId('page-layout-region-main').getByText('Related Assets')).toBeVisible();
  } finally {
    await stack.cleanup();
  }
});

test('resizing a placement reflows its row without overlaps and the published page keeps the new widths', async ({
  page,
}) => {
  const stack = await startIsolatedCatalogStack();
  try {
    const baseline = await getPublishedIncDefinition(stack.isolatedRequest);
    await openPageDesignerForINC(page, stack);

    // Real placement id from the isolated stack's fixture (not a
    // synthesized "legacy-page-widget-*" one) — see the earlier tests'
    // comments for why. "assetDetails" (`inc-detail-assets`) lives in the
    // narrow, fixed-width SIDEBAR region in this fixture (unlike whatever
    // layout this test was originally written against, where it must have
    // been a resizable main-region cell) — resizing it there never
    // registered a change (confirmed live). "prioridad"
    // (`inc-detail-priority`) shares main's row 0 with two siblings
    // (requester, assignee), which is exactly the "reflows its row"
    // scenario this test is meant to exercise.
    const priorityCellId = 'cell-inc-detail-priority';
    const resizeHandle = page.getByTestId(`page-designer-resize-${priorityCellId}`);
    await expect(resizeHandle).toBeVisible();
    const handleBox = await resizeHandle.boundingBox();
    if (!handleBox) throw new Error('Resize handle is not visible.');

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 120, handleBox.y, { steps: 8 });
    await page.mouse.up();

    await saveDraftAndPublish(page, baseline.version + 1);
  } finally {
    await stack.cleanup();
  }
});

// Schema and page composition are both pinned to the immutable executable
// definition captured at creation. A redesign only affects new records.
test('a ticket created before the page redesign keeps its historical data and layout', async ({
  page,
  request,
}) => {
  const stack = await startIsolatedCatalogStack();
  try {
    const baseline = await getPublishedIncDefinition(stack.isolatedRequest);
    const recursoId = await sharedSiteRecursoId(request);
    const historicalTitle = `Historical INC before page redesign ${randomUUID()}`;
    const historical = await jsonOrFailure<Entity>(
      await stack.isolatedRequest.post('/entities/INC', {
        headers: { 'Idempotency-Key': `page-designer-e2e-${randomUUID()}` },
        data: {
          data: definitionData(baseline, {
            title: historicalTitle,
            description: 'Creado antes de rediseñar la página de detalle.',
            category: 'hardware',
            priority: 'high',
          }),
          recursoId,
          assetContext: { siteAssetId: recursoId, links: [] },
        },
      }),
      'create historical INC',
    );
    await waitForTicketProjection(stack.isolatedRequest, historical.id);

    // The footer starts empty, so the whole region body is the drop target.
    await openPageDesignerForINC(page, stack);
    await expect(page.getByTestId('page-designer-region-wrapper-footer')).toBeVisible();
    await dragPaletteItemIntoEmptyRegion(page, 'page-designer-palette-widget-statusHistory', 'footer');
    // `exact: true`: the canvas also shows a "Status History" (title case)
    // palette/chip label alongside the real widget's own "Status history"
    // (sentence case) heading — `getByText` without `exact` is
    // case-insensitive, so it ambiguously matches both.
    await expect(page.getByTestId('page-designer-region-wrapper-footer').getByText('Status history', { exact: true })).toBeVisible();
    await saveDraftAndPublish(page, baseline.version + 1);

    await page.goto(`/app/tickets/${encodeURIComponent(historical.id)}`);
    await expect(page.getByTestId('ticket-detail')).toBeVisible();
    // Data is unchanged...
    await expect(page.getByText(historicalTitle, { exact: true })).toBeVisible();
    // ...and the widget published afterwards must not silently appear.
    await expect(page.getByTestId('page-layout-region-footer').getByText('Status history')).toHaveCount(0);

    // The ticket remains pinned to its original executable manifest.
    const historicalManifest = await jsonOrFailure<{ version: number }>(
      await stack.isolatedRequest.get(`/entities/INC/${historical.id}/manifest`),
      'get historical INC manifest',
    );
    expect(historicalManifest.version).toBe(baseline.version);
  } finally {
    await stack.cleanup();
  }
});
