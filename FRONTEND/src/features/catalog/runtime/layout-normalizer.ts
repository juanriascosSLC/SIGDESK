import {
  evaluateCondition,
  isFieldVisible,
  type AudienceKey,
  type CatalogSpecification,
  type DetailFieldPlacement,
  type DetailFieldSource,
  type FieldDefinition,
  type LayoutDocument,
  type LayoutKind,
  type Placement,
  type WidgetKey,
} from '../metamodel';

const DETAIL_WIDGETS: Array<{
  key: WidgetKey;
  flag: 'showSla' | 'showAttachments' | 'showActivity';
}> = [
  { key: 'sla', flag: 'showSla' },
  { key: 'attachments', flag: 'showAttachments' },
  { key: 'activity', flag: 'showActivity' },
];

function widthToColumnSpan(width?: DetailFieldPlacement['width']): 1 | 2 | 3 {
  if (width === 'half') return 2;
  if (width === 'full') return 3;
  return 1;
}

function legacyFieldKeys(specification: CatalogSpecification, kind: 'create' | 'edit'): string[] {
  const views = specification.views ?? {};
  const keys =
    kind === 'edit'
      ? views.edit ?? views.create ?? specification.fields.map((field) => field.key)
      : views.create ?? specification.fields.map((field) => field.key);
  return keys.filter((key) => specification.fields.some((field) => field.key === key));
}

// Ported from the previous DetailLayoutEditor/TicketDetail duplicate default
// candidate lists — kept as the single fallback used only when a definition
// has no detailLayout at all (rare: emptyDefinition() always seeds one).
export function defaultDetailPlacements(fields: FieldDefinition[]): DetailFieldPlacement[] {
  const catalog = (
    fieldKey: string,
    width: DetailFieldPlacement['width'] = 'third',
  ): DetailFieldPlacement | null =>
    fields.some((field) => field.key === fieldKey) ? { source: 'catalog', fieldKey, width } : null;
  return [
    { source: 'ticket', fieldKey: 'requester', width: 'third' as const },
    { source: 'ticket', fieldKey: 'assignee', width: 'third' as const },
    catalog('priority'),
    catalog('category'),
    { source: 'ticket', fieldKey: 'createdAt', width: 'third' as const },
    catalog('site'),
    catalog('deviceType'),
    catalog('assetId'),
    catalog('deviceModel'),
    catalog('cameraChannel'),
    catalog('nvrAffectedChannels'),
    catalog('serverService'),
    catalog('description', 'full'),
  ].filter((placement): placement is DetailFieldPlacement => placement !== null);
}

// Pure, deterministic, read-only compatibility shim: builds an equivalent
// LayoutDocument from the legacy `views`/`detailLayout` fields of a
// specification that has no `layouts` of its own. Never mutates its input.
export function synthesizeLegacyLayout(
  kind: LayoutKind,
  specification: CatalogSpecification,
): LayoutDocument {
  if (kind === 'detail') {
    const legacyPlacements =
      specification.detailLayout?.fields ?? defaultDetailPlacements(specification.fields);
    const placements: Placement[] = legacyPlacements.map((placement, index) => ({
      id: `legacy-detail-${placement.source}-${placement.fieldKey}-${index}`,
      kind: 'field',
      source: placement.source,
      fieldKey: placement.fieldKey,
      label: placement.label,
      columnSpan: widthToColumnSpan(placement.width),
    }));
    const detailLayout = specification.detailLayout;
    for (const widget of DETAIL_WIDGETS) {
      if (detailLayout?.[widget.flag] ?? true) {
        placements.push({
          id: `legacy-detail-widget-${widget.key}`,
          kind: 'widget',
          widgetKey: widget.key,
          columnSpan: 3,
        });
      }
    }
    return { sections: [{ id: 'legacy-detail-section', columns: 3, placements }] };
  }

  const placements: Placement[] = legacyFieldKeys(specification, kind).map((key) => ({
    id: `legacy-${kind}-${key}`,
    kind: 'field',
    source: 'catalog',
    fieldKey: key,
    columnSpan: 1,
  }));
  return { sections: [{ id: `legacy-${kind}-section`, columns: 3, placements }] };
}

