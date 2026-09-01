import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

// Integridad de lo que el Catalog Builder GUARDARÍA.
//
// El oráculo es el textarea de «Configuración avanzada», que se rellena desde
// `selected.specification` cada vez que se abre esa sección: permite afirmar
// sobre el documento exacto que se enviaría, sin publicar ni guardar nada
// contra el backend compartido. La única prueba que llega a pulsar Guardar
// intercepta el POST y lo responde ella misma.
//
// Cada caso cubre un fallo que ya estaba en producción y era invisible desde
// fuera:
//   * guardar reventaba contra `/catalog/layouts/*`, una familia de rutas que
//     no existe, DESPUÉS de haber persistido el borrador;
//   * las reglas `in`/`notIn` de los diseñadores se escribían en `value`
//     mientras el runtime lee `values`, así que no se cumplían nunca;
//   * editar una variante de audiencia reescribía el layout por defecto;
//   * borrar un campo dejaba su placement huérfano en los layouts.

async function openBuilder(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mockAuthenticatedAdmin(page);
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
}

async function openDetailDesigner(page: Page) {
  await page.getByTestId('catalog-section-detail').click();
  await page.getByTestId('template-designer-kind-detail').click();
  await expect(page.getByTestId('page-designer')).toBeVisible();
}

// Desde el metamodelo 1.6 las tres vistas usan el mismo disenador de paginas,
// asi que abrir Crear o Editar es exactamente el mismo gesto que Detalle.
async function openPageDesignerForKind(page: Page, kind: 'create' | 'edit' | 'detail') {
  await page.getByTestId('catalog-section-detail').click();
  await page.getByTestId(`template-designer-kind-${kind}`).click();
  await expect(page.getByTestId('page-designer')).toBeVisible();
}

// Forma mínima de la especificación, declarada acá y no importada de `src/`:
// lo que este spec afirma es el JSON que se guardaría, y declararlo aquí lo
// deja legible como contrato — si cambia la forma real, el fallo se lee.
//
// (El motivo original era otro: el proyecto de TypeScript de e2e no resolvía
// el alias `@/*`. Ya lo resuelve, así que importar de `src/` es posible; ver
// catalog-field-operations.spec.ts, que lo hace para verificar lógica pura.)
interface SpecPlacement {
  fieldKey?: string;
  contentKind?: string;
  visibleWhen?: { value?: unknown; values?: unknown[] };
}
interface SpecSection {
  placements: SpecPlacement[];
}
interface SpecRegion {
  placements: SpecPlacement[];
}
interface SpecPage {
  main: SpecRegion;
}
interface CatalogSpecification {
  fields: Array<{ key: string }>;
  layouts?: {
    create?: {
      default: { sections: SpecSection[] };
      variants?: Array<{ audienceKey: string; document: { sections: SpecSection[] } }>;
    };
  };
  detailPage?: SpecPageDefinition;
  createPage?: SpecPageDefinition;
  editPage?: SpecPageDefinition;
}

interface SpecPageDefinition {
  default: SpecPage;
  variants?: Array<{ audienceKey: string; page: SpecPage }>;
}

/** La especificación tal y como se guardaría en este instante. */
async function readSpecification(page: Page): Promise<CatalogSpecification> {
  await page.getByTestId('catalog-section-advanced').click();
  const raw = await page.getByTestId('catalog-advanced-json').inputValue();
  return JSON.parse(raw) as CatalogSpecification;
}

test('guardar un borrador ya no falla contra rutas de layout inexistentes', async ({ page }) => {
  await openBuilder(page);

  const layoutCalls: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/catalog/layouts')) layoutCalls.push(`${request.method()} ${pathname}`);
  });

  // El POST se responde aquí: la definición del entorno no se toca.
  await page.route(
    (url) => url.pathname === '/catalog/definitions',
    async (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      const sent = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inc-draft-e2e',
          entityKey: 'INC',
          name: sent.name ?? 'Incidente',
          version: 999,
          status: 'draft',
          specification: sent.specification,
        }),
      });
    },
  );

  // Abrir el diseñador de Detalle materializa `detailPage`, que es justo la
  // condición que disparaba el espejo roto.
  await openDetailDesigner(page);
  await page.getByTestId('catalog-save-draft').click();

  await expect(page.getByTestId('catalog-notice')).toBeVisible();
  await expect(page.getByTestId('catalog-editor-error')).toHaveCount(0);
  expect(layoutCalls, 'el guardado no debe tocar /catalog/layouts/*').toEqual([]);
});

