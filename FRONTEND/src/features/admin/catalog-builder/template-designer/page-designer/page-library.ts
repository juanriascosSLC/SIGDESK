import type { CatalogSpecification, ContentKind, DetailFieldSource, WidgetKey } from '@/features/catalog/metamodel';
import { TICKET_WIDGETS } from '@/features/tickets/widgets/TicketWidgetRegistry';
import { ticketDetailFields } from '../library-fields';

export type PageLibraryItem =
  | { kind: 'field'; source: DetailFieldSource; fieldKey: string; label: string }
  | { kind: 'widget'; widgetKey: WidgetKey; label: string }
  | { kind: 'content'; contentKind: ContentKind; label: string };

export function itemKey(item: PageLibraryItem): string {
  if (item.kind === 'field') return `field-${item.source}-${item.fieldKey}`;
  if (item.kind === 'widget') return `widget-${item.widgetKey}`;
  return `content-${item.contentKind}`;
}

export const contentLibraryItems: Array<{ contentKind: ContentKind; label: string }> = [
  { contentKind: 'section', label: 'Sección' },
  { contentKind: 'text', label: 'Texto informativo' },
  { contentKind: 'divider', label: 'Separador' },
  { contentKind: 'spacer', label: 'Espacio' },
];

export function widgetLibraryItems(): PageLibraryItem[] {
  return Object.values(TICKET_WIDGETS)
    .filter((widget) => !widget.required)
    .map((widget) => ({ kind: 'widget', widgetKey: widget.key, label: widget.label }));
}

export function catalogFieldLibraryItems(specification: CatalogSpecification): PageLibraryItem[] {
  return specification.fields.map((field) => ({
    kind: 'field',
    source: 'catalog',
    fieldKey: field.key,
    label: field.label,
  }));
}

export function ticketFieldLibraryItems(): PageLibraryItem[] {
  return ticketDetailFields.map((item) => ({ kind: 'field', ...item }));
}

export function contentPaletteItems(): PageLibraryItem[] {
  return contentLibraryItems.map((item) => ({ kind: 'content', contentKind: item.contentKind, label: item.label }));
}
