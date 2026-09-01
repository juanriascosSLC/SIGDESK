import type {
  AudienceKey,
  CatalogSpecification,
  FieldDefinition,
  LayoutRegion,
  PageLayout,
  PagePlacement,
  RegionName,
} from '../metamodel';
import { resolveLayoutDocument } from './layout-normalizer';

function emptyRegion(): LayoutRegion {
  return { columns: 12, placements: [] };
}

export function legacyColumnSpanToPageColumnSpan(columnSpan: number, sectionColumns: number): number {
  const ratio = columnSpan / Math.max(1, sectionColumns);
  return Math.min(12, Math.max(1, Math.round(ratio * 12)));
}

// Pure, deterministic, read-only compatibility shim: reproduces the exact
// visual order TicketDetail.tsx renders today (fields, then merged tickets,
// relations, and — only when the legacy booleans allow it — sla, attachments,
// activity), so no 1.0–1.4 ticket changes appearance until an admin actually
// opens the new page designer for that entity.
export function synthesizePageLayoutFromLegacy(
  specification: CatalogSpecification,
  entityKey = 'INC',
): PageLayout {
  const legacyDocument = resolveLayoutDocument(specification, 'detail', 'agent');

  const main = emptyRegion();
  let row = 0;
  for (const section of legacyDocument.sections) {
    for (const placement of section.placements) {
      if (placement.kind !== 'field' || !placement.source || !placement.fieldKey) continue;
      main.placements.push({
        id: `legacy-page-${placement.source}-${placement.fieldKey}`,
        kind: 'field',
        source: placement.source,
        fieldKey: placement.fieldKey,
        label: placement.label,
        column: 0,
        columnSpan: legacyColumnSpanToPageColumnSpan(placement.columnSpan, section.columns),
        row,
      });
      row += 1;
    }
  }

  const detailLayout = specification.detailLayout;
  const isIncident = entityKey === 'INC';
  const mergedConfigured = detailLayout?.fields?.some(
    (placement) => placement.source === 'ticket' && placement.fieldKey === 'mergedCount',
  );
  if (isIncident && mergedConfigured) {
    main.placements.push({
      id: 'legacy-page-widget-mergedTickets',
      kind: 'widget',
      widgetKey: 'mergedTickets',
      column: 0,
      columnSpan: 12,
      row: row++,
    });
  }
  main.placements.push({
    id: 'legacy-page-widget-itsmRelations',
    kind: 'widget',
    widgetKey: 'itsmRelations',
    column: 0,
    columnSpan: 12,
    row: row++,
  });
  if (isIncident && (detailLayout?.showSla ?? true)) {
    main.placements.push({
      id: 'legacy-page-widget-sla',
      kind: 'widget',
      widgetKey: 'sla',
      column: 0,
      columnSpan: 12,
      row: row++,
    });
  }
  if (isIncident && (detailLayout?.showAttachments ?? true)) {
    main.placements.push({
      id: 'legacy-page-widget-attachments',
      kind: 'widget',
      widgetKey: 'attachments',
      column: 0,
      columnSpan: 12,
      row: row++,
    });
  }
  if (isIncident && (detailLayout?.showActivity ?? true)) {
    main.placements.push({
      id: 'legacy-page-widget-activity',
      kind: 'widget',
      widgetKey: 'activity',
      column: 0,
      columnSpan: 12,
      row,
    });
  }

  if (entityKey === 'RFC') {
    main.placements.push({
      id: 'legacy-page-widget-changeTasks',
      kind: 'widget',
      widgetKey: 'changeTasks',
      column: 0,
      columnSpan: 12,
      row,
    });
  }

  const sidebar = emptyRegion();
  if (isIncident) {
    sidebar.placements.push({
      id: 'legacy-page-widget-assetDetails',
      kind: 'widget',
      widgetKey: 'assetDetails',
      column: 0,
      columnSpan: 12,
      row: 0,
    });
  }

  const header: LayoutRegion = {
    columns: 12,
    placements: [
      {
        id: 'legacy-page-widget-ticketHeader',
        kind: 'widget',
        widgetKey: 'ticketHeader',
        locked: true,
        column: 0,
        columnSpan: 12,
        row: 0,
      },
    ],
  };
  const actions: LayoutRegion = {
    columns: 12,
    placements: [
      {
        id: 'legacy-page-widget-ticketActions',
        kind: 'widget',
        widgetKey: 'ticketActions',
        locked: true,
        column: 0,
        columnSpan: 12,
        row: 0,
      },
    ],
  };

  return {
    sidebarColumns: 4,
    header,
    actions,
    main,
    sidebar,
    footer: emptyRegion(),
  };
}

