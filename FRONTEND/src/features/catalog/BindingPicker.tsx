import { useMemo, useState } from 'react';
import { HardDrive, RefreshCw, Search, UserRound, X } from 'lucide-react';
import type { BindingValue } from './metamodel';

// TODO-103 — picker real de recurso/agente IT para campos con `bindsTo`.
// Adapta el patrón ya probado de SearchableEntityPicker.tsx (fetch completo +
// filtro client-side por substring) a `BindingValue` en vez de `EntityRecord`
// — shapes distintos, mismo mecanismo de interacción. Decisiones ya tomadas
// por la review de Diseño de esta sesión, no reabrir sin motivo:
//   - Nunca autoselecciona, ni con un solo resultado.
//   - Estados distintos para "cero registros en el sistema" vs. "búsqueda sin
//     match" — el segundo nunca debe decir "no tienes X asignados", sería
//     falso (resource_service no filtra por responsable todavía, TODO-24).
//   - Error inline con retry, nunca un toast global que interrumpa el resto
//     del formulario.
//   - Guardrail de paginación (T21): sobre `searchThreshold` ítems, exige
//     mínimo 2 caracteres antes de mostrar cualquier resultado.
type Props = {
  label: string;
  kind: 'recurso' | 'agenteIt';
  items: BindingValue[];
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  value: BindingValue | null;
  onSelect: (value: BindingValue | null) => void;
  required?: boolean;
  searchThreshold?: number;
  restrictedMessage?: string;
};

const DEFAULT_SEARCH_THRESHOLD = 200;

export function BindingPicker({
  label,
  kind,
  items,
  loading,
  isError,
  onRetry,
  value,
  onSelect,
  required,
  searchThreshold = DEFAULT_SEARCH_THRESHOLD,
  restrictedMessage,
}: Props) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const needsMoreSearch = items.length > searchThreshold && term.length < 2;

  const results = useMemo(() => {
    if (needsMoreSearch) return [];
    return items
      .filter(
        (item) =>
          !term ||
          item.displayName.toLowerCase().includes(term) ||
          (item.tipo ?? '').toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [items, term, needsMoreSearch]);

  const Icon = kind === 'recurso' ? HardDrive : UserRound;

  return (
    <div className="rounded-2xl border border-border/40 bg-surface-container p-4">
      <label className="text-xs font-black uppercase tracking-wider text-on-surface">
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      {restrictedMessage ? (
        <p className="mt-3 rounded-xl border border-dashed border-border/40 p-4 text-xs text-on-surface-variant">
          {restrictedMessage}
        </p>
      ) : value ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-surface-container-low p-3">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">
              {value.displayName}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex shrink-0 items-center gap-1 text-xs font-bold text-primary"
          >
            <X className="h-3 w-3" /> Cambiar
          </button>
        </div>
      ) : (
        <>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                kind === 'recurso'
                  ? 'Buscar por nombre, etiqueta o número de serie'
                  : 'Buscar agente por nombre'
              }
              className="friendly-input w-full pl-9"
            />
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {loading && (
              <p className="flex items-center gap-2 p-3 text-xs text-on-surface-variant">
                <RefreshCw className="h-3 w-3 animate-spin" /> Cargando…
              </p>
            )}
            {!loading && isError && (
              <div className="rounded-xl border border-dashed border-red-500/30 p-4 text-center text-xs text-red-300">
                No se pudo cargar el listado.
                <button
                  type="button"
                  onClick={onRetry}
                  className="ml-2 inline-flex items-center gap-1 font-bold text-primary"
                >
                  <RefreshCw className="h-3 w-3" /> Reintentar
                </button>
              </div>
            )}
            {!loading && !isError && needsMoreSearch && (
              <p className="rounded-xl border border-dashed border-border/40 p-4 text-center text-xs text-on-surface-variant">
                Escribe al menos 2 caracteres para buscar entre {items.length} registros.
              </p>
            )}
            {!loading && !isError && !needsMoreSearch && items.length === 0 && (
              <p className="rounded-xl border border-dashed border-border/40 p-4 text-center text-xs text-on-surface-variant">
                Todavía no hay {kind === 'recurso' ? 'recursos' : 'agentes IT'} registrados en el
                sistema. Contacta a IT.
              </p>
            )}
            {!loading &&
              !isError &&
              !needsMoreSearch &&
              items.length > 0 &&
              results.length === 0 && (
                <p className="rounded-xl border border-dashed border-border/40 p-4 text-center text-xs text-on-surface-variant">
                  Sin coincidencias para «{search}». Prueba con otro término.
                </p>
              )}
            {!loading &&
              !isError &&
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/30 bg-surface-container-low p-3 text-left hover:border-primary/40"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-on-surface">
                      {item.displayName}
                    </span>
                    {item.tipo && (
                      <span className="block truncate text-[10px] text-on-surface-variant">
                        {item.tipo}
                      </span>
                    )}
                  </span>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
