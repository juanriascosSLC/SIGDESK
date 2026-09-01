import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, HardDrive, RefreshCw, Search, Server, Star, UserRound, X } from 'lucide-react';
import type { BindingValue } from './metamodel';

// TODO-106 — picker real de recurso/agente IT para campos con `bindsTo`.
// Adapta el patrón ya probado de SearchableEntityPicker.tsx (fetch completo +
// filtro client-side por substring) a `BindingValue` en vez de `EntityRecord`
// — shapes distintos, mismo mecanismo de interacción. Decisiones ya tomadas
// por la review de Diseño, no reabrir sin motivo:
//   - Nunca autoselecciona, ni con un solo resultado.
//   - Estados distintos para "cero registros en el sistema" vs. "búsqueda sin
//     match" — el segundo nunca debe decir "no tienes X asignados", sería
//     falso.
//   - Error inline con retry, nunca un toast global que interrumpa el resto
//     del formulario.
//   - Guardrail de paginación (T21): sobre `searchThreshold` ítems, exige
//     mínimo 2 caracteres antes de mostrar cualquier resultado.
//
// El modo múltiple (`multiple`, solo para dispositivos) comparte EXACTAMENTE
// el mismo bloque de búsqueda y resultados, así que las cinco decisiones de
// arriba valen igual en ambos modos por construcción, no por disciplina. Lo
// único que cambia es qué hace un clic sobre una opción (alternar en vez de
// reemplazar) y que encima aparecen los chips de lo ya elegido.
type CommonProps = {
  label: string;
  kind: 'recurso' | 'agenteIt' | 'site' | 'asset';
  items: BindingValue[];
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  required?: boolean;
  searchThreshold?: number;
  restrictedMessage?: string;
};

type SingleProps = {
  multiple?: false;
  value: BindingValue | null;
  onSelect: (value: BindingValue | null) => void;
};

type MultiProps = {
  multiple: true;
  value: BindingValue[];
  onSelect: (value: BindingValue[]) => void;
  maxItems?: number;
  /** Texto de conteo ya resuelto por `bindingCountIssue`. '' cuando es válido. */
  countMessage?: string;
};

export type BindingPickerProps = CommonProps & (SingleProps | MultiProps);

const DEFAULT_SEARCH_THRESHOLD = 500;
const RESULT_PAGE_SIZE = 25;

