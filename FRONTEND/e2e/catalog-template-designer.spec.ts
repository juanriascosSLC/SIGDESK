import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse, type Locator, type Page, type Response } from '@playwright/test';
import { mockAuthenticatedAdmin, SIG_DESK_API_BASE } from './support';
import { definitionData, type Definition } from './catalog-support';

const apiBaseURL = SIG_DESK_API_BASE;

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
    await request.get(`${apiBaseURL}/catalog/definitions/INC`),
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

async function openDesignerForINC(page: Page, kind: 'create' | 'edit' | 'detail') {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await mockAuthenticatedAdmin(page);
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
function slotContainingField(page: Page, fieldKey: string): Locator {
  return page
    .locator('[data-testid^="page-designer-slot-cell-"]')
    .filter({ has: page.getByTestId(`catalog-input-${fieldKey}`) });
}

async function removeFieldFromCanvas(page: Page, fieldKey: string) {
  const slot = slotContainingField(page, fieldKey);
  await expect(slot).toHaveCount(1);
  await slot.hover();
  await slot.getByRole('button', { name: 'Quitar' }).click();
  await expect(slotContainingField(page, fieldKey)).toHaveCount(0);
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
  await openDesignerForINC(page, 'create');

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
});

test('la página de creación publicada gobierna el formulario real', async ({ page, request }) => {
  const baseline = await getPublishedIncDefinition(request);

  await openDesignerForINC(page, 'create');
  await removeFieldFromCanvas(page, 'site');

  // Quitado de la página, el campo vuelve a estar disponible en la biblioteca
  // y un clic lo devuelve al lienzo (arrastrar es un atajo, no la única vía).
  await page.getByTestId('page-designer-palette-field-catalog-site').click();
  await expect(slotContainingField(page, 'site')).toHaveCount(1);

  const published = await saveDraftAndPublish(page, baseline.version + 1);

  expect(
    published.specification.fields.some((field) => field.key === 'site'),
    'site must still be a real field on the published definition',
  ).toBeTruthy();
  expect(published.specification.createPage, 'la definición publicada lleva su página de creación').toBeTruthy();

  await page.goto('/app/catalog/INC');
  await expect(page.getByText(`INC · v${published.version}`, { exact: true })).toBeVisible();
  await expect(page.getByTestId('catalog-form-page')).toBeVisible();
  await expect(page.getByTestId('catalog-input-site')).toBeVisible();
  // Y el formulario se dibuja por zonas, igual que el ticket.
  await expect(page.getByTestId('page-layout-region-main')).toBeVisible();
});

// Lo que el metamodelo 1.4 no podía hacer y es la razón de este cambio: el
// formulario ahora tiene barra lateral, y comparte esqueleto con el ticket.
test('un componente movido a la barra lateral del formulario aparece allí en el formulario real', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);

  await openDesignerForINC(page, 'create');

  // Los datos del solicitante son un widget del formulario, no del ticket:
  // leen la sesión de quien está creando la solicitud.
  await page.getByTestId('page-designer-palette-widget-formRequesterDetails').click();
  const requesterSlot = page
    .locator('[data-testid^="page-designer-slot-cell-"]')
    .filter({ has: page.getByTestId('form-requester-widget') });
  await expect(requesterSlot).toHaveCount(1);

  await requesterSlot.click();
  await expect(page.getByTestId('page-designer-properties')).toBeVisible();
  await page.getByTestId('page-designer-properties').getByRole('button', { name: 'Columna lateral' }).click();
  await expect(
    page.getByTestId('page-designer-region-sidebar').getByTestId('form-requester-widget'),
  ).toBeVisible();

  const published = await saveDraftAndPublish(page, baseline.version + 1);

  await page.goto('/app/catalog/INC');
  await expect(page.getByText(`INC · v${published.version}`, { exact: true })).toBeVisible();
  await expect(
    page.getByTestId('page-layout-region-sidebar').getByTestId('form-requester-widget'),
  ).toBeVisible();
});

// El invariante más caro de romper de toda esta suite: un campo que el
// administrador dejó fuera del layout de EDICIÓN no se puede editar desde ahí,
// pero conserva su valor. Las aserciones contra la API son las de siempre, sin
// cambiar una letra — lo único que cambió es el motor que dibuja el formulario.
test('editar un ticket con el layout de edición diseñado nunca borra campos fuera de él', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);

  await openDesignerForINC(page, 'edit');
  await removeFieldFromCanvas(page, 'site');
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

  // `site` no se renderiza siquiera — está fuera del layout de edición.
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

// Un ticket creado ANTES de rediseñar conserva su propia definición histórica:
// el rediseño sólo afecta a los registros nuevos.
test('un ticket anterior al rediseño conserva sus datos y su propia definición', async ({
  page,
  request,
}) => {
  const baseline = await getPublishedIncDefinition(request);
  const historicalTitle = `Historical INC before form redesign ${randomUUID()}`;
  const historical = await jsonOrFailure<Entity>(
    await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': `template-designer-e2e-${randomUUID()}` },
      data: {
        data: definitionData(baseline, {
          title: historicalTitle,
          description: 'Creado antes de rediseñar el formulario con el constructor visual.',
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

  await openDesignerForINC(page, 'create');
  await removeFieldFromCanvas(page, 'site');
  await saveDraftAndPublish(page, baseline.version + 1);

  await page.goto(`/app/tickets/${encodeURIComponent(historical.humanId)}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(page.getByText(historicalTitle, { exact: true })).toBeVisible();

  const historicalManifest = await jsonOrFailure<{ version: number }>(
    await request.get(`${apiBaseURL}/entities/INC/${historical.id}/manifest`),
    'get historical INC manifest',
  );
  expect(historicalManifest.version).toBe(baseline.version);
});

test('stakeholders is a placeable form widget backed by the real runtime component', async ({ page }) => {
  await openDesignerForINC(page, 'create');

  const paletteItem = page.getByTestId('page-designer-palette-widget-formStakeholders');
  if (await paletteItem.count()) await paletteItem.click();

  await expect(page.getByTestId('stakeholder-picker')).toBeVisible();
  await expect(page.getByTestId('stakeholder-picker').getByText('IT', { exact: true })).toBeVisible();
  await expect(page.getByTestId('stakeholder-picker').getByText('Servicios', { exact: true })).toBeVisible();
});
