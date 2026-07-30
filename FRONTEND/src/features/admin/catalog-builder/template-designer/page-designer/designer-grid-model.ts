import type { LayoutRegion, PagePlacement } from '@/features/catalog/metamodel';

// The row/slot editing model. This is a *view model* the designer edits —
// it never leaves the frontend and is never persisted. Every change is
// compiled deterministically into `row`/`column`/`columnSpan` (the metamodel
// 1.5 coordinates PageLayoutRenderer actually reads) via `fromDesignerRegion`.
// Rows only ever hold one visual row of cells (no rowSpan in this editor —
// a placement that had rowSpan > 1 from advanced/legacy editing is treated as
// a normal single-row cell here; that's an accepted simplification of the
// new interaction model, not a data loss — the stored value is preserved
// untouched until the designer actually touches that placement again).
export const ALLOWED_SPANS = [3, 4, 6, 8, 9, 12] as const;
export type DesignerSpan = (typeof ALLOWED_SPANS)[number];

export interface DesignerCell {
  id: string;
  span: DesignerSpan;
  placement: PagePlacement;
}

export interface DesignerRow {
  id: string;
  cells: DesignerCell[];
}

export interface DesignerRegionLayout {
  rows: DesignerRow[];
}

// The `cell-` prefix convention used everywhere a DesignerCell is created
// from a placement (toDesignerRegion, paletteItemToPlacement's caller) —
// centralized here so callers that only have a placement id (e.g. the
// properties panel, which identifies placements the same way the rest of
// Catalog Builder does) can address a cell without re-deriving the format.
export function cellIdForPlacement(placementId: string): string {
  return `cell-${placementId}`;
}

export function snapSpan(span: number): DesignerSpan {
  let closest: DesignerSpan = ALLOWED_SPANS[0];
  let closestDistance = Infinity;
  for (const candidate of ALLOWED_SPANS) {
    const distance = Math.abs(candidate - span);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function rowTotal(row: DesignerRow): number {
  return row.cells.reduce((sum, cell) => sum + cell.span, 0);
}

// Reads a LayoutRegion's placements into the row/cell editing model, grouping
// by `row` and ordering by `column`. Pure — safe to call once per external
// reset (mount, undo/redo, audience switch); never called mid-drag.
export function toDesignerRegion(region: LayoutRegion): DesignerRegionLayout {
  const byRow = new Map<number, PagePlacement[]>();
  for (const placement of region.placements) {
    const list = byRow.get(placement.row) ?? [];
    list.push(placement);
    byRow.set(placement.row, list);
  }
  const rowKeys = [...byRow.keys()].sort((a, b) => a - b);
  const rows: DesignerRow[] = rowKeys.map((rowKey) => {
    const placements = [...(byRow.get(rowKey) ?? [])].sort((a, b) => a.column - b.column);
    const cells: DesignerCell[] = placements.map((placement) => ({
      id: cellIdForPlacement(placement.id),
      span: snapSpan(placement.columnSpan),
      placement,
    }));
    return { id: `row-${rowKey}`, cells };
  });
  return { rows };
}

// Compiles the row/cell editing model back to placements with deterministic
// row/column coordinates: row index = position in `rows`, column = running
// sum of the spans of the cells before it in that row.
export function fromDesignerRegion(designerRegion: DesignerRegionLayout): PagePlacement[] {
  const result: PagePlacement[] = [];
  designerRegion.rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const cell of row.cells) {
      result.push({ ...cell.placement, row: rowIndex, column, columnSpan: cell.span });
      column += cell.span;
    }
  });
  return result;
}

export function findCell(
  layout: DesignerRegionLayout,
  cellId: string,
): { rowIndex: number; cellIndex: number } | null {
  for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex += 1) {
    const cellIndex = layout.rows[rowIndex].cells.findIndex((cell) => cell.id === cellId);
    if (cellIndex !== -1) return { rowIndex, cellIndex };
  }
  return null;
}

// Removes a cell. A row left with no cells is dropped entirely.
export function removeCell(layout: DesignerRegionLayout, cellId: string): DesignerRegionLayout {
  const rows = layout.rows
    .map((row) => ({ ...row, cells: row.cells.filter((cell) => cell.id !== cellId) }))
    .filter((row) => row.cells.length > 0);
  return { rows };
}

