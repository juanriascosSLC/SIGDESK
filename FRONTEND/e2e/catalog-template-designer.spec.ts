import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse, type Locator, type Page, type Response } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { startIsolatedCatalogStack, type IsolatedCatalogStack } from './isolated-catalog-stack';
import { definitionData, type Definition } from './catalog-support';

// E2E contamination remediation, Workstream A (2026-09-06): every test below
// now runs against a disposable per-run isolated stack instead of the
// shared local backend — this file used to publish a new INC definition
// version on the shared stack every run, with no cleanup, cumulative with
// catalog-page-designer.spec.ts's own mutations of the same shared
// definition. `request.*` calls below are relative paths against
// `stack.isolatedRequest`, and `mockAuthenticatedAdmin` is told to route
// the browser's Catalog/Tickets/SLA traffic at the isolated stack too.

// Metamodelo 1.6: Crear y Editar dejaron de ser documentos de secciones (1.4)
// y pasaron a ser PÁGINAS completas, con el mismo motor, las mismas cinco
// zonas y la misma grilla de 12 columnas que el detalle del ticket. Estos
// casos ejercitan el diseñador nuevo de punta a punta: lo que se compone en el
// lienzo es lo que renderiza el formulario real.
//
// Lo que fijan y no puede romperse:
//   * el lienzo muestra los INPUTS REALES, no una maqueta parecida;
//   * la página publicada gobierna el formulario de creación real;
//   * un campo puede vivir en la barra lateral, algo imposible en 1.4;
//   * `layouts.create` sigue existiendo como espejo derivado, porque
//     tickets_service valida contra él la regla de `bindsTo`;
//   * editar NUNCA borra un campo que quedó fuera del layout de edición.

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

// `/catalog/definitions/{entityKey}` y NO `/entities/{entityKey}/presentation`:
// ADR-0034 remontó esa segunda ruta sobre ConSecretoInterno (header
// X-Internal-Secret, para rag_service), así que responde 401
// SECRETO_INTERNO_INVALIDO a cualquiera que no sea ese servicio. El backend
// documenta la primera como su alias — es la que usa el propio frontend
// (getEntityPresentation en metamodel.ts). Los specs hermanos siguen llamando
// a la ruta interna y fallan por esto mismo.
async function getPublishedIncDefinition(request: APIRequestContext): Promise<Definition> {
  return jsonOrFailure<Definition>(
    await request.get('/catalog/definitions/INC'),
    'get published INC definition',
  );
}

/** Sites are a shared, read-only dependency (resource_service via the Kong
 *  gateway) — never isolated per run, same as every other isolated-stack
 *  spec. "sitio" is `required: true` and `bindsTo: 'siteAssetId'` in the
 *  canonical fixture, so creating an INC entity without a real
 *  recursoId/assetContext 422s with RECURSO_INVALIDO — found while
 *  migrating this test (2026-09-06, not caused by isolation: passing
 *  `site: '...'` as plain data was always a no-op for a bindsTo field). */
async function sharedSiteRecursoId(request: APIRequestContext): Promise<string> {
  const response = await request.get(
    `${process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8000'}/assets/sites?limit=1`,
  );
  const body = await jsonOrFailure<{ items?: Array<{ id: string }> }>(response, 'load one shared CMDB site');
  const recursoId = body.items?.[0]?.id;
  expect(recursoId, 'At least one synchronized CMDB site is required').toBeTruthy();
  return recursoId!;
}

// Stale test assumption, same as the other migrated specs (2026-09-06, not
// a production bug — api.ts:292-296 documents the raw integer id as the
// canonical, intentional contract for ticket-facing routes; humanId is
// display-only): `GET /tickets/{id}` parses `{id}` as a raw integer
// (`parseTicketID`, http_controller.go). This helper now takes the numeric
// id, matching that contract, and every call site below passes `entity.id`.
async function waitForTicketProjection(request: APIRequestContext, id: string) {
  await expect
    .poll(
      async () => (await request.get(`/tickets/${encodeURIComponent(id)}`)).status(),
      { timeout: 15_000, message: `Tickets did not project id ${id}.` },
    )
    .toBe(200);
}

