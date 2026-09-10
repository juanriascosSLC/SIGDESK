import type { CatalogSpecification, PageLayout, PagePlacement, RegionName } from '@/features/catalog/metamodel';
import { REGION_ORDER } from './region-meta';
import { contentKindLabel, itemAllowedRegions, type PageLibraryItem } from './page-library';
import type { SurfaceRules } from './surface';
import {
  cellIdForPlacement,
  findCell,
  fromDesignerRegion,
  insertCellInRow,
  insertNewRow,
  moveRow,
  removeCell,
  resizeCell,
  snapSpan,
  toDesignerRegion,
  type DesignerCell,
  type DesignerRegionLayout,
  type DesignerSpan,
} from './designer-grid-model';

export const REGION_NAMES: RegionName[] = REGION_ORDER;

export type RegionsState = Record<RegionName, DesignerRegionLayout>;

// Reads every region of a PageLayout into the row/cell editing model — the
// canvas's only source of truth is `activePage`; this is recomputed whenever
// it changes (commit, undo/redo, audience switch), never mutated in place.
export function buildRegionsFromPage(page: PageLayout): RegionsState {
  return {
    header: toDesignerRegion(page.header),
    actions: toDesignerRegion(page.actions),
    main: toDesignerRegion(page.main),
    sidebar: toDesignerRegion(page.sidebar),
    footer: toDesignerRegion(page.footer),
  };
}

// Compiles every region's row/cell state back into real row/column/columnSpan
// coordinates on the PageLayout — the deterministic compile step that keeps
// metamodel 1.5 untouched while the designer edits a friendlier view model.
export function compileRegionsToPage(page: PageLayout, regions: RegionsState): PageLayout {
  return {
    ...page,
    header: { ...page.header, placements: fromDesignerRegion(regions.header) },
    actions: { ...page.actions, placements: fromDesignerRegion(regions.actions) },
    main: { ...page.main, placements: fromDesignerRegion(regions.main) },
    sidebar: { ...page.sidebar, placements: fromDesignerRegion(regions.sidebar) },
    footer: { ...page.footer, placements: fromDesignerRegion(regions.footer) },
  };
}

// Resizes a cell wherever it lives across the 5 regions — used both for the
// live (uncommitted) preview during a resize drag and for the final commit.
export function applyResizeInRegions(regions: RegionsState, cellId: string, span: DesignerSpan): RegionsState {
  const location = findCellLocation(regions, cellId);
  if (!location) return regions;
  return { ...regions, [location.region]: resizeCell(regions[location.region], cellId, span) };
}

const PALETTE_PREFIX = 'palette';

export function buildPaletteDragId(uniqueKey: string): string {
  return `${PALETTE_PREFIX}:${uniqueKey}`;
}

export type DropTarget =
  | { kind: 'slot'; region: RegionName; rowIndex: number; gapIndex: number }
  | { kind: 'newRow'; region: RegionName; rowIndex: number }
  | { kind: 'empty'; region: RegionName };

const SLOT_PREFIX = 'slot';
const NEW_ROW_PREFIX = 'newrow';
const EMPTY_PREFIX = 'empty';

export function buildSlotId(region: RegionName, rowIndex: number, gapIndex: number): string {
  return `${SLOT_PREFIX}:${region}:${rowIndex}:${gapIndex}`;
}
export function buildNewRowId(region: RegionName, rowIndex: number): string {
  return `${NEW_ROW_PREFIX}:${region}:${rowIndex}`;
}
export function buildEmptyRegionId(region: RegionName): string {
  return `${EMPTY_PREFIX}:${region}`;
}

export function parseDropTargetId(id: string): DropTarget | null {
  const parts = id.split(':');
  if (parts[0] === SLOT_PREFIX) {
    return { kind: 'slot', region: parts[1] as RegionName, rowIndex: Number(parts[2]), gapIndex: Number(parts[3]) };
  }
  if (parts[0] === NEW_ROW_PREFIX) {
    return { kind: 'newRow', region: parts[1] as RegionName, rowIndex: Number(parts[2]) };
  }
  if (parts[0] === EMPTY_PREFIX) {
    return { kind: 'empty', region: parts[1] as RegionName };
  }
  return null;
}

export function findCellLocation(
  regions: RegionsState,
  cellId: string,
): { region: RegionName; rowIndex: number; cellIndex: number } | null {
  for (const region of REGION_NAMES) {
    const location = findCell(regions[region], cellId);
    if (location) return { region, ...location };
  }
  return null;
}

