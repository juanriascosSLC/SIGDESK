import {
  AtSign,
  Calendar,
  CalendarClock,
  CircleDot,
  Hash,
  Heading,
  Info,
  Link2,
  List,
  ListChecks,
  Minus,
  MoveVertical,
  Phone,
  SquareCheck,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type {
  CatalogSpecification,
  ContentKind,
  DetailFieldSource,
  FieldType,
  PagePlacement,
  RegionName,
  WidgetKey,
} from '@/features/catalog/metamodel';
import { widgetSupportsEntity } from '@/features/catalog/runtime/widget-registry';
import type { SurfaceRules } from './surface';

// Every palette entry carries what the UI needs to be scannable without
// dragging anything: an icon, a one-line explanation of what it puts on the
// page, and the regions it may live in. The regions come from the SAME
// registry the drop validation reads (the active surface's `widgets`), so the
// chips a user sees before dragging can never disagree with what the canvas
// accepts.
export type PageLibraryItem =
  | {
      kind: 'field';
      source: DetailFieldSource;
      fieldKey: string;
      label: string;
      description: string;
      icon: LucideIcon;
    }
  | { kind: 'widget'; widgetKey: WidgetKey; label: string; description: string; icon: LucideIcon }
  | { kind: 'content'; contentKind: ContentKind; label: string; description: string; icon: LucideIcon };

// Unchanged id scheme — `page-designer-palette-${itemKey(item)}` is a public
// contract with the e2e suite (widget-sla, widget-statusHistory, …).
export function itemKey(item: PageLibraryItem): string {
  if (item.kind === 'field') return `field-${item.source}-${item.fieldKey}`;
  if (item.kind === 'widget') return `widget-${item.widgetKey}`;
  return `content-${item.contentKind}`;
}

// Regions that hold editable page content. `header`/`actions` are excluded on
// purpose: they exist to host the two locked, required structural widgets of
// the surface and nothing else — see RegionMeta.fixed.
export const CONTENT_REGIONS: RegionName[] = ['main', 'sidebar', 'footer'];

export function itemAllowedRegions(rules: SurfaceRules, item: PageLibraryItem): RegionName[] {
  if (item.kind === 'widget') {
    return rules.widgets[item.widgetKey]?.allowedRegions ?? rules.contentRegions;
  }
  return rules.contentRegions;
}

// Exhaustivo a proposito (Record, no Partial): un FieldType nuevo sin icono
// rompe la compilacion en vez de aparecer sin icono en la paleta.
const FIELD_TYPE_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  textarea: Type,
  select: List,
  radio: CircleDot,
  multiselect: ListChecks,
  boolean: SquareCheck,
  number: Hash,
  date: Calendar,
  datetime: CalendarClock,
  email: AtSign,
  phone: Phone,
  url: Link2,
};

export const CONTENT_META: Record<ContentKind, { label: string; description: string; icon: LucideIcon }> = {
  section: { label: 'Section title', description: 'Separates content with a header', icon: Heading },
  text: { label: 'Informational text', description: 'A fixed note or instruction for the agent', icon: Info },
  divider: { label: 'Divider', description: 'A horizontal dividing line', icon: Minus },
  spacer: { label: 'Spacer', description: 'A vertical blank space', icon: MoveVertical },
};

export function widgetLibraryItems(rules: SurfaceRules, entityKey: string): PageLibraryItem[] {
  return Object.values(rules.widgets)
    .filter((widget) => !widget.required && widgetSupportsEntity(widget, entityKey))
    .map((widget) => ({
      kind: 'widget',
      widgetKey: widget.key,
      label: widget.label,
      description: `Component from ${widget.ownerModule}`,
      icon: widget.icon,
    }));
}

export function catalogFieldLibraryItems(specification: CatalogSpecification): PageLibraryItem[] {
  return specification.fields.map((field) => ({
    kind: 'field',
    source: 'catalog',
    fieldKey: field.key,
    // A field saved without a label would otherwise render as a blank row
    // with only its description — the technical key is at least identifiable.
    label: field.label || field.key,
    description: field.required ? 'Required field from definition' : 'Field from definition',
    icon: FIELD_TYPE_ICONS[field.type] ?? Type,
  }));
}

// Only surfaces that declare a `ticket` field source offer these: on a create
// form there is no ticket yet, so `requester`/`assignee`/`createdAt` have
// nothing to read.
export function ticketFieldLibraryItems(
  rules: SurfaceRules,
  entityKey: string,
  fields: Array<{ source: DetailFieldSource; fieldKey: string; label: string }>,
): PageLibraryItem[] {
  if (!rules.fieldSources.includes('ticket')) return [];
  if (entityKey !== 'INC') return [];
  return fields.map((item) => ({
    kind: 'field',
    source: item.source,
    fieldKey: item.fieldKey,
    label: item.label,
    description: 'Data maintained by the Tickets module',
    icon: Info,
  }));
}

export function contentPaletteItems(): PageLibraryItem[] {
  return (Object.keys(CONTENT_META) as ContentKind[]).map((contentKind) => ({
    kind: 'content',
    contentKind,
    label: CONTENT_META[contentKind].label,
    description: CONTENT_META[contentKind].description,
    icon: CONTENT_META[contentKind].icon,
  }));
}

export function contentKindLabel(contentKind: ContentKind | undefined): string {
  return contentKind ? CONTENT_META[contentKind].label : 'Element';
}

export function contentKindIcon(contentKind: ContentKind | undefined): LucideIcon {
  return contentKind ? CONTENT_META[contentKind].icon : Info;
}

// The icon the canvas and the properties panel show for an existing
// placement — resolved through the same tables the palette entry it came from
// used, so an element never changes identity between the library and the page.
export function placementIcon(
  rules: SurfaceRules,
  placement: PagePlacement,
  specification: CatalogSpecification,
): LucideIcon {
  if (placement.kind === 'widget' && placement.widgetKey) {
    return rules.widgets[placement.widgetKey]?.icon ?? Info;
  }
  if (placement.kind === 'content') return contentKindIcon(placement.contentKind);
  if (placement.source === 'catalog') {
    const field = specification.fields.find((candidate) => candidate.key === placement.fieldKey);
    return field ? (FIELD_TYPE_ICONS[field.type] ?? Type) : Type;
  }
  return Info;
}