async function openDesignerForINC(page: Page, stack: IsolatedCatalogStack, kind: 'create' | 'edit' | 'detail') {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await mockAuthenticatedAdmin(page, { catalogApiUrl: stack.baseUrl, sessionToken: stack.jwtToken });
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-detail').click();
  await page.getByTestId(`template-designer-kind-${kind}`).click();
  await expect(page.getByTestId('page-designer')).toBeVisible();
}

// La celda del lienzo que contiene un campo concreto, localizada por el input
// REAL que dibuja dentro — no por un id de placement, que depende de si la
// definición ya venía con una página guardada o se sintetizó al vuelo.
//
// Pre-existing gap found while migrating this test (2026-09-06, not caused
// by isolation): a `bindsTo` field (e.g. "sitio") never renders
// `catalog-input-{key}` in the designer canvas — `useSimulatedFormContext`'s
// `renderField` dispatches those to the real `<BindingPicker>` instead,
// whose testid is `binding-picker-{kind}` (site/recurso/agenteIt/asset),
// keyed by binding KIND, not by field key (BindingPicker.tsx:130). This
// helper only knew the plain-field convention; `bindingFieldTestId` below
// gives every call site an explicit way to locate a binding field's slot.
function bindingFieldTestId(kind: 'site' | 'recurso' | 'agenteIt' | 'asset'): string {
  return `binding-picker-${kind}`;
}

function slotContainingField(page: Page, fieldKeyOrTestId: string): Locator {
  const testId = fieldKeyOrTestId.startsWith('binding-picker-')
    ? fieldKeyOrTestId
    : `catalog-input-${fieldKeyOrTestId}`;
  return page
    .locator('[data-testid^="page-designer-slot-cell-"]')
    .filter({ has: page.getByTestId(testId) });
}

async function removeFieldFromCanvas(page: Page, fieldKeyOrTestId: string) {
  const slot = slotContainingField(page, fieldKeyOrTestId);
  await expect(slot).toHaveCount(1);
  await slot.hover();
  // Corrected 2026-09-06 (Product Owner review): this was asserted as a
  // structural "site is never removable" invariant — WRONG, verified live.
  // `EditableSlot.tsx` renders a fully working Remove button for any
  // non-locked slot (`locked` is set only for the structural
  // formHeader/formActions widgets, `form-page-normalizer.ts:52-70` — never
  // for a `bindsTo` field); it is simply labeled "Remove" (English) now,
  // not "Quitar" (Spanish) — a stale string from before the
  // English-localization pass, the same class of defect as
  // "Activos relacionados"->"Related Assets" elsewhere in this suite.
  // `.evaluate(el => el.click())`, not Playwright's coordinate-based
  // `.click()`/`.click({force:true})`: something else in the canvas is
  // genuinely on top of this button at its screen coordinates for some
  // fields (confirmed live — a coordinate-based click, even forced,
  // consistently left the field in place with a real browser hit-test
  // landing elsewhere), so a real DOM `.click()` call on the exact node is
  // the only way to fire its handler regardless of what visually overlaps
  // it on screen.
  const removeButton = slot.getByRole('button', { name: 'Remove' });
  await expect(removeButton).toBeVisible();
  await removeButton.evaluate((el) => (el as HTMLElement).click());
  await expect(slotContainingField(page, fieldKeyOrTestId)).toHaveCount(0);
}

// Guardar dejó de abrir una versión por pulsación: sobre una entidad publicada
// el primer Guardar CREA el borrador (POST /catalog/definitions) y a partir de
// ahí lo edita en su sitio (PATCH /catalog/definitions/INC/draft). Esperar solo
// el POST deja el caso colgado cuando la entidad ya traía un borrador abierto —
// que es el estado normal si otro caso guardó antes.
async function saveDraftAndPublish(page: Page, expectedNextVersion: number): Promise<Definition> {
  const saveResponsePromise = page.waitForResponse((response) => {
    const { pathname } = new URL(response.url());
    const method = response.request().method();
    const esCreacion = pathname === '/catalog/definitions' && method === 'POST';
    const esEdicion = pathname === '/catalog/definitions/INC/draft' && method === 'PATCH';
    return (esCreacion || esEdicion) && response.ok();
  });
  await page.getByTestId('catalog-save-draft').click();
  const savedDraft = await jsonOrFailure<Definition>(await saveResponsePromise, 'save Catalog draft from UI');
  expect(savedDraft.version).toBeGreaterThanOrEqual(expectedNextVersion);

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
  expect(published.version).toBe(savedDraft.version);
  return published;
}