// Single read-time entry point used by every consumer (CatalogForm,
// TicketDetail, TemplatePreview): prefers an explicit metamodel 1.4 layout,
// falls back to the legacy synthesis otherwise. audienceKey is presentation
// only — see AudienceKey in metamodel.ts.
export function resolveLayoutDocument(
  specification: CatalogSpecification,
  kind: LayoutKind,
  audienceKey: AudienceKey,
): LayoutDocument {
  const layoutDefinition = specification.layouts?.[kind];
  if (!layoutDefinition) {
    return synthesizeLegacyLayout(kind, specification);
  }
  const variant = layoutDefinition.variants?.find(
    (candidate) => candidate.audienceKey === audienceKey,
  );
  return variant ? variant.document : layoutDefinition.default;
}

// Presentation-only audience resolution: `/portal/**` is the requester-facing
// shell, everything else (`/app/**`) is the agent-facing shell. This is NOT a
// security boundary — the backend does not filter or authorize field access
// by audience in this increment (see AudienceKey in metamodel.ts). It only
// decides which layout variant to render.
export function resolveAudienceKeyFromPath(pathname: string): AudienceKey {
  return pathname.startsWith('/portal') ? 'requester' : 'agent';
}

// Removes catalog-field placements whose underlying FieldDefinition is
// presentationally hidden (field-level visibleWhen). Placement-level
// visibleWhen and section-level visibleWhen are handled separately by
// DynamicLayout/DynamicSection at render time and by
// visibleFieldPlacements() at submit time — this only applies the field's
// own rule, which a placement is never allowed to relax.
export function filterDocumentByFieldVisibility(
  document: LayoutDocument,
  fields: FieldDefinition[],
  data: Record<string, unknown>,
): LayoutDocument {
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  return {
    sections: document.sections.map((section) => ({
      ...section,
      placements: section.placements.filter((placement) => {
        if (placement.kind !== 'field' || placement.source !== 'catalog' || !placement.fieldKey) {
          return true;
        }
        const field = fieldByKey.get(placement.fieldKey);
        return !field || isFieldVisible(field, data);
      }),
    })),
  };
}

// Collects the (source, fieldKey) pairs of field placements that are
// actually visible right now — honoring section.visibleWhen and
// placement.visibleWhen — for building a submit payload. Call this on a
// document already passed through filterDocumentByFieldVisibility so
// field-level visibility is accounted for too.
export function visibleFieldPlacements(
  document: LayoutDocument,
  data: Record<string, unknown>,
): Array<{ source: DetailFieldSource; fieldKey: string }> {
  const results: Array<{ source: DetailFieldSource; fieldKey: string }> = [];
  for (const section of document.sections) {
    if (section.visibleWhen && !evaluateCondition(section.visibleWhen, data)) continue;
    for (const placement of section.placements) {
      if (placement.kind !== 'field' || !placement.source || !placement.fieldKey) continue;
      if (placement.visibleWhen && !evaluateCondition(placement.visibleWhen, data)) continue;
      results.push({ source: placement.source, fieldKey: placement.fieldKey });
    }
  }
  return results;
}

// Write-time, idempotent: materializes explicit layouts for a specification
// that doesn't have any yet, without touching `views`/`detailLayout` (legacy
// consumers keep reading those). Safe to call unconditionally — a no-op if
// `layouts` already exists.
export function upgradeSpecificationTo14(
  specification: CatalogSpecification,
): CatalogSpecification {
  if (specification.layouts) return specification;
  return {
    ...specification,
    layouts: {
      create: { default: synthesizeLegacyLayout('create', specification) },
      edit: { default: synthesizeLegacyLayout('edit', specification) },
      detail: { default: synthesizeLegacyLayout('detail', specification) },
    },
  };
}
