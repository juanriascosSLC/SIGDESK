import {
  evaluateCondition,
  isFieldVisible,
  type AudienceKey,
  type CatalogSpecification,
  type ConditionExpression,
  type DetailFieldSource,
  type FieldDefinition,
  type FormPageKind,
  type LayoutDocument,
  type LayoutRegion,
  type PageLayout,
  type PageLayoutDefinition,
  type PagePlacement,
  type Placement,
} from '../metamodel';
import { resolveLayoutDocument } from './layout-normalizer';
import {
  legacyColumnSpanToPageColumnSpan,
  pruneRegionBy,
  REGION_NAMES,
} from './page-layout-normalizer';

// Metamodel 1.6 — the create and edit forms as full pages, on the exact same
// region/grid model as the detail page (1.5).
//
// This module is the whole compatibility story. Nothing published before 1.6
// has a `createPage`/`editPage`, so every existing definition resolves through
// `synthesizeFormPageFromLegacy`, which is a pure RE-COORDINATIZATION of the
// 1.4 document those definitions already render today: same fields, same
// order, same labels, same readOnly, same conditions — only sections become
// rows and a 1..3 span becomes a 1..12 one. A form starts using a stored page
// only once an admin opens the designer for that entity and saves.

function emptyRegion(): LayoutRegion {
  return { columns: 12, placements: [] };
}

// A 1.4 section is a container with its own `visibleWhen`; a 1.6 page has no
// such container, so the section's condition is pushed down onto each of its
// placements. Rendering and submit both filter per placement, so the two are
// equivalent — this is the only semantic translation the synthesis performs.
function mergeConditions(
  section?: ConditionExpression,
  placement?: ConditionExpression,
): ConditionExpression | undefined {
  if (!section) return placement;
  if (!placement) return section;
  return { all: [section, placement] };
}

function lockedStructuralWidget(
  kind: FormPageKind,
  widgetKey: 'formHeader' | 'formActions',
): LayoutRegion {
  return {
    columns: 12,
    placements: [
      {
        id: `legacy-form-${kind}-widget-${widgetKey}`,
        kind: 'widget',
        widgetKey,
        locked: true,
        column: 0,
        columnSpan: 12,
        row: 0,
      },
    ],
  };
}

export function synthesizeFormPageFromLegacy(
  specification: CatalogSpecification,
  kind: FormPageKind,
  audienceKey: AudienceKey = 'agent',
): PageLayout {
  const document = resolveLayoutDocument(specification, kind, audienceKey);

  const main = emptyRegion();
  let row = 0;
  let column = 0;
  for (const section of document.sections) {
    // A section title is real content the admin authored; dropping it on the
    // way to 1.6 would silently change what the form says.
    if (section.title) {
      if (column > 0) {
        row += 1;
        column = 0;
      }
      main.placements.push({
        id: `legacy-form-${kind}-section-${section.id}`,
        kind: 'content',
        contentKind: 'section',
        title: section.title,
        column: 0,
        columnSpan: 12,
        row,
      });
      row += 1;
    }
    for (const placement of section.placements) {
      if (placement.kind !== 'field' || !placement.source || !placement.fieldKey) continue;
      const columnSpan = legacyColumnSpanToPageColumnSpan(placement.columnSpan, section.columns);
      if (column + columnSpan > 12) {
        row += 1;
        column = 0;
      }
      main.placements.push({
        id: `legacy-form-${kind}-${placement.source}-${placement.fieldKey}`,
        kind: 'field',
        source: placement.source,
        fieldKey: placement.fieldKey,
        label: placement.label,
        readOnly: placement.readOnly,
        visibleWhen: mergeConditions(section.visibleWhen, placement.visibleWhen),
        column,
        columnSpan,
        row,
      });
      column += columnSpan;
    }
    // A section boundary is a row boundary: two sections never share a row.
    if (column > 0) {
      row += 1;
      column = 0;
    }
  }

  return {
    sidebarColumns: 4,
    header: lockedStructuralWidget(kind, 'formHeader'),
    actions: lockedStructuralWidget(kind, 'formActions'),
    main,
    sidebar: emptyRegion(),
    footer: emptyRegion(),
  };
}

// Single read-time entry point for a form page — prefers an explicit metamodel
// 1.6 page, falls back to the legacy synthesis otherwise. audienceKey is
// presentation only (see AudienceKey in metamodel.ts).
export function resolveFormPageLayout(
  specification: CatalogSpecification,
  kind: FormPageKind,
  audienceKey: AudienceKey,
): PageLayout {
  const definition = kind === 'create' ? specification.createPage : specification.editPage;
  if (!definition) return synthesizeFormPageFromLegacy(specification, kind, audienceKey);
  const variant = definition.variants?.find((candidate) => candidate.audienceKey === audienceKey);
  return variant ? variant.page : definition.default;
}

// Write-time, idempotent: materializes explicit form pages for a specification
// that doesn't have them yet, without touching layouts/views (legacy consumers
// keep reading those). Safe to call unconditionally.
export function upgradeSpecificationToFormPages(
  specification: CatalogSpecification,
): CatalogSpecification {
  const next = { ...specification };
  if (!next.createPage) {
    next.createPage = { default: synthesizeFormPageFromLegacy(specification, 'create') };
  }
  if (!next.editPage) {
    next.editPage = { default: synthesizeFormPageFromLegacy(specification, 'edit') };
  }
  return next;
}