test('una condición in/notIn del diseñador se guarda en values, no en value', async ({ page }) => {
  await openBuilder(page);
  await openDetailDesigner(page);

  await page.getByTestId('page-designer-palette-content-divider').click();
  const properties = page.getByTestId('page-designer-properties');
  await expect(properties.getByText('Elemento estructural')).toBeVisible();

  await properties.getByRole('switch').first().click();
  await properties.getByLabel('Operador').selectOption('in');
  await properties.getByLabel('Valores separados por coma').fill('alfa, beta');

  const specification = await readSpecification(page);
  const placements = specification.detailPage!.default.main.placements;
  const divider = placements.find((placement) => placement.contentKind === 'divider');
  expect(divider, 'el separador debe estar en el contenido principal').toBeTruthy();
  expect(divider!.visibleWhen?.values).toEqual(['alfa', 'beta']);
  expect(divider!.visibleWhen?.value).toBeUndefined();
});

test('editar una variante de audiencia no toca el layout por defecto', async ({ page }) => {
  await openBuilder(page);
  await openDetailDesigner(page);

  await page.getByTestId('page-designer-add-audience').selectOption('agent');
  await page.getByTestId('page-designer-palette-content-divider').click();

  const specification = await readSpecification(page);
  const variant = specification.detailPage!.variants?.find((item) => item.audienceKey === 'agent');
  expect(variant, 'la variante Técnico debe existir').toBeTruthy();

  const inVariant = variant!.page.main.placements.some((placement) => placement.contentKind === 'divider');
  const inDefault = specification.detailPage!.default.main.placements.some(
    (placement) => placement.contentKind === 'divider',
  );
  expect(inVariant, 'el separador debe quedar en la variante').toBe(true);
  expect(inDefault, 'el layout por defecto debe quedar intacto').toBe(false);
});

test('borrar un campo arrastra sus placements en todos los layouts', async ({ page }) => {
  await openBuilder(page);
  // La definición publicada de INC todavía no trae `layouts` ni `detailPage`:
  // los materializan los diseñadores al montarse. Hay que pasar por ahí antes
  // de agregar el campo, o `addField` no tiene dónde poner su placement.
  await openDetailDesigner(page);
  await page.getByTestId('catalog-section-fields').click();
  await page.getByTestId('catalog-add-field').click();

  const added = await readSpecification(page);
  const newField = added.fields[added.fields.length - 1];
  expect(
    added.layouts?.create?.default.sections.some((section) =>
      section.placements.some((placement) => placement.fieldKey === newField.key),
    ),
    'al agregarlo debe recibir un placement en layouts.create',
  ).toBe(true);

  await page.getByTestId('catalog-section-fields').click();
  await page
    .getByTestId(`catalog-field-editor-${newField.key}`)
    .getByRole('button', { name: 'Eliminar campo' })
    .click();

  const after = await readSpecification(page);
  expect(after.fields.some((field) => field.key === newField.key)).toBe(false);
  expect(
    JSON.stringify(after.layouts ?? {}),
    'ningún layout debe seguir apuntando al campo borrado',
  ).not.toContain(newField.key);
  expect(JSON.stringify(after.detailPage ?? {})).not.toContain(newField.key);
  // Desde 1.6 hay tres paginas, no una: un campo borrado tiene que
  // desaparecer de las tres o reaparece como una tarjeta anonima en el
  // formulario.
  expect(JSON.stringify(after.createPage ?? {})).not.toContain(newField.key);
  expect(JSON.stringify(after.editPage ?? {})).not.toContain(newField.key);
});