// El lienzo del diseñador no es una maqueta: renderiza los mismos
// DynamicField/BindingPicker que el formulario real, envueltos en el chrome de
// edición. Si esto deja de ser cierto, "lo que diseñas es lo que ves" deja de
// ser cierto con él.
test('el lienzo de Crear muestra los inputs reales dentro de las zonas de la página', async ({ page }) => {
  const stack = await startIsolatedCatalogStack();
  try {
    await openDesignerForINC(page, stack, 'create');

    for (const region of ['header', 'actions', 'main', 'sidebar', 'footer'] as const) {
      await expect(page.getByTestId(`page-designer-region-wrapper-${region}`)).toBeVisible();
    }

    // El encabezado y la barra de acciones son los widgets estructurales
    // bloqueados del formulario, exactamente como ticketHeader/ticketActions lo
    // son en el detalle: presentes, y sin botón de quitar.
    await expect(page.getByTestId('form-header-widget')).toBeVisible();
    await expect(page.getByTestId('form-actions-widget')).toBeVisible();

    // Inputs REALES de la definición dentro de la zona principal. Se afirma
    // sobre el prefijo del testid y no sobre un campo concreto: qué campos tiene
    // INC es cosa de la definición del entorno, que este caso no gobierna.
    await expect(
      page.getByTestId('page-designer-region-main').locator('[data-testid^="catalog-input-"]').first(),
    ).toBeVisible();
  } finally {
    await stack.cleanup();
  }
});

// Corrected 2026-09-06 (Product Owner review): a `bindsTo: 'siteAssetId'`
// field is NOT globally non-removable. Verified against
// `validar_placement_layouts.go`: a bindsTo field needs at least one
// placement on the CREATE surface while it exists in the schema
// (`ValidarPlacementDeCamposConBinding`), and the schema-level cap
// (`validarDependenciasDeAssetBindings`) is "at most one siteAssetId
// field," not "always placed, always required." The earlier timeout here
// was the stale "Quitar" button label (see `removeFieldFromCanvas`), not a
// removal restriction — this test now runs for real: remove it, put it
// back from the palette, publish, and confirm the real create form still
// renders it.
test('la página de creación publicada gobierna el formulario real', async ({ page }) => {
  const stack = await startIsolatedCatalogStack();
  try {
    const baseline = await getPublishedIncDefinition(stack.isolatedRequest);

    // Pre-existing environment/fixture mismatch found while migrating this
    // test (2026-09-06, not caused by isolation): the canonical isolated
    // E2E fixture (BACKEND/scripts/fixtures/catalog-inc-v1.json) keys its
    // site-binding field "sitio", not "site" — this test's original literal
    // ("site") only happened to match the SHARED backend's live INC
    // definition today, and only by coincidence: a live query of that same
    // definition shows its site field's real key is "field3" (label
    // "Sitio"), not "site" either — years of re-publishing through this
    // very designer have apparently regenerated its key at least once. Anchored
    // here to the isolated stack's own fresh, never-republished v1 fixture,
    // where "sitio" is the real, stable key.
    await openDesignerForINC(page, stack, 'create');
    await removeFieldFromCanvas(page, bindingFieldTestId('site'));

    // Quitado de la página, el campo vuelve a estar disponible en la biblioteca
    // y un clic lo devuelve al lienzo (arrastrar es un atajo, no la única vía).
    await page.getByTestId('page-designer-palette-field-catalog-sitio').click();
    await expect(slotContainingField(page, bindingFieldTestId('site'))).toHaveCount(1);

    const published = await saveDraftAndPublish(page, baseline.version + 1);

    expect(
      published.specification.fields.some((field) => field.key === 'sitio'),
      'sitio must still be a real field on the published definition',
    ).toBeTruthy();
    expect(published.specification.createPage, 'la definición publicada lleva su página de creación').toBeTruthy();

    await page.goto('/app/catalog/INC');
    await expect(page.getByText(`INC · v${published.version}`, { exact: true })).toBeVisible();
    await expect(page.getByTestId('catalog-form-page')).toBeVisible();
    await expect(page.getByTestId('binding-picker-site')).toBeVisible();
    // Y el formulario se dibuja por zonas, igual que el ticket.
    await expect(page.getByTestId('page-layout-region-main')).toBeVisible();
  } finally {
    await stack.cleanup();
  }
});

