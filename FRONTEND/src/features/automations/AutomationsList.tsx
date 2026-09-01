import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Plus, RefreshCw, Search, ServerCrash, Workflow, Zap } from 'lucide-react';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { deactivateWorkflow, listWorkflows } from './api';

const actionLabels: Record<string, string> = {
  notificar_interesados: 'Notificar creador e interesados',
  asignar_automatico: 'Asignación automática (legado)',
  marcar_sla_en_riesgo: 'Temporizador SLA (legado)',
  marcar_sla_incumplido: 'Incumplimiento SLA (legado)',
  escalar_ait: 'Escalamiento a IT (legado)',
};

export default function AutomationsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const canManage = can(PERMISSIONS.automationsManage);
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: listWorkflows,
    retry: 1,
  });
  const deactivate = useMutation({
    mutationFn: deactivateWorkflow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });
  const normalizedSearch = search.trim().toLowerCase();
  const visible = (workflows.data ?? []).filter((item) =>
    !normalizedSearch ||
    item.categoria_id.toLowerCase().includes(normalizedSearch) ||
    item.reglas?.some((rule) => `${rule.accion} ${rule.condicion ?? ''}`.toLowerCase().includes(normalizedSearch)),
  );

  return (
    <div className="p-6 lg:p-8 w-full h-full overflow-y-auto" data-testid="automations-list">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-wide mb-1 flex items-center gap-3">
            <Workflow className="w-6 h-6 text-primary" /> Automatizaciones
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Workflows publicados y ejecutados por el módulo propietario. El catálogo únicamente los referencia.
          </p>
        </div>
        {canManage && (
          <button onClick={() => navigate('/app/automations/new')} className="primary-button">
            <Plus className="w-5 h-5" /> Crear workflow
          </button>
        )}
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar automatizaciones…" className="input-field w-full pl-10" />
      </div>

      {workflows.isLoading && <p className="text-sm text-on-surface-variant">Consultando el motor de automatizaciones…</p>}
      {workflows.isError && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100" role="alert">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">Automatizaciones no está disponible temporalmente</p>
              <p className="mt-1 text-sm text-amber-100/80">Los tickets continúan seguros. No se muestran datos simulados; comprueba workflow_service, Kafka y Temporal.</p>
              <button type="button" onClick={() => void workflows.refetch()} className="secondary-button mt-4" data-testid="automations-retry">
                <RefreshCw className="h-4 w-4" /> Reintentar
              </button>
            </div>
          </div>
        </div>
      )}

      {!workflows.isLoading && !workflows.isError && visible.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border/50 p-10 text-center text-on-surface-variant">
          No hay workflows que coincidan. Publica el primero para comenzar a automatizar.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map((flow) => (
          <article key={flow.id} className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col hover:border-primary/50 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary border border-border/50">
                <ServerCrash className="w-5 h-5" />
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${flow.estado === 'publicado' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-border/50 text-on-surface-variant'}`}>
                {flow.estado}
              </span>
            </div>
            <h2 className="text-lg font-bold text-on-surface">{flow.categoria_id}</h2>
            <p className="mt-1 text-xs font-mono text-on-surface-variant">v{flow.version} · {flow.id}</p>
            <div className="mt-5 flex-1 space-y-2">
              {(flow.reglas ?? []).map((rule) => (
                <div key={rule.id} className="rounded-xl border border-border/30 bg-on-surface/5 p-3 text-xs">
                  <p className="flex items-center gap-2 font-bold text-on-surface"><Zap className="h-3.5 w-3.5 text-primary" />{actionLabels[rule.accion] ?? rule.accion}</p>
                  {rule.condicion && <p className="mt-1 text-on-surface-variant">{rule.condicion}</p>}
                  {(rule.demora_segundos ?? 0) > 0 && <p className="mt-1 text-blue-300">Espera: {rule.demora_segundos}s</p>}
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2 border-t border-border/30 pt-4">
              <button type="button" onClick={() => navigate(`/app/automations/${flow.id}`)} className="secondary-button flex-1">Ver definición</button>
              {canManage && flow.estado === 'publicado' && (
                <button type="button" disabled={deactivate.isPending} onClick={() => deactivate.mutate(flow.id)} className="secondary-button text-amber-300">Desactivar</button>
              )}
            </div>
          </article>
        ))}
      </div>
      {deactivate.isError && <p className="mt-4 text-sm text-red-300">{deactivate.error.message}</p>}
    </div>
  );
}