export function findPlacementLocation(regions: RegionsState, placementId: string) {
  return findCellLocation(regions, cellIdForPlacement(placementId));
}

export function getCell(regions: RegionsState, cellId: string): DesignerCell | null {
  const location = findCellLocation(regions, cellId);
  if (!location) return null;
  return regions[location.region].rows[location.rowIndex].cells[location.cellIndex];
}

// The single admission rule for "may this thing live in this region?", used by
// every drop path AND by the palette's region chips, the "mover a" control and
// the drag-over highlighting — so what the UI offers and what it accepts can
// never disagree.
//
// A fixed region (header/actions) accepts ONLY the locked structural widget
// whose registry entry names it. Before this, the canvas dimmed non-widget
// drags into those regions but still ACCEPTED them: a field dropped on the
// header landed in a second row and rendered as a stray card on every real
// ticket page, while the copy claimed the region admitted nothing.
//
// A widget absent from THIS surface's registry is rejected outright, anywhere.
// That is what keeps the surfaces apart: `sla` is simply not in the create
// form's catalog, so it cannot be dropped there — and the backend, which does
// not know the form widgets at all, never sees a page it would refuse to
// publish. Rejecting instead of waving unknown widgets through is deliberate:
// the permissive branch existed for content/field placements, and letting a
// widget take it is exactly how one surface's widget leaks into another.
export function placementAllowedInRegion(
  rules: SurfaceRules,
  placement: PagePlacement,
  region: RegionName,
): boolean {
  if (placement.kind === 'widget') {
    const widget = placement.widgetKey ? rules.widgets[placement.widgetKey] : undefined;
    if (!widget) return false;
    return widget.allowedRegions.includes(region);
  }
  return !rules.regionMeta[region].fixed;
}

export function itemAllowedInRegion(
  rules: SurfaceRules,
  item: PageLibraryItem,
  region: RegionName,
): boolean {
  if (rules.regionMeta[region].fixed) return false;
  return itemAllowedRegions(rules, item).includes(region);
}

// Returns `null` (never a mutated-but-rejected state) when the drop isn't
// allowed, so callers can tell "rejected" apart from "applied" and fall back
// to their own pre-drop state instead of accidentally dropping the cell.
function applyDrop(
  rules: SurfaceRules,
  regions: RegionsState,
  target: DropTarget,
  cell: DesignerCell,
): RegionsState | null {
  if (!placementAllowedInRegion(rules, cell.placement, target.region)) return null;
  if (target.kind === 'empty') {
    return {
      ...regions,
      [target.region]: insertNewRow(regions[target.region], regions[target.region].rows.length, cell),
    };
  }
  if (target.kind === 'newRow') {
    return { ...regions, [target.region]: insertNewRow(regions[target.region], target.rowIndex, cell) };
  }
  return { ...regions, [target.region]: insertCellInRow(regions[target.region], target.rowIndex, target.gapIndex, cell) };
}

// Moves a cell already present somewhere in the page to a new drop target —
// used for both within-row reordering and cross-region moves (e.g. Asset
// Details from sidebar to main). Rejects moving a locked widget out of its
// current region, and rejects a widget landing in a region its registry
// entry doesn't allow.
export function moveExistingCell(
  rules: SurfaceRules,
  regions: RegionsState,
  cellId: string,
  target: DropTarget,
): RegionsState {
  const origin = findCellLocation(regions, cellId);
  if (!origin) return regions;
  const originLayout = regions[origin.region];
  const cell = originLayout.rows[origin.rowIndex].cells[origin.cellIndex];
  if (cell.placement.locked && origin.region !== target.region) return regions;

  let adjustedTarget = target;
  if (
    target.kind === 'slot' &&
    target.region === origin.region &&
    target.rowIndex === origin.rowIndex &&
    target.gapIndex > origin.cellIndex
  ) {
    adjustedTarget = { ...target, gapIndex: target.gapIndex - 1 };
  }

  const withoutCell: RegionsState = { ...regions, [origin.region]: removeCell(originLayout, cellId) };
  // Row indices in the target may have shifted if we just removed the last
  // cell of a row above it in the SAME region — recompute against the
  // post-removal layout. A rejected drop falls back to the ORIGINAL
  // `regions` (cell still in place), not `withoutCell` — otherwise an
  // invalid target would silently delete the cell instead of no-op-ing.
  return applyDrop(rules, withoutCell, adjustedTarget, cell) ?? regions;
}

export function defaultSpanFor(rules: SurfaceRules, item: PageLibraryItem): number {
  if (item.kind === 'widget') return rules.widgets[item.widgetKey]?.minColumnSpan ?? 6;
  if (item.kind === 'content') return 12;
  return 4;
}