// Inserts a cell into a row at `cellIndex`. If the row would exceed 12
// columns, the row's existing cells are shrunk from the end (never below the
// smallest allowed span) to make room; if they still don't fit, the new cell
// starts a row of its own right after — this is the structural guarantee
// that no two cells ever overlap: a row's cells always sum to <= 12.
function fitRow(cells: DesignerCell[]): { fitted: DesignerCell[]; overflow: DesignerCell[] } {
  const fitted: DesignerCell[] = [];
  let total = 0;
  const overflow: DesignerCell[] = [];
  for (const cell of cells) {
    if (total + cell.span <= 12) {
      fitted.push(cell);
      total += cell.span;
      continue;
    }
    const remaining = 12 - total;
    const shrunkSpan = ALLOWED_SPANS.filter((span) => span <= remaining).sort((a, b) => b - a)[0];
    if (shrunkSpan) {
      fitted.push({ ...cell, span: shrunkSpan });
      total += shrunkSpan;
    } else {
      overflow.push(cell);
    }
  }
  return { fitted, overflow };
}

export function insertCellInRow(
  layout: DesignerRegionLayout,
  rowIndex: number,
  cellIndex: number,
  cell: DesignerCell,
): DesignerRegionLayout {
  const rows = [...layout.rows];
  const targetRow = rows[rowIndex] ?? { id: `row-${crypto.randomUUID()}`, cells: [] };
  const cells = [...targetRow.cells];
  cells.splice(Math.min(Math.max(cellIndex, 0), cells.length), 0, cell);
  const { fitted, overflow } = fitRow(cells);
  rows[rowIndex] = { ...targetRow, cells: fitted };
  if (overflow.length > 0) {
    rows.splice(rowIndex + 1, 0, { id: `row-${crypto.randomUUID()}`, cells: overflow });
  }
  return { rows };
}

export function insertNewRow(layout: DesignerRegionLayout, rowIndex: number, cell: DesignerCell): DesignerRegionLayout {
  const rows = [...layout.rows];
  rows.splice(Math.min(Math.max(rowIndex, 0), rows.length), 0, { id: `row-${crypto.randomUUID()}`, cells: [cell] });
  return { rows };
}

export function moveRow(layout: DesignerRegionLayout, fromIndex: number, toIndex: number): DesignerRegionLayout {
  const rows = [...layout.rows];
  const [moved] = rows.splice(fromIndex, 1);
  if (!moved) return layout;
  rows.splice(toIndex, 0, moved);
  return { rows };
}

// Resizes a cell, auto-shrinking (or growing back into) the space taken by
// its immediate right-hand sibling in the same row so the row never exceeds
// 12 columns — the "los demás elementos se reacomodan sin superponerse"
// requirement.
export function resizeCell(layout: DesignerRegionLayout, cellId: string, nextSpan: DesignerSpan): DesignerRegionLayout {
  const location = findCell(layout, cellId);
  if (!location) return layout;
  const rows = [...layout.rows];
  const row = rows[location.rowIndex];
  const cells = [...row.cells];
  const current = cells[location.cellIndex];
  const delta = nextSpan - current.span;
  if (delta === 0) return layout;

  const otherTotal = cells.reduce((sum, cell, index) => (index === location.cellIndex ? sum : sum + cell.span), 0);
  const boundedSpan = ALLOWED_SPANS.filter((span) => span <= 12 - otherTotal + current.span)
    .sort((a, b) => b - a)
    .find((span) => (delta > 0 ? span <= nextSpan : true)) ?? current.span;
  const finalSpan = delta > 0 ? Math.min(nextSpan, boundedSpan) : nextSpan;

  cells[location.cellIndex] = { ...current, span: finalSpan as DesignerSpan };

  // Shrink siblings after this cell, in order, until the row fits again.
  let overflowAmount = cells.reduce((sum, cell) => sum + cell.span, 0) - 12;
  for (let index = location.cellIndex + 1; index < cells.length && overflowAmount > 0; index += 1) {
    const sibling = cells[index];
    const shrinkable = ALLOWED_SPANS.filter((span) => span < sibling.span).sort((a, b) => b - a);
    for (const candidate of shrinkable) {
      if (overflowAmount <= 0) break;
      overflowAmount -= sibling.span - candidate;
      cells[index] = { ...sibling, span: candidate };
    }
  }

  rows[location.rowIndex] = { ...row, cells };
  return { rows };
}
