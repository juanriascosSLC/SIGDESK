import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2, Workflow } from 'lucide-react';

import { listAvailableResources, type CatalogSpecification, type ResourceBinding } from '@/features/catalog/metamodel';
import { EmptyMessage, IconButton, SectionHeading } from './ui';

/** Selector de automatizaciones conectadas (ADR-0039).
 *
 * # Por qué es su propia sección
 *
 * El editor genérico de «Módulos conectados» elige UN recurso por binding y lo
 * identifica por `resourceId`. Para una automatización eso no basta: la
 * referencia apunta a una VERSIÓN publicada exacta (`workflow_id`) dentro de una
 * familia (`workflow_family_id`), se pueden vincular varias a la vez, y cada una
 * puede quedar apagada sin quitarla.
 *
 * # El principio que implementa
 *
 * Un workflow publicado es una capacidad reutilizable; solo una definición
 * publicada de Catalog Builder decide si forma parte del comportamiento de un
 * ticket. Aquí no se copia nada del workflow —ni reglas, ni configuración, ni
 * plan—: se guarda una referencia versionada.
 */
export function AutomationsBindingsEditor({
  specification,
  updateSpecification,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
}) {
  const recursos = useQuery({
    queryKey: ['catalog-resources'],
    queryFn: listAvailableResources,
  });

  const disponibles = useMemo(
    () => (recursos.data ?? []).filter((recurso) => recurso.reference.module === 'automations'),
    [recursos.data],
  );

  const vinculadas = useMemo(
    () => (specification.bindings ?? [])
      .map((binding, index) => ({ binding, index }))
      .filter(({ binding }) => binding.module === 'automations' && binding.resourceType === 'workflow'),
    [specification.bindings],
  );

  const yaVinculados = new Set(vinculadas.map(({ binding }) => binding.resourceInstanceId ?? binding.resourceId));
  const seleccionables = disponibles.filter(
    (recurso) => !yaVinculados.has(recurso.reference.resourceInstanceId ?? recurso.reference.resourceId),
  );

  function vincular(workflowID: string) {
    const recurso = disponibles.find((candidato) => candidato.reference.resourceInstanceId === workflowID);
    if (!recurso) return;
    updateSpecification((current) => {
      current.bindings = [
        ...(current.bindings ?? []),
        {
          module: 'automations',
          resourceType: 'workflow',
          resourceId: recurso.reference.resourceId,
          resourceInstanceId: recurso.reference.resourceInstanceId,
          resourceVersion: recurso.reference.resourceVersion,
          contractVersion: recurso.reference.contractVersion,
          enabled: true,
        } satisfies ResourceBinding,
      ];
      return current;
    });
  }

  return (
    <section className="panel-card p-6 lg:p-8" data-testid="automations-bindings">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          icon={<Workflow className="w-5 h-5" />}
          title="Connected automations"
          description="Which published automations are part of this template's behavior."
        />
      </div>

      <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex gap-3 text-sm">
        <Workflow className="w-5 h-5 text-cyan-300 shrink-0" />
        <p className="text-on-surface-variant">
          Publishing an automation only makes it <strong>available</strong>. It runs when this
          definition binds it and is published. Changing these bindings requires publishing a new
          version of the definition, and only affects records created thereafter.
        </p>
      </div>

      {recursos.isError && (
        <p
          data-testid="automations-bindings-error"
          className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
        >
          Failed to query the automations catalog. Saved bindings were not removed; please try again
          before publishing, because publishing without verifying them will be blocked.
        </p>
      )}

      {vinculadas.length === 0 ? (
        <EmptyMessage text="This template does not run any automations yet." />
      ) : (
        <div className="mt-6 space-y-3">
          {vinculadas.map(({ binding, index }) => {
            const workflowID = binding.resourceInstanceId ?? '';
            const recurso = disponibles.find(
              (candidato) => candidato.reference.resourceInstanceId === workflowID,
            );
            // Una referencia que ya no está entre las publicadas NO se borra: se
            // marca. Quitarla sola cambiaría el comportamiento de la plantilla
            // sin que nadie lo decidiera, y quien administra no sabría que
            // existía.
            const ausente = !recurso && !recursos.isPending && !recursos.isError;
            const habilitada = binding.enabled !== false;
            return (
              <div
                key={`${workflowID}-${index}`}
                data-testid="automation-binding"
                className={`rounded-2xl border p-5 ${ausente ? 'border-red-500/50 bg-red-500/5' : 'border-border/50 bg-surface-container'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-black text-on-surface">
                      {recurso?.displayName ?? `Automation ${workflowID || '(no id)'}`}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Version {binding.resourceVersion ?? '?'} · family {binding.resourceId || '(no family)'}
                    </p>
                    {recurso?.description && (
                      <p className="mt-2 text-xs text-on-surface-variant">{recurso.description}</p>
                    )}
                    {ausente && (
                      <p
                        data-testid="automation-binding-missing"
                        className="mt-2 flex items-center gap-2 text-xs font-bold text-status-danger-fg"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 text-status-danger-icon" />
                        No longer published or was archived. Publishing this definition will be rejected
                        until another version is selected.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                      <input
                        type="checkbox"
                        data-testid="automation-binding-enabled"
                        checked={habilitada}
                        onChange={(event) =>
                          updateSpecification((current) => {
                            current.bindings![index].enabled = event.target.checked;
                            return current;
                          })
                        }
                      />
                      Enabled
                    </label>
                    <IconButton
                      label="Remove automation"
                      danger
                      onClick={() =>
                        updateSpecification((current) => {
                          current.bindings!.splice(index, 1);
                          return current;
                        })
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[260px] text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
          Published automations
          <select
            data-testid="automations-available"
            disabled={recursos.isPending || seleccionables.length === 0}
            value=""
            onChange={(event) => {
              if (event.target.value) vincular(event.target.value);
            }}
            className="friendly-input mt-2 w-full"
          >
            <option value="">
              {recursos.isPending
                ? 'Loading automations…'
                : seleccionables.length === 0
                  ? 'No more published automations to bind'
                  : 'Select a published automation…'}
            </option>
            {seleccionables.map((recurso) => (
              <option
                key={recurso.reference.resourceInstanceId}
                value={recurso.reference.resourceInstanceId}
              >
                {recurso.displayName} · v{recurso.reference.resourceVersion}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center gap-2 pb-3 text-xs text-on-surface-variant">
          <Plus className="h-4 w-4" /> Only published versions appear: a draft cannot be bound.
        </span>
      </div>
    </section>
  );
}

export default AutomationsBindingsEditor;
