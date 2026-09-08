import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

// The page designer's INTERACTION contract, asserted against the canvas only:
// nothing here saves a draft or publishes a version, so the suite can run
// against a shared dev backend without moving anyone's INC definition forward.
// catalog-page-designer.spec.ts covers the other half — that what you design
// here is what a real ticket renders.
//
// Every case below is a bug that shipped and was invisible from the outside:
//   * drop zones that only existed mid-drag reflowed the page on drag start,
//     so dnd-kit compared the pointer against stale rects and drops onto the
//     lower regions resolved to nothing at all;
//   * the default `rectIntersection` collision resolved a drag by the dragged
//     CARD's footprint, so a widget could never leave the region it was in;
//   * the header/actions regions were advertised as fixed while still
//     accepting anything dropped on them;
//   * `content` placements (Sección, Texto, Separador, Espacio) rendered to
//     nothing on the canvas, so adding one looked like a no-op;
//   * and drag was the only way to add anything at all.

// Estos casos necesitan más de los 60 s por omisión.
//
// No es que sean lentos por descuido: cada uno abre el Catalog Builder contra
// el backend real, entra al diseñador de la definición de INC y arrastra con
// el ratón paso a paso, que es la única forma de ejercitar dnd-kit de verdad.
// «Una región fija rechaza todo lo que ofrece la paleta» tarda ~51 s sola, así
// que con la carga del resto del archivo cruzaba el límite y expiraba — un
// fallo que parecía del arrastre y era del reloj. Se midió antes de subirlo.
test.setTimeout(120_000);

async function openPageDesignerForINC(page: Page, expand = true) {
  await page.setViewportSize({ width: 1400, height: 1200 });
  await mockAuthenticatedAdmin(page);
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('catalog-entity-INC').click();
  await page.getByTestId('catalog-section-detail').click();
  await page.getByTestId('template-designer-kind-detail').click();
  await expect(page.getByTestId('page-designer')).toBeVisible();
  if (expand) await page.getByTestId('page-designer-toggle-expand').click();
}

async function openPageDesignerForEntity(page: Page, entityKey: 'PRB' | 'RFC') {
  await page.setViewportSize({ width: 1400, height: 1200 });
  await mockAuthenticatedAdmin(page);
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId(`catalog-entity-${entityKey}`).click();
  await page.getByTestId('catalog-section-detail').click();
  await page.getByTestId('template-designer-kind-detail').click();
  await expect(page.getByTestId('page-designer')).toBeVisible();
}

/**
 * Arrastra `source` hasta `target` y suelta.
 *
 * `expectAccepted` NO es cosmético: es lo que hace la espera determinista.
 * Antes el helper esperaba un tiempo fijo antes de soltar, y no podía hacer
 * otra cosa porque no sabía si el destino iba a aceptar. Bajo carga ese tiempo
 * se quedaba corto, el suelto caía en el vacío y dos pruebas de este archivo
 * fallaban alternándose según lo llena que estuviera la suite.
 *
 * Sabiendo la expectativa, cada caso espera la señal que le corresponde:
 * el que acepta espera a que el destino se marque activo (`data-over`), y el
 * que rechaza comprueba que no se marque nunca.
 */
