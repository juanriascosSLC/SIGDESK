import { useMemo, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import type { EntityRecord } from './metamodel';

type Props = {
  label: string;
  entityKey: string;
  items: EntityRecord[];
  excludedIds?: Set<string>;
  loading?: boolean;
  pending?: boolean;
  onSelect: (entity: EntityRecord) => void;
};

function searchableText(entity: EntityRecord): string {
  return [
    entity.humanId,
    entity.state,
    entity.data.title,
    entity.data.serviceAffected,
    entity.data.requester,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function SearchableEntityPicker({
  label,
  entityKey,
  items,
  excludedIds = new Set(),
  loading = false,
  pending = false,
  onSelect,
}: Props) {
  const [search, setSearch] = useState('');
  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items
      .filter((entity) => !excludedIds.has(entity.id))
      .filter((entity) => !term || searchableText(entity).includes(term))
      .slice(0, 8);
  }, [excludedIds, items, search]);

  return (
    <div className="rounded-2xl border border-border/40 bg-surface-container p-4">
      <label className="text-xs font-black uppercase tracking-wider text-on-surface">
        {label}
      </label>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Buscar ${entityKey} por ID, título o servicio`}
          className="friendly-input w-full pl-9"
        />
      </div>
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {loading ? (
          <p className="p-3 text-xs text-on-surface-variant">Cargando registros…</p>
        ) : (
          available.map((entity) => (
            <button
              key={entity.id}
              type="button"
              disabled={pending}
              onClick={() => onSelect(entity)}
              className="flex w-full items-center gap-3 rounded-xl border border-border/30 bg-surface-container-low p-3 text-left hover:border-primary/40 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs font-bold text-primary">
                  {entity.humanId}
                </span>
                <span className="block truncate text-xs text-on-surface">
                  {String(entity.data.title || `${entityKey} sin título`)}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-border/40 px-2 py-0.5 text-[9px] font-black uppercase text-on-surface-variant">
                {entity.state}
              </span>
            </button>
          ))
        )}
        {!loading && available.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/40 p-4 text-center text-xs text-on-surface-variant">
            No hay registros disponibles.
          </p>
        )}
      </div>
    </div>
  );
}