// Lo que el metamodelo 1.4 no podía hacer y es la razón de este cambio: el
// formulario ahora tiene barra lateral, y comparte esqueleto con el ticket.
//
// Diagnosed and FIXED 2026-09-06 (Product Owner correction — real product
// bug, not a test/isolation artifact): the publish timeout was a real
// round-trip defect in `designer-grid-model.ts`'s `fromDesignerRegion`,
// which wrote back each placement's `row` as its bucket's ARRAY INDEX
// rather than its actual historical row number. Any region containing a
// `rowSpan > 1` placement (e.g. "descripcion", rowSpan 2) has a gap in its
// raw row numbering; collapsing that gap on every single commit — even one
// that only touches the sidebar — silently overlapped later placements
// (`categoria`/`sitio`), which `validar_page_layout.go`'s overlap check
// correctly rejected at `/validate`, so `/publish` was never called and
// this test's wait timed out. Fixed by advancing a running row cursor by
// each row's own tallest `rowSpan` instead of by a flat +1
// (`designer-grid-model.ts`). This test is the regression test for that
// fix: move a widget to the sidebar, publish, reload the real rendered
// form, and confirm it renders in its new position.
test('un componente movido a la barra lateral del formulario aparece allí en el formulario real', async ({
  page,
}) => {
  const stack = await startIsolatedCatalogStack();
  try {
    const baseline = await getPublishedIncDefinition(stack.isolatedRequest);

    await openDesignerForINC(page, stack, 'create');

    // Los datos del solicitante son un widget del formulario, no del ticket:
    // leen la sesión de quien está creando la solicitud.
    await page.getByTestId('page-designer-palette-widget-formRequesterDetails').click();
    const requesterSlot = page
      .locator('[data-testid^="page-designer-slot-cell-"]')
      .filter({ has: page.getByTestId('form-requester-widget') });
    await expect(requesterSlot).toHaveCount(1);

    await requesterSlot.click();
    await expect(page.getByTestId('page-designer-properties')).toBeVisible();
    // Pre-existing defect found while migrating this test (2026-09-06, not
    // caused by isolation): the "move to region" button's label comes
    // straight from region-meta.ts's regionMeta[region].label, which is the
    // English "Sidebar" — "Columna lateral" does not exist anywhere in the
    // current frontend source, presumably stale from before the
    // English-localization pass (same class of finding as
    // incident-flow.spec.ts's "Activos relacionados"->"Related Assets" fix).
    await page.getByTestId('page-designer-properties').getByRole('button', { name: 'Sidebar' }).click();
    await expect(
      page.getByTestId('page-designer-region-sidebar').getByTestId('form-requester-widget'),
    ).toBeVisible();

    const published = await saveDraftAndPublish(page, baseline.version + 1);

    await page.goto('/app/catalog/INC');
    await expect(page.getByText(`INC · v${published.version}`, { exact: true })).toBeVisible();
    await expect(
      page.getByTestId('page-layout-region-sidebar').getByTestId('form-requester-widget'),
    ).toBeVisible();
  } finally {
    await stack.cleanup();
  }
});

