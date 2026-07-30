import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Layers, Search } from 'lucide-react';
import type { CatalogSpecification } from '@/features/catalog/metamodel';
import { buildPaletteDragId } from './designer-actions';
import {
  catalogFieldLibraryItems,
  contentPaletteItems,
  itemKey,
  ticketFieldLibraryItems,
  widgetLibraryItems,
  type PageLibraryItem,
} from './page-library';

// Palette items are dnd-kit draggables sharing the SAME DndContext as the
// canvas (owned by PageDesigner) — this is what lets a single onDragEnd
// handler resolve drops from the palette and drops that move an existing
// cell through the same drop-target zones.
export function PageComponentPalette({
  specification,
}: {
  specification: CatalogSpecification;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const matches = (label: string) => !query || label.toLowerCase().includes(query);

  return (
    <aside className="w-full shrink-0 space-y-4 lg:w-64">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar…"
          className="w-full rounded-xl border border-border/40 bg-surface-container-low py-2 pl-9 pr-3 text-sm text-on-surface"
        />
      </div>
      <PaletteGroup title="Widgets" items={widgetLibraryItems().filter((item) => matches(item.label))} />
      <PaletteGroup
        title="Campos de esta entidad"
        items={catalogFieldLibraryItems(specification).filter((item) => matches(item.label))}
      />
      <PaletteGroup
        title="Campos internos del sistema"
        items={ticketFieldLibraryItems().filter((item) => matches(item.label))}
      />
      <PaletteGroup
        title="Elementos estructurales"
        items={contentPaletteItems().filter((item) => matches(item.label))}
      />
    </aside>
  );
}

function PaletteGroup({ title, items }: { title: string; items: PageLibraryItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border/40 bg-surface-container p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
        <Layers className="h-3 w-3" /> {title}
      </h4>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {items.map((item) => (
          <PaletteItem key={itemKey(item)} item={item} />
        ))}
      </div>
    </div>
  );
}

function PaletteItem({ item }: { item: PageLibraryItem }) {
  const key = itemKey(item);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: buildPaletteDragId(key),
    data: { type: 'palette', item },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`page-designer-palette-${key}`}
      className={`cursor-grab rounded-lg border border-border/30 bg-surface-container-low px-3 py-2 text-xs font-bold text-on-surface hover:border-primary/40 active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {item.label}
    </div>
  );
}
