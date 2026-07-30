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

function legacyColumnSpanToPageColumnSpan(columnSpan: number, sectionColumns: number): number {
  const ratio = columnSpan / Math.max(1, sectionColumns);
  return Math.min(12, Math.max(1, Math.round(ratio * 12)));
}

// Pure, deterministic, read-only compatibility shim: reproduces the exact
// visual order TicketDetail.tsx renders today (fields, then merged tickets,
// relations, and — only when the legacy booleans allow it — sla, attachments,
// activity), so no 1.0–1.4 ticket changes appearance until an admin actually
// opens the new page designer for that entity.
export function synthesizePageLayoutFromLegacy(specification: CatalogSpecification): PageLayout {
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
  const mergedConfigured = detailLayout?.fields?.some(
    (placement) => placement.source === 'ticket' && placement.fieldKey === 'mergedCount',
  );
  if (mergedConfigured) {
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
  if (detailLayout?.showSla ?? true) {
    main.placements.push({
      id: 'legacy-page-widget-sla',
      kind: 'widget',
      widgetKey: 'sla',
      column: 0,
      columnSpan: 12,
      row: row++,
    });
  }
  if (detailLayout?.showAttachments ?? true) {
    main.placements.push({
      id: 'legacy-page-widget-attachments',
      kind: 'widget',
      widgetKey: 'attachments',
      column: 0,
      columnSpan: 12,
      row: row++,
    });
  }
  if (detailLayout?.showActivity ?? true) {
    main.placements.push({
      id: 'legacy-page-widget-activity',
      kind: 'widget',
      widgetKey: 'activity',
      column: 0,
      columnSpan: 12,
      row,
    });
  }

  const sidebar = emptyRegion();
  sidebar.placements.push({
    id: 'legacy-page-widget-assetDetails',
    kind: 'widget',
    widgetKey: 'assetDetails',
    column: 0,
    columnSpan: 12,
    row: 0,
  });

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
): PageLayout {
  const definition = specification.detailPage;
  if (!definition) {
    return synthesizePageLayoutFromLegacy(specification);
  }
  const variant = definition.variants?.find((candidate) => candidate.audienceKey === audienceKey);
  return variant ? variant.page : definition.default;
}

const REGION_NAMES: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];

// Drops catalog-field placements whose field is absent from `fields`, then
// closes the horizontal gap that removal leaves behind — but only in the rows
// that actually lost a placement, so a layout with deliberate gaps (possible
// via the Advanced JSON editor) is never silently recompacted.
function pruneRegionToSchema(region: LayoutRegion, knownFieldKeys: Set<string>): LayoutRegion {
  const kept = region.placements.filter(
    (placement) =>
      !(
        placement.kind === 'field' &&
        placement.source === 'catalog' &&
        placement.fieldKey &&
        !knownFieldKeys.has(placement.fieldKey)
      ),
  );
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

// Resolution for the ticket detail page. Presentation follows the CURRENT
// published definition, so an admin redesign applies to every ticket
// immediately; the ticket's data, field definitions and validation keep
// coming from its own historical manifest (see TicketDetail.tsx).
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
  return pruneTicketPageToSchema(page, historicalSpecification.fields);
}

export function pruneTicketPageToSchema(page: PageLayout, fields: FieldDefinition[]): PageLayout {
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
): CatalogSpecification {
  if (specification.detailPage) return specification;
  return {
    ...specification,
    detailPage: { default: synthesizePageLayoutFromLegacy(specification) },
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
