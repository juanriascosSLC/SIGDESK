import type { CatalogSpecification, PageLayout, PagePlacement, RegionName } from '@/features/catalog/metamodel';
import { ticketFieldLabels } from '@/features/tickets/widgets/ticket-field-labels';
import { TICKET_WIDGETS } from '@/features/tickets/widgets/TicketWidgetRegistry';
import type { PageLibraryItem } from './page-library';
import {
  cellIdForPlacement,
  findCell,
  fromDesignerRegion,
  insertCellInRow,
  insertNewRow,
  removeCell,
  resizeCell,
  snapSpan,
  toDesignerRegion,
  type DesignerCell,
  type DesignerRegionLayout,
  type DesignerSpan,
} from './designer-grid-model';

export const REGION_NAMES: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];

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

export function isWidgetAllowedInRegion(placement: PagePlacement, region: RegionName): boolean {
  if (placement.kind !== 'widget' || !placement.widgetKey) return true;
  const widget = TICKET_WIDGETS[placement.widgetKey];
  return !widget || widget.allowedRegions.includes(region);
}

// Returns `null` (never a mutated-but-rejected state) when the drop isn't
// allowed, so callers can tell "rejected" apart from "applied" and fall back
// to their own pre-drop state instead of accidentally dropping the cell.
function applyDrop(regions: RegionsState, target: DropTarget, cell: DesignerCell): RegionsState | null {
  if (!isWidgetAllowedInRegion(cell.placement, target.region)) return null;
  if (target.kind === 'empty') {
    return { ...regions, [target.region]: insertNewRow(regions[target.region], regions[target.region].rows.length, cell) };
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
// entry doesn't allow (soft, immediate UI-level version of the rule the
// backend enforces authoritatively at publish time).
export function moveExistingCell(regions: RegionsState, cellId: string, target: DropTarget): RegionsState {
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
  // invalid target would silently delete the cell instead of no-op'ing.
  return applyDrop(withoutCell, adjustedTarget, cell) ?? regions;
}

export function defaultSpanFor(item: PageLibraryItem): number {
  if (item.kind === 'widget') return TICKET_WIDGETS[item.widgetKey]?.minColumnSpan ?? 6;
  if (item.kind === 'content') return 12;
  return 4;
}

export function paletteItemToPlacement(item: PageLibraryItem): PagePlacement {
  const id = crypto.randomUUID();
  if (item.kind === 'widget') {
    return { id, kind: 'widget', widgetKey: item.widgetKey, column: 0, columnSpan: defaultSpanFor(item), row: 0 };
  }
  if (item.kind === 'content') {
    return { id, kind: 'content', contentKind: item.contentKind, column: 0, columnSpan: defaultSpanFor(item), row: 0 };
  }
  return { id, kind: 'field', source: item.source, fieldKey: item.fieldKey, column: 0, columnSpan: defaultSpanFor(item), row: 0 };
}

// Adds a brand-new placement (dragged in from the palette) at a drop target.
// Returns the SAME `regions` reference, unchanged, when the target region
// doesn't allow this item — callers can use reference equality to detect a
// rejected/no-op drop.
export function addPaletteCell(regions: RegionsState, item: PageLibraryItem, target: DropTarget): RegionsState {
  let cleanedRegions = regions;
  if (item.kind === 'widget') {
    const widget = TICKET_WIDGETS[item.widgetKey];
    if (widget && !widget.allowMultiple) {
      for (const reg of REGION_NAMES) {
        const layout = cleanedRegions[reg];
        const nextRows = layout.rows
          .map((row) => ({
            ...row,
            cells: row.cells.filter(
              (cell) => !(cell.placement.kind === 'widget' && cell.placement.widgetKey === item.widgetKey),
            ),
          }))
          .filter((row) => row.cells.length > 0);
        if (nextRows.length !== layout.rows.length) {
          cleanedRegions = { ...cleanedRegions, [reg]: { ...layout, rows: nextRows } };
        }
      }
    }
  }
  const placement = paletteItemToPlacement(item);
  const cell: DesignerCell = { id: cellIdForPlacement(placement.id), span: snapSpan(placement.columnSpan), placement };
  return applyDrop(cleanedRegions, target, cell) ?? regions;
}

// Human label for a placement, shared by the DragOverlay placeholder and
// (formerly) the technical PagePlacementCard chip — same source the runtime
// dispatcher's widget lookup uses, so a dragged item's label always matches
// what the real rendered component would be labeled.
export function placementLabel(placement: PagePlacement, specification?: CatalogSpecification): string {
  if (placement.kind === 'widget' && placement.widgetKey) {
    return TICKET_WIDGETS[placement.widgetKey]?.label ?? placement.widgetKey;
  }
  if (placement.kind === 'field') {
    if (placement.label) return placement.label;
    if (placement.source === 'catalog') {
      return specification?.fields.find((field) => field.key === placement.fieldKey)?.label ?? placement.fieldKey ?? '';
    }
    return ticketFieldLabels[placement.fieldKey ?? ''] ?? placement.fieldKey ?? '';
  }
  if (placement.kind === 'content') {
    switch (placement.contentKind) {
      case 'section':
        return placement.title || 'Sección';
      case 'text':
        return 'Texto informativo';
      case 'divider':
        return 'Separador';
      case 'spacer':
        return 'Espacio';
      default:
        return 'Elemento';
    }
  }
  return placement.id;
}
