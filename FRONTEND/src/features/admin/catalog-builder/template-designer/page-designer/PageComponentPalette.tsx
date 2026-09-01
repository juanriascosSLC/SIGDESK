import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, Locate, Plus, Search, X } from 'lucide-react';
import type { CatalogSpecification, RegionName } from '@/features/catalog/metamodel';
import { buildPaletteDragId, itemAllowedInRegion } from './designer-actions';
import { itemAllowedRegions, itemKey, type PageLibraryItem } from './page-library';
import type { AnyPageSurface, PaletteGroupSpec } from './surface';

// The library of things that can go on the page.
//
// Two changes matter more than the styling: every entry can be added with a
// CLICK (drag is now a shortcut, not the only way in — a pointer drag is the
// least discoverable and least accessible interaction there is), and an entry
// that is already on the page says so instead of silently letting you add a
// second copy the runtime would render twice.
export function PageComponentPalette({
  surface,
  entityKey,
  specification,
  placedIndex,
  onAdd,
  onSelectExisting,
}: {
  surface: AnyPageSurface;
  entityKey: string;
  specification: CatalogSpecification;
  /** `itemKey(item)` → id of the placement already representing it. */
  placedIndex: Map<string, string>;
  /** Adds the item to its first allowed region. */
  onAdd: (item: PageLibraryItem) => void;
  /** Selects (and scrolls to) the placement already on the page. */
  onSelectExisting: (placementId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  // Which groups exist, and what goes in them, is the surface's business: a
  // create form has no "system fields" group because there is no ticket yet.
  const groups = useMemo<PaletteGroupSpec[]>(
    () => surface.paletteGroups(entityKey, specification).filter((group) => group.items.length > 0),
    [surface, entityKey, specification],
  );

  const placedIdFor = (item: PageLibraryItem) => placedIndex.get(itemKey(item)) ?? null;

  const matches = (item: PageLibraryItem) =>
    !query || item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);

  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter(matches) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      data-testid="page-designer-palette"
      className="w-full shrink-0 @4xl:sticky @4xl:top-4 @4xl:w-60 @4xl:self-start"
    >
      <div className="rounded-2xl border border-border/40 bg-surface-container">
        <div className="space-y-2 border-b border-border/40 p-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-on-surface">Biblioteca</h3>
            <p className="mt-0.5 text-[11px] leading-4 text-on-surface-variant">
              Haz clic para agregarlo al final de su zona, o arrástralo a un punto exacto.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar componente…"
              aria-label="Buscar componente"
              className="w-full rounded-xl border border-border/40 bg-surface-container-low py-2 pl-8 pr-8 text-xs text-on-surface placeholder:text-on-surface-variant/60"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:text-on-surface"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[22rem] space-y-2 overflow-y-auto p-2.5 @4xl:max-h-[calc(100vh-17rem)]">
          {visibleGroups.length === 0 && (
            <p className="py-6 text-center text-xs text-on-surface-variant">
              Nada coincide con «{search}».
            </p>
          )}
          {visibleGroups.map((group) => (
            <PaletteGroup
              key={group.id}
              surface={surface}
              group={group}
              forceOpen={Boolean(query)}
              placedIdFor={placedIdFor}
              onAdd={onAdd}
              onSelectExisting={onSelectExisting}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function PaletteGroup({
  surface,
  group,
  forceOpen,
  placedIdFor,
  onAdd,
  onSelectExisting,
}: {
  surface: AnyPageSurface;
  group: PaletteGroupSpec;
  forceOpen: boolean;
  placedIdFor: (item: PageLibraryItem) => string | null;
  onAdd: (item: PageLibraryItem) => void;
  onSelectExisting: (placementId: string) => void;
}) {
  const [open, setOpen] = useState(group.defaultOpen);
  const expanded = forceOpen || open;

  return (
    <section className="rounded-xl border border-border/30 bg-surface-container-low/60">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-on-surface-variant transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-on-surface">{group.title}</span>
          <span className="block truncate text-[10px] leading-4 text-on-surface-variant/80">{group.hint}</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface-container-high px-1.5 py-0.5 text-[9px] font-black text-on-surface-variant">
          {group.items.length}
        </span>
      </button>
      {expanded && (
        <div className="space-y-1.5 px-2 pb-2">
          {group.items.map((item) => (
            <PaletteItem
              key={itemKey(item)}
              surface={surface}
              item={item}
              placedId={placedIdFor(item)}
              onAdd={onAdd}
              onSelectExisting={onSelectExisting}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// Region chips are only drawn when an item is NOT allowed everywhere content
// can go — otherwise every row would carry three identical badges that say
// nothing. What is drawn comes from the same registry the drop validation
// reads, so it can never promise a region the canvas would reject.
function restrictedRegions(surface: AnyPageSurface, item: PageLibraryItem): RegionName[] | null {
  const allowed = surface.contentRegions.filter((region) => itemAllowedInRegion(surface, item, region));
  return allowed.length === surface.contentRegions.length ? null : allowed;
}

// An item already on the page stays fully draggable — dropping it somewhere
// else MOVES it (stripSingletonWidget), which is a legitimate thing to want.
// What changes is the click: adding a second copy of a widget the runtime
// renders once is never what the admin meant, so the click jumps to the one
// that already exists instead.
function PaletteItem({
  surface,
  item,
  placedId,
  onAdd,
  onSelectExisting,
}: {
  surface: AnyPageSurface;
  item: PageLibraryItem;
  placedId: string | null;
  onAdd: (item: PageLibraryItem) => void;
  onSelectExisting: (placementId: string) => void;
}) {
  const key = itemKey(item);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: buildPaletteDragId(key),
    data: { type: 'palette', item },
  });
  const Icon = item.icon;
  const restricted = restrictedRegions(surface, item);
  const unavailable = itemAllowedRegions(surface, item).length === 0;
  const placed = placedId !== null;

  function activate() {
    if (unavailable) return;
    if (placedId) onSelectExisting(placedId);
    else onAdd(item);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={activate}
      data-testid={`page-designer-palette-${key}`}
      aria-disabled={unavailable}
      title={
        unavailable
          ? 'Este componente no puede colocarse en ninguna zona editable'
          : placed
            ? 'Ya está en la página — haz clic para ir a él, o arrástralo para moverlo'
            : `Agregar ${item.label}`
      }
      className={`group/item flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
        unavailable
          ? 'cursor-default border-border/20 opacity-50'
          : placed
            ? 'cursor-grab border-emerald-500/25 bg-emerald-500/5 hover:border-emerald-400/50 active:cursor-grabbing'
            : 'cursor-grab border-border/30 bg-surface-container hover:border-primary/50 hover:bg-primary/5 active:cursor-grabbing'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${placed ? 'text-emerald-400/80' : 'text-primary/80'}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-on-surface">{item.label}</p>
        <p className="truncate text-[10px] leading-4 text-on-surface-variant/80">
          {placed ? 'Ya está en la página' : item.description}
        </p>
        {!placed && restricted && (
          <p className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/70">Solo en</span>
            {restricted.length === 0 ? (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/90">ninguna zona</span>
            ) : (
              restricted.map((region) => (
                <span
                  key={region}
                  className="rounded bg-amber-500/10 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-300/90"
                >
                  {surface.regionMeta[region].short}
                </span>
              ))
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label={placed ? `Ir a ${item.label} en el lienzo` : `Agregar ${item.label}`}
        title={placed ? 'Ir a este elemento en el lienzo' : `Agregar ${item.label}`}
        disabled={unavailable}
        onClick={(event) => {
          event.stopPropagation();
          activate();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={`mt-0.5 shrink-0 rounded-md border p-1 transition-opacity disabled:opacity-20 ${
          placed
            ? 'border-emerald-500/30 text-emerald-300 opacity-100 hover:bg-emerald-500/10'
            : 'border-border/40 text-on-surface-variant opacity-0 hover:border-primary hover:text-primary group-hover/item:opacity-100'
        }`}
      >
        {placed ? <Locate className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      </button>
    </div>
  );
}