// Removes catalog-field placements whose FieldDefinition is presentationally
// hidden right now (field-level visibleWhen), then closes the gap the removal
// leaves in that row. Placement-level visibleWhen is handled at render time by
// PageLayoutRenderer and at submit time by visiblePageFieldPlacements — this
// only applies the field's own rule, which a placement may never relax.
export function filterPageByFieldVisibility(
  page: PageLayout,
  fields: FieldDefinition[],
  data: Record<string, unknown>,
): PageLayout {
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const filtered: PageLayout = { ...page };
  for (const regionName of REGION_NAMES) {
    filtered[regionName] = pruneRegionBy(page[regionName], (placement) => {
      if (placement.kind !== 'field' || placement.source !== 'catalog' || !placement.fieldKey) {
        return true;
      }
      const field = fieldByKey.get(placement.fieldKey);
      return !field || isFieldVisible(field, data);
    });
  }
  return filtered;
}

// Collects the (source, fieldKey) pairs of field placements that are actually
// visible right now, for building a submit payload. Call this on a page
// already passed through filterPageByFieldVisibility so field-level visibility
// is accounted for too.
//
// This is the 1.6 counterpart of visibleFieldPlacements() and carries the same
// weight: it decides which keys the create payload contains and — via
// TicketDetail.submitFieldChanges — which keys an edit is allowed to touch. A
// field this function forgets is a field the user filled in and the system
// silently dropped.
export function visiblePageFieldPlacements(
  page: PageLayout,
  data: Record<string, unknown>,
): Array<{ source: DetailFieldSource; fieldKey: string }> {
  const results: Array<{ source: DetailFieldSource; fieldKey: string }> = [];
  for (const regionName of REGION_NAMES) {
    for (const placement of page[regionName].placements) {
      if (placement.kind !== 'field' || !placement.source || !placement.fieldKey) continue;
      if (placement.visibleWhen && !evaluateCondition(placement.visibleWhen, data)) continue;
      results.push({ source: placement.source, fieldKey: placement.fieldKey });
    }
  }
  return results;
}

/** Does this page collect `fieldKey` anywhere, regardless of conditions? */
export function pageHasCatalogField(page: PageLayout, fieldKey: string): boolean {
  return REGION_NAMES.some((regionName) =>
    page[regionName].placements.some(
      (placement) =>
        placement.kind === 'field' &&
        placement.source === 'catalog' &&
        placement.fieldKey === fieldKey,
    ),
  );
}

function pageFieldPlacementsInReadingOrder(page: PageLayout): PagePlacement[] {
  return REGION_NAMES.flatMap((regionName) =>
    [...page[regionName].placements]
      .filter((placement) => placement.kind === 'field' && placement.source && placement.fieldKey)
      .sort((left, right) => left.row - right.row || left.column - right.column),
  );
}

// The metamodel 1.4 mirror of a form page, regenerated on every designer
// commit (see PageSurface.projectToLegacy).
//
// It exists because tickets_service validates the `bindsTo` placement rule
// against `layouts.create` only (validar_placement_layouts.go). Deriving the
// mirror instead of freezing it is the point: a frozen copy would keep letting
// a definition publish after the admin removed the field from the real form,
// and the failure would surface much later as ErrRecursoIDVacio on POST
// /entities. Regenerating it means the rule always describes the form that
// actually ships.
export function projectFormPageToLegacyDocument(
  page: PageLayout,
  kind: FormPageKind,
): LayoutDocument {
  const placements: Placement[] = pageFieldPlacementsInReadingOrder(page).map((placement) => ({
    id: `mirror-${kind}-${placement.id}`,
    kind: 'field',
    source: placement.source,
    fieldKey: placement.fieldKey,
    label: placement.label,
    readOnly: placement.readOnly,
    visibleWhen: placement.visibleWhen,
    columnSpan: Math.min(3, Math.max(1, Math.round(placement.columnSpan / 4))) as 1 | 2 | 3,
  }));
  return { sections: [{ id: `mirror-${kind}-section`, columns: 3, placements }] };
}

// Places a catalog field on a page as its own full-width row at the bottom.
//
// Used when a field is created in the Fields editor, so a brand-new field is
// never invisible until someone drags it in — which for a `bindsTo` field is
// not a cosmetic problem: tickets_service refuses to publish a definition
// whose bindsTo field has no placement on the create form.
//
// A full-width new row is the only insertion that cannot overlap anything or
// overflow the region, and the backend rejects both (validar_page_layout.go).
// Packing it into the last row with space left would need grid arithmetic in a
// field editor, which is the wrong place for it.
export function appendCatalogFieldRow(page: PageLayout, fieldKey: string): PageLayout {
  if (pageHasCatalogField(page, fieldKey)) return page;
  const nextRow = page.main.placements.reduce(
    (highest, placement) => Math.max(highest, placement.row + (placement.rowSpan ?? 1)),
    0,
  );
  return {
    ...page,
    main: {
      ...page.main,
      placements: [
        ...page.main.placements,
        {
          id: `placement-${fieldKey}-${nextRow}`,
          kind: 'field',
          source: 'catalog',
          fieldKey,
          column: 0,
          columnSpan: 12,
          row: nextRow,
        },
      ],
    },
  };
}

/** Applies `map` to a page definition's default page and every variant. */
export function mapPageDefinition(
  definition: PageLayoutDefinition,
  map: (page: PageLayout) => PageLayout,
): PageLayoutDefinition {
  return {
    ...definition,
    default: map(definition.default),
    variants: definition.variants?.map((variant) => ({ ...variant, page: map(variant.page) })),
  };
}
