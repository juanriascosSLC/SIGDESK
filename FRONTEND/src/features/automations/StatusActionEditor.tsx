import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight } from 'lucide-react';

import { listCatalogTransitions } from './api';
import type { WorkflowNodeData } from './CustomNodes';

/** Panel de «Cambiar estado».
 *
 * # Por qué guarda una transition_key y no un estado
 *
 * El estado destino lo decide la definición de Catalog Builder con la que nació
 * CADA ticket. Guardar «en_progreso» obligaría al runtime a inventar cómo se
 * llega ahí, y la misma pareja origen→destino puede no existir en la versión
 * histórica de un ticket. La clave nombra una transición concreta y estable.
 *
 * # Por qué las transiciones se leen de Catalog Builder
 *
 * Porque es su dueño. Una lista propia en Automations se desincroniza en el
 * primer cambio de lifecycle y el diseñador acabaría ofreciendo transiciones
 * que ya no existen. Lo que se guarda es solo la clave.
 */
export default function StatusActionEditor({
  data, readOnly, entityKey = 'INC', onChange,
}: {
  data: WorkflowNodeData;
  readOnly?: boolean;
  entityKey?: string;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
}) {
  const transiciones = useQuery({
    queryKey: ['catalog-transitions', entityKey],
    queryFn: () => listCatalogTransitions(entityKey),
    staleTime: 60_000,
  });

  const elegida = String(data.transitionKey ?? '');
  // useMemo sobre la lista: `transiciones.data ?? []` crea un arreglo nuevo en
  // cada render, y con él como dependencia el memo de abajo no memoiza nada.
  const disponibles = useMemo(() => transiciones.data ?? [], [transiciones.data]);
  const encontrada = useMemo(
    () => disponibles.find((transicion) => transicion.key === elegida),
    [disponibles, elegida],
  );

  // Una referencia que Catalog Builder ya no publica NO se borra: se MARCA.
  // Limpiarla sola cambiaría lo que hace el flujo sin que nadie lo decidiera, y
  // la persona vería un nodo en blanco sin saber que antes pedía algo.
  useEffect(() => {
    if (transiciones.isPending || transiciones.isError) return;
    const ausentes = elegida && !encontrada ? [`la transición “${elegida}”`] : [];
    const actuales = Array.isArray(data.missingReferences) ? data.missingReferences as string[] : [];
    if (JSON.stringify(actuales) !== JSON.stringify(ausentes)) {
      onChange({ missingReferences: ausentes });
    }
    // onChange y data.missingReferences quedan fuera a propósito: incluirlos
    // reejecutaría el efecto con cada render del canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegida, encontrada, transiciones.isPending, transiciones.isError]);

  return (
    <div className="mt-5 space-y-4" data-testid="status-editor">
      <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
        Transición publicada
        <select
          disabled={readOnly || transiciones.isPending}
          value={elegida}
          data-testid="status-transition"
          onChange={(event) => {
            const clave = event.target.value;
            const transicion = disponibles.find((candidata) => candidata.key === clave);
            // El origen y el destino se guardan como ETIQUETA del nodo, para
            // poder leer el diagrama sin abrir el panel. La clave es lo único
            // que se publica: los nombres cambian, la clave no.
            onChange({
              transitionKey: clave,
              transitionFrom: transicion?.from,
              transitionTo: transicion?.to,
              transitionLabel: transicion?.label,
              missingReferences: [],
            });
          }}
          className="input-field mt-2 w-full normal-case"
        >
          <option value="">Selecciona una transición…</option>
          {/* La clave configurada SIEMPRE aparece, aunque no esté entre las
              disponibles. Sin esta opción, un fallo al leer Catalog Builder —o
              una transición retirada— dejaba el selector en blanco y parecía
              que el bloque no tenía nada configurado, justo cuando lo que hace
              falta es ver qué pide para poder corregirlo. */}
          {elegida && !encontrada && (
            <option value={elegida}>
              {transiciones.isError
                ? `${elegida} (no se pudo verificar)`
                : `${elegida} (ya no publicada)`}
            </option>
          )}
          {disponibles.map((transicion) => (
            <option key={transicion.key} value={transicion.key}>
              {(transicion.label ? `${transicion.label} · ` : '') + `${transicion.from} → ${transicion.to}`}
            </option>
          ))}
        </select>
      </label>

      {transiciones.isError && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200" data-testid="status-transitions-error">
          No se pudieron leer las transiciones publicadas de {entityKey}. No se ha borrado la que ya estaba
          configurada; vuelve a intentarlo antes de publicar.
        </p>
      )}

      {elegida && !encontrada && !transiciones.isPending && !transiciones.isError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] leading-relaxed text-red-200" data-testid="status-transition-missing">
          Catalog Builder ya no publica “{elegida}”. La configuración se conserva tal cual, pero no se puede
          publicar hasta elegir una transición vigente.
        </p>
      )}

      {encontrada && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-emerald-200" data-testid="status-summary">
          <span className="font-black">{encontrada.from}</span>
          <ArrowRight className="mx-2 inline h-3 w-3" />
          <span className="font-black">{encontrada.to}</span>
        </div>
      )}

      {encontrada?.requiresInput && (
        <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200" data-testid="status-requires-input">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Esta transición exige información que una automatización no puede aportar —justificación de
            incumplimiento de SLA al cerrar, o motivo al reabrir—. El ticket la rechazará y la ejecución quedará
            fallida. Úsala solo si ese lifecycle no pide esos datos.
          </span>
        </p>
      )}

      <p className="rounded-xl border border-border/40 bg-on-surface/5 p-3 text-[11px] leading-relaxed text-on-surface-variant">
        Cambiar de estado no toca responsable, área ni equipo. Si el ticket ya está en el estado destino, o si
        alguien lo movió antes, la ejecución queda <strong>omitida</strong> con su motivo: no es un fallo.
      </p>
    </div>
  );
}