export function BindingPicker(props: BindingPickerProps) {
  const {
    label,
    kind,
    items,
    loading,
    isError,
    onRetry,
    required,
    searchThreshold = DEFAULT_SEARCH_THRESHOLD,
    restrictedMessage,
  } = props;
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  const anchor = useRef<HTMLInputElement | null>(null);
  const term = search.trim().toLowerCase();
  const needsMoreSearch = items.length > searchThreshold && term.length < 2;

  // Una sola normalización: el resto del componente razona siempre en lista,
  // sin importar el modo, y `emit` la devuelve a la forma que espera cada
  // llamador. Así el camino de selección única no tiene una rama propia que
  // pueda divergir.
  const selected: BindingValue[] = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];
  const emit = (next: BindingValue[]) => {
    if (props.multiple) props.onSelect(next);
    else props.onSelect(next[0] ?? null);
  };

  const countMessage = props.multiple ? (props.countMessage ?? '') : '';
  const maxItems = props.multiple ? props.maxItems : undefined;
  const atCapacity = maxItems !== undefined && selected.length >= maxItems;

  // El conteo no tiene equivalente nativo, así que se ancla en el buscador —
  // que en modo múltiple está siempre montado. El <form> del runtime no lleva
  // noValidate, así que esto bloquea el envío de verdad en vez de ser
  // decorativo.
  useEffect(() => {
    anchor.current?.setCustomValidity(countMessage);
  }, [countMessage]);

  const results = useMemo(() => {
    if (needsMoreSearch) return [];
    return items.filter(
      (item) =>
        !term ||
        item.displayName.toLowerCase().includes(term) ||
        item.id.toLowerCase().includes(term) ||
        (item.tipo ?? '').toLowerCase().includes(term),
    );
  }, [items, term, needsMoreSearch]);
  const visibleResults = results.slice(0, visibleCount);

  const Icon = kind === 'agenteIt' ? UserRound : kind === 'site' ? Building2 : kind === 'asset' ? Server : HardDrive;
  const selectedIds = new Set(selected.map((item) => item.id));

  function toggle(item: BindingValue) {
    if (selectedIds.has(item.id)) {
      emit(selected.filter((entry) => entry.id !== item.id));
      return;
    }
    if (atCapacity) return;
    emit([...selected, item]);
  }

  /** Mueve un dispositivo al frente: la posición 0 ES el principal. */
  function makePrincipal(item: BindingValue) {
    emit([item, ...selected.filter((entry) => entry.id !== item.id)]);
  }

  return (
    <div data-testid={`binding-picker-${kind}`} className="rounded-2xl border border-border/40 bg-surface-container p-4">
      <label className="text-xs font-black uppercase tracking-wider text-on-surface">
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      {restrictedMessage ? (
        <p className="mt-3 rounded-xl border border-dashed border-border/40 p-4 text-xs text-on-surface-variant">
          {restrictedMessage}
        </p>
      ) : (
        <>
          {/* Selección única con valor: se colapsa al chip de siempre y se
              oculta la búsqueda. En múltiple los chips conviven con el
              buscador, porque siempre se puede agregar otro. */}
          {!props.multiple && selected.length > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-surface-container-low p-3">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">
                  {selected[0].displayName}
                </span>
              </span>
              <button
                type="button"
                onClick={() => emit([])}
                className="flex shrink-0 items-center gap-1 text-xs font-bold text-primary"
              >
                <X className="h-3 w-3" /> Cambiar
              </button>
            </div>
          ) : (
            <>
              {props.multiple && selected.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {selected.map((item, index) => (
                    <li
                      key={item.id}
                      data-testid={`binding-picker-selected-${kind}-${item.id}`}
                      className="flex items-center gap-2 rounded-xl border border-primary/40 bg-surface-container-low p-3"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">
                        {item.displayName}
                      </span>
                      {index === 0 ? (
                        <span
                          data-testid={`binding-picker-principal-${kind}-${item.id}`}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary"
                        >
                          <Star className="h-3 w-3" /> Principal
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`binding-picker-make-principal-${kind}-${item.id}`}
                          onClick={() => makePrincipal(item)}
                          className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant hover:text-primary"
                        >
                          Hacer principal
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid={`binding-picker-remove-${kind}-${item.id}`}
                        aria-label={`Quitar ${item.displayName}`}
                        onClick={() => emit(selected.filter((entry) => entry.id !== item.id))}
                        className="shrink-0 rounded-lg p-1 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <input
                  ref={anchor}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisibleCount(RESULT_PAGE_SIZE);
                  }}
                  placeholder={
                    kind === 'agenteIt'
                      ? 'Buscar agente por nombre'
                      : kind === 'site'
                        ? 'Buscar sitio por nombre o código'
                        : 'Buscar por nombre, etiqueta o número de serie'
                  }
                  className="friendly-input w-full pl-9"
                />
              </div>

              {props.multiple && (
                <p
                  data-testid={`binding-picker-count-${kind}`}
                  className={`mt-2 text-xs ${countMessage ? 'text-amber-300' : 'text-on-surface-variant'}`}
                >
                  {countMessage ||
                    (maxItems !== undefined
                      ? `${selected.length} de ${maxItems} seleccionados`
                      : `${selected.length} seleccionados`)}
                </p>
              )}

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
                    Todavía no hay {kind === 'agenteIt' ? 'agentes IT' : kind === 'site' ? 'sitios' : 'activos'} registrados en el
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
                  visibleResults.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    // Al tope, lo no elegido se deshabilita con la razón a la
                    // vista: un clic nunca se descarta en silencio.
                    const blocked = !isSelected && atCapacity;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`binding-picker-option-${kind}-${item.id}`}
                        onClick={() => toggle(item)}
                        disabled={blocked}
                        title={blocked ? `Ya seleccionaste el máximo de ${maxItems}.` : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                          isSelected
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border/30 bg-surface-container-low hover:border-primary/40'
                        } ${blocked ? 'cursor-not-allowed opacity-40' : ''}`}
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
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                {!loading && !isError && !needsMoreSearch && results.length > visibleResults.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((current) => current + RESULT_PAGE_SIZE)}
                    className="w-full rounded-xl border border-dashed border-primary/40 p-3 text-xs font-bold text-primary hover:bg-primary/5"
                  >
                    Mostrar más · {results.length - visibleResults.length} restantes
                  </button>
                )}
                {!loading && !isError && !needsMoreSearch && results.length > 0 && (
                  <p className="px-1 pt-1 text-center text-[10px] text-on-surface-variant">
                    Mostrando {visibleResults.length} de {results.length}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