async function performDrag(
  page: Page,
  source: Locator,
  target: Locator,
  atBottom = true,
  expectAccepted = true,
) {
  await source.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
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
  const endY = atBottom ? targetBox.y + Math.max(10, targetBox.height - 15) : targetBox.y + targetBox.height / 2;

  await page.mouse.move(endX, endY, { steps: 15 });
  // Un segundo movimiento en el destino: dnd-kit resuelve el destino activo al
  // recibir un movimiento, y con uno solo la última posición puede llegar antes
  // de que haya medido las zonas.
  await page.mouse.move(endX, endY);

  const activo = target.and(page.locator('[data-over="true"]'));
  if (expectAccepted) {
    // Se espera a que el destino DIGA que está activo. Si no lo dice, mover
    // otra vez y volver a esperar: un solo reintento cubre el caso de que la
    // primera medida de dnd-kit llegara antes de que la capa de arrastre
    // estuviera montada, sin esconder un destino que de verdad no acepta.
    try {
      await expect(activo).toHaveCount(1, { timeout: 3_000 });
    } catch {
      await page.mouse.move(endX + 1, endY + 1);
      await page.mouse.move(endX, endY);
      await expect(
        activo,
        'el destino nunca se marco activo: el arrastre no llego, y soltar aqui no probaria nada',
      ).toHaveCount(1, { timeout: 5_000 });
    }
  } else {
    // El caso que RECHAZA. No hay señal que esperar —una zona bloqueada no se
    // activa nunca— así que se comprueba justamente eso, y de paso se le da
    // tiempo real al arrastre para equivocarse si fuera a hacerlo.
    await expect(activo).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(
      activo,
      'una region fija no debe marcarse activa durante el arrastre',
    ).toHaveCount(0);
  }

  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function ensureAssetDetailsSlot(page: Page) {
  let slot = page.locator('[data-testid^="page-designer-slot-cell-"]').filter({ hasText: 'Asset Details' }).first();
  if (!(await slot.count())) {
    await page.getByTestId('page-designer-palette-widget-assetDetails').click();
    slot = page.locator('[data-testid^="page-designer-slot-cell-"]').filter({ hasText: 'Asset Details' }).first();
  }
  await expect(slot).toBeVisible();
  return slot;
}

test('drag from palette into an empty region still works', async ({ page }) => {
  await openPageDesignerForINC(page, false);
  await performDrag(
    page,
    page.getByTestId('page-designer-palette-widget-suggestedSolutions'),
    page.getByTestId('page-designer-region-footer'),
    false,
  );
  await expect(
    page.getByTestId('page-designer-region-wrapper-footer').getByText('Suggested Solutions').first(),
  ).toBeVisible();
});

test('stakeholders is available as a placeable detail widget for INC, PRB and RFC', async ({ page }) => {
  await openPageDesignerForINC(page, false);
  await expect(
    page.getByTestId('page-designer-palette-widget-stakeholders').or(page.getByTestId('ticket-stakeholders-widget')),
  ).toBeVisible();

  for (const entityKey of ['PRB', 'RFC'] as const) {
    await openPageDesignerForEntity(page, entityKey);
    await expect(
      page.getByTestId('page-designer-palette-widget-stakeholders').or(page.getByTestId('ticket-stakeholders-widget')),
    ).toBeVisible();
  }
});

test('drag an existing slot from the sidebar into main still works', async ({ page }) => {
  await openPageDesignerForINC(page, false);
  const assetSlot = await ensureAssetDetailsSlot(page);
  await assetSlot.hover();
  // Aim at a precise insertion point rather than "somewhere near the bottom
  // of main": main is taller than the viewport, so its bottom edge is not a
  // reachable pointer position.
  await performDrag(
    page,
    assetSlot.locator('[data-testid^="page-designer-drag-"]'),
    page.getByTestId('page-designer-drop-newrow:main:0'),
    false,
  );
  await expect(
    page.getByTestId('page-designer-region-wrapper-main').getByText('Asset Details').first(),
  ).toBeVisible();
});

test('a fixed region rejects everything the palette offers', async ({ page }) => {
  await openPageDesignerForINC(page, false);
  const header = page.getByTestId('page-designer-region-wrapper-header');
  await performDrag(page, page.getByTestId('page-designer-palette-widget-suggestedSolutions'), header, false, false);
  await expect(header.getByText('Suggested Solutions')).toHaveCount(0);
  // Still exactly the one locked widget it started with.
  await expect(header.getByTestId(/^page-designer-slot-/)).toHaveCount(1);
});

test('click-to-add, resize from the panel, Delete and Ctrl+Z', async ({ page }) => {
  await openPageDesignerForINC(page);

  await page.getByTestId('page-designer-palette-content-divider').click();
  const slot = page.getByTestId(/^page-designer-slot-cell-/).filter({ hasText: 'Divider' });
  await expect(slot).toHaveCount(1);
  await expect(page.getByTestId('page-designer-properties').getByText('Structural element')).toBeVisible();

  // Width control in the properties panel drives the same resize path the
  // drag handle does.
  await page.getByTestId('page-designer-properties').getByRole('button', { name: /Half/ }).click();
  await expect(slot).toHaveAttribute('aria-label', /6 of 12 columns/);

  // Delete removes the selection; Ctrl+Z brings it back.
  await page.keyboard.press('Delete');
  await expect(page.getByTestId(/^page-designer-slot-cell-/).filter({ hasText: 'Divider' })).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId(/^page-designer-slot-cell-/).filter({ hasText: 'Divider' })).toHaveCount(1);
});