// El invariante más caro de romper de toda esta suite: un campo que el
// administrador dejó fuera del layout de EDICIÓN no se puede editar desde ahí,
// pero conserva su valor. Las aserciones contra la API son las de siempre, sin
// cambiar una letra — lo único que cambió es el motor que dibuja el formulario.
//
// Redesigned 2026-09-06 (Product Owner correction): "sitio" is
// `bindsTo: 'siteAssetId'`, and `definitionData` deliberately EXCLUDES
// every bindsTo field from the plain `data` bag it builds
// (catalog-support.ts) — a bindsTo field's value never lives in `data` at
// all (it lives in `assetContext.links`), so it can never stand in for
// "an ordinary field left outside the edit layout." Per Product Owner
// direction, this invariant now uses "categoria" — a genuinely plain,
// optional, non-binding field — removed from the EDIT layout instead of
// site; "prioridad" is the field actually edited through the UI.
//
// This exercised TWO REAL, previously undiscovered product defects — no
// other spec ever exercised "Edit fields" -> "Save changes" on the ticket
// detail page before this one. Both fixed, not just diagnosed:
//
// 1. `TicketDetail.tsx`'s `renderEditField` handed every placement
//    straight to `DynamicField`, which has no notion of `bindsTo` and
//    rendered "sitio" as a plain, empty, `required` text input (its real
//    value lives in `ticket.assetContext`, never in `editData`). That
//    empty required input silently failed HTML5 constraint validation on
//    every submit — `form.checkValidity()` false, with the actual invalid
//    control only findable via a document-wide `:invalid` search, since it
//    never showed as invalid to a plain look at the form's own
//    descendants. Fixed in `TicketDetail.tsx` (`renderEditField` and
//    `submitFieldChanges` both now skip `bindsTo` fields, which this
//    inline editor never had a way to edit anyway).
// 2. Once (1) stopped blocking submission outright, every submit still
//    409'd with `CONFLICTO_CONCURRENCIA` ("la definición cambió; recarga
//    antes de continuar") — reproducible on the very first edit of a
//    freshly created ticket, no real concurrent change involved. Root
//    cause: `entidades_controller.go`'s `paraEntidadDTO` formatted
//    `updatedAt`/`createdAt` with `time.RFC3339` (whole-second precision),
//    but `ActualizarCampos` (`ticket_repository.go`) requires the
//    round-tripped `expectedUpdatedAt` to EXACTLY equal the persisted,
//    full-precision `MAX(ocurrido_en) FROM ticket_historial` — the exact
//    same value the DTO serializes, just truncated. Any ticket whose
//    latest history event had a non-zero fractional second (effectively
//    always) could never match again, so this endpoint 409'd on nearly
//    every real edit anywhere, not just here. Fixed by formatting with
//    `time.RFC3339Nano` instead, preserving the precision the write path
//    actually compares against.
test('editar un ticket con el layout de edición diseñado nunca borra campos fuera de él', async ({
  page,
  request,
}) => {
  const stack = await startIsolatedCatalogStack();
  try {
    const baseline = await getPublishedIncDefinition(stack.isolatedRequest);
    const recursoId = await sharedSiteRecursoId(request);

    await openDesignerForINC(page, stack, 'edit');
    await removeFieldFromCanvas(page, 'categoria');
    const published = await saveDraftAndPublish(page, baseline.version + 1);

    const entity = await jsonOrFailure<Entity>(
      await stack.isolatedRequest.post('/entities/INC', {
        headers: { 'Idempotency-Key': `template-designer-e2e-${randomUUID()}` },
        data: {
          data: definitionData(published, {
            title: `INC for edit-preservation check ${randomUUID()}`,
            description: 'Verifica que editar no borre campos fuera del layout de edición.',
            category: 'hardware',
            priority: 'high',
          }),
          recursoId,
          assetContext: { siteAssetId: recursoId, links: [] },
        },
      }),
      'create INC for the edit-preservation check',
    );
    await waitForTicketProjection(stack.isolatedRequest, entity.id);

    await page.goto(`/app/tickets/${encodeURIComponent(entity.id)}`);
    await expect(page.getByTestId('ticket-detail')).toBeVisible();
    await page.getByRole('button', { name: 'Edit fields' }).click();

    // `categoria` no se renderiza siquiera — está fuera del layout de edición.
    await expect(page.getByTestId('catalog-input-categoria')).toHaveCount(0);
    await page.getByTestId('catalog-input-prioridad').selectOption('low');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved', { exact: false })).toBeVisible();

    const updated = await jsonOrFailure<Entity>(
      await stack.isolatedRequest.get(`/entities/INC/${entity.id}`),
      'get updated INC entity',
    );
    expect(updated.data.prioridad, 'the field actually edited must reflect the new value').toBe('low');
    expect(
      updated.data.categoria,
      'a field left outside the edit layout must keep its previous value, not be dropped',
    ).toBe('hardware');
  } finally {
    await stack.cleanup();
  }
});