export function paletteItemToPlacement(rules: SurfaceRules, item: PageLibraryItem): PagePlacement {
  const id = crypto.randomUUID();
  const columnSpan = defaultSpanFor(rules, item);
  if (item.kind === 'widget') {
    return { id, kind: 'widget', widgetKey: item.widgetKey, column: 0, columnSpan, row: 0 };
  }
  if (item.kind === 'content') {
    return { id, kind: 'content', contentKind: item.contentKind, column: 0, columnSpan, row: 0 };
  }
  return { id, kind: 'field', source: item.source, fieldKey: item.fieldKey, column: 0, columnSpan, row: 0 };
}

function cellFor(placement: PagePlacement): DesignerCell {
  return { id: cellIdForPlacement(placement.id), span: snapSpan(placement.columnSpan), placement };
}

// A widget declared `allowMultiple: false` may exist once per page. Dropping
// it again moves the existing one rather than producing a duplicate the
// runtime would render twice.
function stripSingletonWidget(
  rules: SurfaceRules,
  regions: RegionsState,
  item: PageLibraryItem,
): RegionsState {
  if (item.kind !== 'widget') return regions;
  const widget = rules.widgets[item.widgetKey];
  if (!widget || widget.allowMultiple) return regions;
  let cleaned = regions;
  for (const region of REGION_NAMES) {
    const layout = cleaned[region];
    const nextRows = layout.rows
      .map((row) => ({
        ...row,
        cells: row.cells.filter(
          (cell) => !(cell.placement.kind === 'widget' && cell.placement.widgetKey === item.widgetKey),
        ),
      }))
      .filter((row) => row.cells.length > 0);
    if (nextRows.length !== layout.rows.length) {
      cleaned = { ...cleaned, [region]: { ...layout, rows: nextRows } };
    }
  }
  return cleaned;
}

// Adds a brand-new placement (dragged in from the palette) at a drop target.
// Returns the SAME `regions` reference, unchanged, when the target region
// doesn't allow this item — callers can use reference equality to detect a
// rejected/no-op drop.
export function addPaletteCell(
  rules: SurfaceRules,
  regions: RegionsState,
  item: PageLibraryItem,
  target: DropTarget,
): RegionsState {
  const placement = paletteItemToPlacement(rules, item);
  return applyDrop(rules, stripSingletonWidget(rules, regions, item), target, cellFor(placement)) ?? regions;
}

// Click-to-add: the same insertion the palette's drag performs, but appended
// as a new row at the end of `region`. Drag-and-drop is a *shortcut* in this
// designer, never the only way in — a pointer drag is the least discoverable
// and least accessible interaction there is, and the palette used to offer
// nothing else.
export function appendItemToRegion(
  rules: SurfaceRules,
  regions: RegionsState,
  item: PageLibraryItem,
  region: RegionName,
): { regions: RegionsState; placementId: string } | null {
  if (!itemAllowedInRegion(rules, item, region)) return null;
  const placement = paletteItemToPlacement(rules, item);
  const next = applyDrop(
    rules,
    stripSingletonWidget(rules, regions, item),
    { kind: 'empty', region },
    cellFor(placement),
  );
  if (!next) return null;
  return { regions: next, placementId: placement.id };
}

// The region a click-to-add targets when the user did not pick one: the first
// region in page order the item is actually allowed in.
export function preferredRegionFor(rules: SurfaceRules, item: PageLibraryItem): RegionName | null {
  return REGION_NAMES.find((region) => itemAllowedInRegion(rules, item, region)) ?? null;
}

/** Swaps a cell with its neighbour in the same row (`delta` is -1 or +1). */
export function swapCellInRow(regions: RegionsState, cellId: string, delta: -1 | 1): RegionsState {
  const origin = findCellLocation(regions, cellId);
  if (!origin) return regions;
  const layout = regions[origin.region];
  const row = layout.rows[origin.rowIndex];
  const targetIndex = origin.cellIndex + delta;
  if (targetIndex < 0 || targetIndex >= row.cells.length) return regions;
  const cells = [...row.cells];
  [cells[origin.cellIndex], cells[targetIndex]] = [cells[targetIndex], cells[origin.cellIndex]];
  const rows = [...layout.rows];
  rows[origin.rowIndex] = { ...row, cells };
  return { ...regions, [origin.region]: { rows } };
}

