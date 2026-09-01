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

async function performDrag(page: Page, source: Locator, target: Locator, atBottom = true) {
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
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function ensureAssetDetailsSlot(page: Page) {
  let slot = page.locator('[data-testid^="page-designer-slot-cell-"]').filter({ hasText: 'Detalles del activo' }).first();
  if (!(await slot.count())) {
    await page.getByTestId('page-designer-palette-widget-assetDetails').click();
    slot = page.locator('[data-testid^="page-designer-slot-cell-"]').filter({ hasText: 'Detalles del activo' }).first();
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
    page.getByTestId('page-designer-region-wrapper-footer').getByText('Soluciones sugeridas').first(),
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
    page.getByTestId('page-designer-region-wrapper-main').getByText('Detalles del activo').first(),
  ).toBeVisible();
});

test('a fixed region rejects everything the palette offers', async ({ page }) => {
  await openPageDesignerForINC(page, false);
  const header = page.getByTestId('page-designer-region-wrapper-header');
  await performDrag(page, page.getByTestId('page-designer-palette-widget-suggestedSolutions'), header, false);
  await expect(header.getByText('Soluciones sugeridas')).toHaveCount(0);
  // Still exactly the one locked widget it started with.
  await expect(header.getByTestId(/^page-designer-slot-/)).toHaveCount(1);
});

test('click-to-add, resize from the panel, Delete and Ctrl+Z', async ({ page }) => {
  await openPageDesignerForINC(page);

  await page.getByTestId('page-designer-palette-content-divider').click();
  const slot = page.getByTestId(/^page-designer-slot-cell-/).filter({ hasText: 'Separador' });
  await expect(slot).toHaveCount(1);
  await expect(page.getByTestId('page-designer-properties').getByText('Elemento estructural')).toBeVisible();

  // Width control in the properties panel drives the same resize path the
  // drag handle does.
  await page.getByTestId('page-designer-properties').getByRole('button', { name: /La mitad/ }).click();
  await expect(slot).toHaveAttribute('aria-label', /6 de 12 columnas/);

  // Delete removes the selection; Ctrl+Z brings it back.
  await page.keyboard.press('Delete');
  await expect(page.getByTestId(/^page-designer-slot-cell-/).filter({ hasText: 'Separador' })).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId(/^page-designer-slot-cell-/).filter({ hasText: 'Separador' })).toHaveCount(1);
});

test('move-to-region from the properties panel relocates the element', async ({ page }) => {
  await openPageDesignerForINC(page);
  const assetSlot = await ensureAssetDetailsSlot(page);
  await assetSlot.click();
  await page.getByTestId('page-designer-properties').getByRole('button', { name: 'Secciones inferiores' }).click();
  await expect(
    page
      .getByTestId('page-designer-region-wrapper-footer')
      .getByText('Detalles del activo').first(),
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

  // The previewed widget's own controls are inert: the RESOLVER button is
  // rendered and visible, but the slot above it takes the pointer, so a click
  // configures the element instead of operating the simulated ticket.
  const resolve = page.getByTestId('page-designer-region-wrapper-actions').getByText('RESOLVER');
  await expect(resolve).toBeVisible();
  const resolveBox = await resolve.boundingBox();
  if (!resolveBox) throw new Error('no RESOLVER box');
  await page.mouse.click(resolveBox.x + resolveBox.width / 2, resolveBox.y + resolveBox.height / 2);
  await expect(page.getByTestId('page-designer-properties').getByText('Barra de acciones').first()).toBeVisible();
  // Status untouched: the actions bar still offers RESOLVER, not REABRIR.
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