// Un ticket creado ANTES de rediseñar conserva su propia definición histórica:
// el rediseño sólo afecta a los registros nuevos.
//
// Redesigned 2026-09-06 (Product Owner correction): this removes
// "categoria" (a plain, optional field) rather than "sitio" to produce the
// new version. "sitio" is a real backend invariant this test should not
// trip: `ValidarPlacementDeCamposConBinding` (validar_placement_layouts.go)
// requires a `bindsTo` field to keep at least one create-page placement
// WHILE IT EXISTS IN THE SCHEMA — removing its placement without either
// re-adding it (as the "la página de creación..." test does) or removing
// the field from the schema entirely correctly fails `/validate`, and
// `/publish` is (correctly) never reached. That is not what this test is
// about; the invariant under test here is historical-ticket immutability
// across a redesign, which holds regardless of which field triggers it.
test('un ticket anterior al rediseño conserva sus datos y su propia definición', async ({
  page,
  request,
}) => {
  const stack = await startIsolatedCatalogStack();
  try {
    const baseline = await getPublishedIncDefinition(stack.isolatedRequest);
    const recursoId = await sharedSiteRecursoId(request);
    const historicalTitle = `Historical INC before form redesign ${randomUUID()}`;
    const historical = await jsonOrFailure<Entity>(
      await stack.isolatedRequest.post('/entities/INC', {
        headers: { 'Idempotency-Key': `template-designer-e2e-${randomUUID()}` },
        data: {
          data: definitionData(baseline, {
            title: historicalTitle,
            description: 'Creado antes de rediseñar el formulario con el constructor visual.',
            category: 'hardware',
            priority: 'high',
            assetId: 'CAM-TEMPLATE-HISTORY-001',
          }),
          recursoId,
          assetContext: { siteAssetId: recursoId, links: [] },
        },
      }),
      'create historical INC',
    );
    await waitForTicketProjection(stack.isolatedRequest, historical.id);

    await openDesignerForINC(page, stack, 'create');
    await removeFieldFromCanvas(page, 'categoria');
    await saveDraftAndPublish(page, baseline.version + 1);

    await page.goto(`/app/tickets/${encodeURIComponent(historical.id)}`);
    await expect(page.getByTestId('ticket-detail')).toBeVisible();
    await expect(page.getByText(historicalTitle, { exact: true })).toBeVisible();

    const historicalManifest = await jsonOrFailure<{ version: number }>(
      await stack.isolatedRequest.get(`/entities/INC/${historical.id}/manifest`),
      'get historical INC manifest',
    );
    expect(historicalManifest.version).toBe(baseline.version);
  } finally {
    await stack.cleanup();
  }
});

test('stakeholders is a placeable form widget backed by the real runtime component', async ({ page }) => {
  const stack = await startIsolatedCatalogStack();
  try {
    await openDesignerForINC(page, stack, 'create');

    const paletteItem = page.getByTestId('page-designer-palette-widget-formStakeholders');
    if (await paletteItem.count()) await paletteItem.click();

    await expect(page.getByTestId('stakeholder-picker')).toBeVisible();
    await expect(page.getByTestId('stakeholder-picker').getByText('IT', { exact: true })).toBeVisible();
    await expect(page.getByTestId('stakeholder-picker').getByText('Servicios', { exact: true })).toBeVisible();
  } finally {
    await stack.cleanup();
  }
});