// Single read-time entry point for the detail page — prefers an explicit
// metamodel 1.5 page, falls back to the legacy synthesis otherwise.
// audienceKey is presentation only (see AudienceKey in metamodel.ts).
export function resolvePageLayout(
  specification: CatalogSpecification,
  audienceKey: AudienceKey,
  entityKey = 'INC',
): PageLayout {
  const definition = specification.detailPage;
  if (!definition) {
    return synthesizePageLayoutFromLegacy(specification, entityKey);
  }
  const variant = definition.variants?.find((candidate) => candidate.audienceKey === audienceKey);
  return variant ? variant.page : definition.default;
}

const PAGE_PLACEMENT_KINDS = new Set(['field', 'widget', 'content']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGridInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function parseRegion(value: unknown): LayoutRegion | null {
  if (!isRecord(value) || !isGridInteger(value.columns, 1, 12) || !Array.isArray(value.placements)) {
    return null;
  }
  const placements: PagePlacement[] = [];
  const ids = new Set<string>();
  for (const candidate of value.placements) {
    if (!isRecord(candidate)) return null;
    const { id, kind, column, columnSpan, row, rowSpan } = candidate;
    if (
      typeof id !== 'string' || !id.trim() || ids.has(id) ||
      typeof kind !== 'string' || !PAGE_PLACEMENT_KINDS.has(kind) ||
      !isGridInteger(column, 0, value.columns - 1) ||
      !isGridInteger(columnSpan, 1, value.columns) || column + columnSpan > value.columns ||
      !isGridInteger(row, 0, Number.MAX_SAFE_INTEGER) ||
      (rowSpan !== undefined && !isGridInteger(rowSpan, 1, Number.MAX_SAFE_INTEGER))
    ) {
      return null;
    }
    if (kind === 'field' && (typeof candidate.fieldKey !== 'string' || !candidate.fieldKey.trim())) {
      return null;
    }
    if (kind === 'widget' && (typeof candidate.widgetKey !== 'string' || !candidate.widgetKey.trim())) {
      return null;
    }
    if (
      kind === 'content' &&
      !['section', 'text', 'divider', 'spacer'].includes(String(candidate.contentKind ?? ''))
    ) {
      return null;
    }
    ids.add(id);
    placements.push(candidate as unknown as PagePlacement);
  }
  return { columns: value.columns, placements };
}

// Runtime trust boundary for definitions persisted before strict publication
// validation existed. A malformed historical document must never crash a
// record detail page; callers can use the deterministic legacy synthesis.
export function parseResolvedPageLayout(rawLayouts: unknown): PageLayout | null {
  if (!isRecord(rawLayouts)) return null;
  const detailCandidate = rawLayouts.detailPage ?? rawLayouts.detail ?? rawLayouts;
  if (!isRecord(detailCandidate)) return null;
  const candidate = isRecord(detailCandidate.default) ? detailCandidate.default : detailCandidate;
  if (!isRecord(candidate) || !isGridInteger(candidate.sidebarColumns, 3, 5)) return null;

  const header = parseRegion(candidate.header);
  const actions = parseRegion(candidate.actions);
  const main = parseRegion(candidate.main);
  const sidebar = parseRegion(candidate.sidebar);
  const footer = parseRegion(candidate.footer);
  if (!header || !actions || !main || !sidebar || !footer) return null;
  return { sidebarColumns: candidate.sidebarColumns, header, actions, main, sidebar, footer };
}

export const REGION_NAMES: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];