test('move-to-region from the properties panel relocates the element', async ({ page }) => {
  await openPageDesignerForINC(page);
  const assetSlot = await ensureAssetDetailsSlot(page);
  await assetSlot.click();
  await page.getByTestId('page-designer-properties').getByRole('button', { name: 'Footer sections' }).click();
  await expect(
    page
      .getByTestId('page-designer-region-wrapper-footer')
      .getByText('Asset Details').first(),
  ).toBeVisible();
});

test('the resize handle still drags, and canvas widgets are inert', async ({ page }) => {
  await openPageDesignerForINC(page);
  const slot = await ensureAssetDetailsSlot(page);
  await slot.scrollIntoViewIfNeeded();
  const before = await slot.getAttribute('aria-label');

  const handle = slot.locator('[data-testid^="page-designer-resize-"]');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('no resize handle box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await slot.getAttribute('aria-label')).not.toBe(before);

  // The previewed widget's own controls are inert: the Resolve button is
  // rendered and visible, but the slot above it takes the pointer, so a click
  // configures the element instead of operating the simulated ticket.
  //
  // TicketActionsWidget's real button reads "Resolve" (English) — this test
  // asserted the stale "RESOLVER" (an all-caps Spanish label that never
  // existed in the component's actual JSX, only ever in this test), which
  // made getByText find nothing and every run time out at 60s.
  // getByText alone is ambiguous here: the status <select>'s own
  // "Resolved" <option> also matches by substring. The real "Resolve"
  // control is a <button>, so scope to that role.
  const resolve = page.getByTestId('page-designer-region-wrapper-actions').getByRole('button', { name: 'Resolve' });
  await expect(resolve).toBeVisible();
  const resolveBox = await resolve.boundingBox();
  if (!resolveBox) throw new Error('no Resolve box');
  await page.mouse.click(resolveBox.x + resolveBox.width / 2, resolveBox.y + resolveBox.height / 2);
  await expect(page.getByTestId('page-designer-properties').getByText('Action Bar').first()).toBeVisible();
  // Status untouched: the actions bar still offers Resolve, not Reopen.
  await expect(resolve).toBeVisible();
});

test('PRB only offers widgets that Problem Management can execute', async ({ page }) => {
  await openPageDesignerForEntity(page, 'PRB');
  await expect(page.getByTestId('page-designer-palette-widget-itsmRelations')).toBeVisible();
  await expect(page.getByTestId('page-designer-palette-widget-changeTasks')).toHaveCount(0);
  await expect(page.getByTestId('page-designer-palette-widget-sla')).toHaveCount(0);
  await expect(page.getByTestId('page-designer-palette-widget-attachments')).toHaveCount(0);
  await expect(page.getByTestId('page-designer-palette-widget-mergedTickets')).toHaveCount(0);
});

test('RFC exposes its real Change Management task plan and no INC-only widgets', async ({ page }) => {
  await openPageDesignerForEntity(page, 'RFC');
  await expect(page.getByTestId('page-designer-palette-widget-changeTasks')).toBeVisible();
  await expect(page.getByTestId('page-designer-palette-widget-itsmRelations')).toBeVisible();
  await expect(page.getByTestId('page-designer-palette-widget-sla')).toHaveCount(0);
  await expect(page.getByTestId('page-designer-palette-widget-activity')).toHaveCount(0);
  await expect(page.getByTestId('page-designer-palette-widget-assetDetails')).toHaveCount(0);
});