// Moves the whole ROW a cell belongs to, up or down. Deliberately the row and
// not the cell: moving a single cell between rows has to re-fit it against
// the 12-column budget, and when the destination row is full the cell spills
// straight back into a new row where it started — a control that visibly does
// nothing. Moving the row always does exactly what it says.
export function moveRowOfCell(regions: RegionsState, cellId: string, delta: -1 | 1): RegionsState {
  const origin = findCellLocation(regions, cellId);
  if (!origin) return regions;
  const layout = regions[origin.region];
  const target = origin.rowIndex + delta;
  if (target < 0 || target >= layout.rows.length) return regions;
  return { ...regions, [origin.region]: moveRow(layout, origin.rowIndex, target) };
}

/** Appends a cell that already exists to the end of another region. */
export function moveCellToRegion(
  rules: SurfaceRules,
  regions: RegionsState,
  cellId: string,
  region: RegionName,
): RegionsState {
  const origin = findCellLocation(regions, cellId);
  if (!origin || origin.region === region) return regions;
  const cell = regions[origin.region].rows[origin.rowIndex].cells[origin.cellIndex];
  if (cell.placement.locked) return regions;
  if (!placementAllowedInRegion(rules, cell.placement, region)) return regions;
  const stripped: RegionsState = { ...regions, [origin.region]: removeCell(regions[origin.region], cellId) };
  return applyDrop(rules, stripped, { kind: 'empty', region }, cell) ?? regions;
}

export function canDuplicatePlacement(rules: SurfaceRules, placement: PagePlacement): boolean {
  if (placement.locked) return false;
  if (placement.kind !== 'widget' || !placement.widgetKey) return true;
  return rules.widgets[placement.widgetKey]?.allowMultiple ?? false;
}

/** Inserts a copy of a cell immediately after it, in the same row. */
export function duplicateCell(
  rules: SurfaceRules,
  regions: RegionsState,
  cellId: string,
): { regions: RegionsState; placementId: string } | null {
  const origin = findCellLocation(regions, cellId);
  if (!origin) return null;
  const cell = regions[origin.region].rows[origin.rowIndex].cells[origin.cellIndex];
  if (!canDuplicatePlacement(rules, cell.placement)) return null;
  const copy: PagePlacement = { ...cell.placement, id: crypto.randomUUID(), locked: undefined };
  const next = insertCellInRow(regions[origin.region], origin.rowIndex, origin.cellIndex + 1, cellFor(copy));
  return { regions: { ...regions, [origin.region]: next }, placementId: copy.id };
}

export function countPlacements(regions: RegionsState, region: RegionName): number {
  return regions[region].rows.reduce((total, row) => total + row.cells.length, 0);
}

// Maps a palette entry's `itemKey(item)` to the id of the placement already
// representing it on the page. Lets the palette answer "is this already
// placed, and where?" — so an entry can say so and offer to jump to it,
// instead of quietly letting the admin add a second copy of a widget the
// runtime would then render twice. Content elements are never indexed: they
// carry no identity, and several dividers on one page is a normal layout.
export function placedItemIndex(regions: RegionsState): Map<string, string> {
  const index = new Map<string, string>();
  for (const region of REGION_NAMES) {
    for (const row of regions[region].rows) {
      for (const cell of row.cells) {
        const placement = cell.placement;
        if (placement.kind === 'widget' && placement.widgetKey) {
          index.set(`widget-${placement.widgetKey}`, placement.id);
        } else if (placement.kind === 'field' && placement.fieldKey) {
          index.set(`field-${placement.source}-${placement.fieldKey}`, placement.id);
        }
      }
    }
  }
  return index;
}

// Human label for a placement, shared by the DragOverlay placeholder, the
// canvas slot header and the properties panel — same source the runtime
// dispatcher's widget lookup uses, so a dragged item's label always matches
// what the real rendered component would be labeled.
export function placementLabel(
  rules: SurfaceRules,
  placement: PagePlacement,
  specification?: CatalogSpecification,
): string {
  if (placement.kind === 'widget' && placement.widgetKey) {
    return rules.widgets[placement.widgetKey]?.label ?? placement.widgetKey;
  }
  if (placement.kind === 'field') {
    if (placement.label) return placement.label;
    if (placement.source === 'catalog') {
      const field = specification?.fields.find((candidate) => candidate.key === placement.fieldKey);
      return field?.label || placement.fieldKey || '';
    }
    return rules.systemFieldLabels[placement.fieldKey ?? ''] ?? placement.fieldKey ?? '';
  }
  if (placement.kind === 'content') {
    if (placement.contentKind === 'section') return placement.title || 'Section title';
    return contentKindLabel(placement.contentKind);
  }
  return placement.id;
}
