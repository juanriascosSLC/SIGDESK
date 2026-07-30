import { useState } from 'react';
import { Layers, Plus, Search } from 'lucide-react';
import type { CatalogSpecification, DetailFieldSource, WidgetKey } from '@/features/catalog/metamodel';
import { ticketDetailFields, widgetLibraryItems } from './library-fields';

export type PaletteFieldItem = { kind: 'field'; source: DetailFieldSource; fieldKey: string; label: string };
export type PaletteWidgetItem = { kind: 'widget'; widgetKey: WidgetKey; label: string };
export type PaletteItem = PaletteFieldItem | PaletteWidgetItem;

export function ComponentPalette({
  specification,
  onAddSection,
  onDragStart,
}: {
  specification: CatalogSpecification;
  onAddSection: () => void;
  onDragStart: (item: PaletteItem) => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const matches = (label: string) => !query || label.toLowerCase().includes(query);

  const catalogItems: PaletteFieldItem[] = specification.fields.map((field) => ({
    kind: 'field',
    source: 'catalog',
    fieldKey: field.key,
    label: field.label,
  }));
  const ticketItems: PaletteFieldItem[] = ticketDetailFields.map((item) => ({ kind: 'field', ...item }));
  const widgetItems: PaletteWidgetItem[] = widgetLibraryItems.map((item) => ({ kind: 'widget', ...item }));

  return (
    <aside className="w-full shrink-0 space-y-4 lg:w-64">
      <button
        type="button"
        onClick={onAddSection}
        data-testid="template-designer-add-section"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" /> Nueva sección
      </button>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar campo…"
          className="w-full rounded-xl border border-border/40 bg-surface-container-low py-2 pl-9 pr-3 text-sm text-on-surface"
        />
      </div>
      <PaletteGroup
        title="Campos de esta entidad"
        items={catalogItems.filter((item) => matches(item.label))}
        onDragStart={onDragStart}
      />
      <PaletteGroup
        title="Campos internos del sistema"
        items={ticketItems.filter((item) => matches(item.label))}
        onDragStart={onDragStart}
      />
      <PaletteGroup
        title="Elementos del ticket"
        items={widgetItems.filter((item) => matches(item.label))}
        onDragStart={onDragStart}
      />
    </aside>
  );
}

function PaletteGroup({
  title,
  items,
  onDragStart,
}: {
  title: string;
  items: PaletteItem[];
  onDragStart: (item: PaletteItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border/40 bg-surface-container p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
        <Layers className="h-3 w-3" /> {title}
      </h4>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {items.map((item) => {
          const key = item.kind === 'field' ? `field-${item.source}-${item.fieldKey}` : `widget-${item.widgetKey}`;
          return (
            <div
              key={key}
              draggable
              onDragStart={() => onDragStart(item)}
              data-testid={`template-designer-palette-${key}`}
              className="cursor-grab rounded-lg border border-border/30 bg-surface-container-low px-3 py-2 text-xs font-bold text-on-surface hover:border-primary/40 active:cursor-grabbing"
            >
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