// El fallo original vivia en el disenador de FORMULARIOS 1.4: creaba la
// variante con `key: randomUUID()` y la seleccionaba por audiencia, mientras
// document-ops comparaba contra `variant.key`. Nunca coincidia, asi que leer
// caia al default y escribir aterrizaba en el default.
//
// Desde 1.6 el formulario de creacion es una pagina y lo disena el mismo
// componente que ya resolvia por audienceKey — este caso fija que la
// resolucion sigue siendo correcta en la superficie nueva.
test('editar una variante del formulario de creación no toca el default', async ({ page }) => {
  await openBuilder(page);
  await openPageDesignerForKind(page, 'create');

  const before = await readSpecification(page);
  const defaultPlacementsBefore = before.createPage?.default.main.placements.length ?? 0;

  await openPageDesignerForKind(page, 'create');
  await page.getByTestId('page-designer-add-audience').selectOption('agent');
  // La variante hereda la pagina visible en el momento de crearla. Agregar
  // un elemento nuevo debe aterrizar en ELLA, no en la pagina por defecto.
  // Usamos un elemento estructural estable en vez de depender de que la
  // definicion INC del entorno tenga un campo concreto como `site`.
  await page.getByTestId('page-designer-palette-content-divider').click();

  const after = await readSpecification(page);
  const variant = after.createPage?.variants?.find((item) => item.audienceKey === 'agent');
  expect(variant, 'la variante Técnico debe existir').toBeTruthy();
  expect(
    variant!.page.main.placements.some((placement) => placement.contentKind === 'divider'),
    'el elemento nuevo va en la variante',
  ).toBeTruthy();
  expect(
    after.createPage?.default.main.placements.length,
    'la página por defecto no debe cambiar',
  ).toBe(defaultPlacementsBefore);
});

test('una variante del formulario de creación se puede eliminar', async ({ page }) => {
  await openBuilder(page);
  await openPageDesignerForKind(page, 'create');
  await page.getByTestId('page-designer-add-audience').selectOption('agent');
  await expect(page.getByTestId('page-designer-remove-audience')).toBeVisible();

  await page.getByTestId('page-designer-remove-audience').click();
  const after = await readSpecification(page);
  expect(after.createPage?.variants ?? []).toEqual([]);
});

// El espejo 1.4 no es decorativo: tickets_service valida la regla de `bindsTo`
// contra `layouts.create`, asi que tiene que describir la pagina real. Se
// regenera en cada commit del disenador, nunca se congela.
test('la página de creación mantiene su espejo en layouts.create', async ({ page }) => {
  await openBuilder(page);
  await openPageDesignerForKind(page, 'create');

  const spec = await readSpecification(page);
  const enLaPagina = (spec.createPage?.default.main.placements ?? [])
    .map((placement) => placement.fieldKey)
    .filter(Boolean)
    .sort();
  const enElEspejo = (spec.layouts?.create?.default.sections ?? [])
    .flatMap((section) => section.placements.map((placement) => placement.fieldKey))
    .filter(Boolean)
    .sort();

  expect(enLaPagina.length, 'la página de creación debe tener campos').toBeGreaterThan(0);
  expect(enElEspejo).toEqual(enLaPagina);
});

// Guardar dejó de abrir una versión por pulsación: sobre una entidad ya
// publicada crea el borrador (POST), y a partir de ahí lo edita in place
// (PATCH). Se comprueba interceptando, sin escribir en el catálogo real.
test('guardar crea el borrador una vez y despues lo edita en su sitio', async ({ page }) => {
  await openBuilder(page);

  const llamadas: string[] = [];
  let updatedAt = '2026-01-01T00:00:00.000000Z';

  await page.route(
    (url) => url.pathname.startsWith('/catalog/definitions'),
    async (route, request) => {
      const { pathname } = new URL(request.url());
      const metodo = request.method();
      if (metodo === 'GET') return route.fallback();

      llamadas.push(`${metodo} ${pathname}`);
      const enviado = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      // Cada escritura devuelve un testigo nuevo, como hace el backend real.
      updatedAt = `2026-01-01T00:00:0${llamadas.length}.000000Z`;
      await route.fulfill({
        status: metodo === 'POST' ? 201 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inc-draft',
          entityKey: 'INC',
          name: (enviado.name as string) ?? 'Incidente',
          version: 99,
          status: 'draft',
          specification: enviado.specification ?? {},
          updatedAt,
        }),
      });
    },
  );

  await openDetailDesigner(page);
  await page.getByTestId('catalog-save-draft').click();
  await expect(page.getByTestId('catalog-notice')).toBeVisible();

  // Guardar salta a «Validar y publicar», así que hay que volver al
  // diseñador para producir un cambio nuevo (el botón se deshabilita sin
  // cambios pendientes).
  await openDetailDesigner(page);
  await page.getByTestId('page-designer-palette-content-divider').click();
  await page.getByTestId('catalog-save-draft').click();
  await expect(page.getByTestId('catalog-notice')).toBeVisible();

  expect(llamadas).toEqual([
    'POST /catalog/definitions',
    'PATCH /catalog/definitions/INC/draft',
  ]);
  await expect(page.getByTestId('catalog-editor-error')).toHaveCount(0);
});