// Drops the placements `keep` rejects, then closes the horizontal gap the
// removal leaves behind — but only in the rows that actually lost a placement,
// so a layout with deliberate gaps (possible via the Advanced JSON editor) is
// never silently recompacted.
//
// Two policies share this one implementation of the grid arithmetic: dropping
// fields absent from the schema (pruneRegionToSchema, below) and dropping
// fields hidden right now by a condition (filterPageByFieldVisibility, in
// form-page-normalizer.ts). Writing the recompaction twice is how the two
// would drift.
export function pruneRegionBy(
  region: LayoutRegion,
  keep: (placement: PagePlacement) => boolean,
): LayoutRegion {
  const kept = region.placements.filter(keep);
  if (kept.length === region.placements.length) return region;

  const affectedRows = new Set(
    region.placements.filter((placement) => !kept.includes(placement)).map((placement) => placement.row),
  );
  const byRow = new Map<number, PagePlacement[]>();
  for (const placement of kept) {
    if (!affectedRows.has(placement.row)) continue;
    byRow.set(placement.row, [...(byRow.get(placement.row) ?? []), placement]);
  }
  const recompacted = new Map<string, number>();
  for (const [, placements] of byRow) {
    let column = 0;
    for (const placement of [...placements].sort((left, right) => left.column - right.column)) {
      recompacted.set(placement.id, column);
      column += placement.columnSpan;
    }
  }

  return {
    ...region,
    placements: kept.map((placement) =>
      recompacted.has(placement.id) ? { ...placement, column: recompacted.get(placement.id)! } : placement,
    ),
  };
}

function pruneRegionToSchema(region: LayoutRegion, knownFieldKeys: Set<string>): LayoutRegion {
  return pruneRegionBy(
    region,
    (placement) =>
      !(
        placement.kind === 'field' &&
        placement.source === 'catalog' &&
        placement.fieldKey &&
        !knownFieldKeys.has(placement.fieldKey)
      ),
  );
}

// Compatibility helper for callers that explicitly opt into resolving a
// current layout against an older schema. The real ticket runtime does not
// use this policy: TicketDetail renders the exact immutable layout returned
// by the record's historical resolved-definition endpoint.
//
// When the two disagree — the published layout places a catalog field that
// did not exist in the schema this ticket was created under — the placement
// is dropped rather than rendered as an anonymous empty card: the ticket has
// no such field and never did. Falls back to the historical specification
// when the published one is unavailable (offline, 404, still loading).
export function resolveTicketPageLayout(
  publishedSpecification: CatalogSpecification | undefined,
  historicalSpecification: CatalogSpecification,
  audienceKey: AudienceKey,
): PageLayout {
  if (!publishedSpecification) {
    return resolvePageLayout(historicalSpecification, audienceKey);
  }
  const page = resolvePageLayout(publishedSpecification, audienceKey);
  return prunePageToSchema(page, historicalSpecification.fields);
}

export function prunePageToSchema(page: PageLayout, fields: FieldDefinition[]): PageLayout {
  const knownFieldKeys = new Set(fields.map((field) => field.key));
  const pruned: PageLayout = { ...page };
  for (const regionName of REGION_NAMES) {
    pruned[regionName] = pruneRegionToSchema(page[regionName], knownFieldKeys);
  }
  return pruned;
}

// Write-time, idempotent: materializes an explicit detailPage for a
// specification that doesn't have one yet, without touching
// layouts/detailLayout/views (legacy consumers keep reading those).
export function upgradeSpecificationToPageLayout(
  specification: CatalogSpecification,
  entityKey = 'INC',
): CatalogSpecification {
  if (specification.detailPage) return specification;
  return {
    ...specification,
    detailPage: { default: synthesizePageLayoutFromLegacy(specification, entityKey) },
  };
}

function collectPlacements(page: PageLayout): Array<{ region: LayoutRegion; placement: PagePlacement }> {
  const regions: LayoutRegion[] = [page.header, page.actions, page.main, page.sidebar, page.footer];
  return regions.flatMap((region) => region.placements.map((placement) => ({ region, placement })));
}

export function findPagePlacementsByWidgetKey(page: PageLayout, widgetKey: string): PagePlacement[] {
  return collectPlacements(page)
    .filter(({ placement }) => placement.kind === 'widget' && placement.widgetKey === widgetKey)
    .map(({ placement }) => placement);
}
