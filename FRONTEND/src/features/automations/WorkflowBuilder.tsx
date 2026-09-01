import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock3, RefreshCw, X } from 'lucide-react';
import WorkflowCanvasEditor from './WorkflowCanvasEditor';
import {
  getWorkflow,
  listWorkflowExecutions,
  publishWorkflow,
  type PublishWorkflowInput,
  type WorkflowExecution,
} from './api';

function statusStyle(status: WorkflowExecution['estado']) {
  if (status === 'completada') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'fallida') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (status === 'omitida') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
}

const actionLabels: Record<string, string> = {
  notificar_interesados: 'Notificar interesados',
  asignar_automatico: 'Asignar automáticamente',
  marcar_sla_en_riesgo: 'Marcar SLA en riesgo',
  marcar_sla_incumplido: 'Marcar SLA incumplido',
  escalar_ait: 'Escalar a IT',
};

function ExecutionHistory({ workflowID, onClose }: { workflowID: string; onClose: () => void }) {
  const executions = useQuery({
    queryKey: ['workflow-executions', workflowID],
    queryFn: () => listWorkflowExecutions(workflowID),
    retry: 1,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-border/60 bg-surface-container-low p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-on-surface"><Clock3 className="h-5 w-5 text-primary" /> Historial real de ejecuciones</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Intentos registrados por Temporal y el runtime de Automations.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void executions.refetch()} className="secondary-button px-3" aria-label="Actualizar historial"><RefreshCw className={`h-4 w-4 ${executions.isFetching ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={onClose} className="secondary-button px-3" aria-label="Cerrar"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {executions.isLoading && <p className="mt-6 text-sm text-on-surface-variant">Consultando ejecuciones…</p>}
        {executions.isError && <p className="mt-6 text-sm text-red-300">{executions.error.message}</p>}
        {!executions.isLoading && !executions.isError && (executions.data ?? []).length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-border/50 p-10 text-center text-sm text-on-surface-variant">Aún no hay tickets que hayan ejecutado esta versión.</div>
        )}
        {(executions.data ?? []).length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border/40 text-xs text-on-surface-variant"><tr><th className="pb-3">Ticket</th><th className="pb-3">Acción</th><th className="pb-3">Inicio</th><th className="pb-3">Intentos</th><th className="pb-3">Estado</th><th className="pb-3">Detalle</th></tr></thead>
              <tbody>{(executions.data ?? []).map((execution) => (
                <tr key={execution.id} className="border-b border-border/20">
                  <td className="py-4 font-mono">{execution.ticket_id}</td>
                  <td className="py-4">{actionLabels[execution.accion] ?? execution.accion}</td>
                  <td className="py-4 text-on-surface-variant">{new Date(execution.iniciada_en).toLocaleString()}</td>
                  <td className="py-4">{execution.intentos}</td>
                  <td className="py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusStyle(execution.estado)}`}>{execution.estado}</span></td>
                  <td
                    className={`max-w-xs truncate py-4 ${execution.estado === 'fallida' ? 'text-red-300' : 'text-on-surface-variant'}`}
                    title={execution.ultimo_error || execution.motivo}
                  >
                    {execution.ultimo_error || execution.motivo || (execution.estado === 'omitida' ? 'No fue necesario aplicar cambios.' : '—')}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ExistingWorkflow({ id }: { id: string }) {
  const [showHistory, setShowHistory] = useState(false);
  const workflow = useQuery({ queryKey: ['workflow', id], queryFn: () => getWorkflow(id), retry: 1 });

  if (workflow.isLoading) return <div className="p-8 text-sm text-on-surface-variant">Cargando definición publicada…</div>;
  if (workflow.isError || !workflow.data) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
          <p className="font-black">No se pudo cargar el workflow</p>
          <p className="mt-1 text-sm">{workflow.error?.message}</p>
          <button type="button" onClick={() => void workflow.refetch()} className="secondary-button mt-4"><RefreshCw className="h-4 w-4" /> Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <WorkflowCanvasEditor definition={workflow.data} readOnly />
      <button type="button" onClick={() => setShowHistory(true)} className="primary-button fixed bottom-7 right-7 z-30 shadow-2xl"><Clock3 className="h-4 w-4" /> Ver ejecuciones</button>
      {showHistory && <ExecutionHistory workflowID={id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function NewWorkflow() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const publish = useMutation({
    mutationFn: (payload: PublishWorkflowInput) => publishWorkflow(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      navigate(`/app/automations/${created.id}`);
    },
  });

  return (
    <WorkflowCanvasEditor
      publishing={publish.isPending}
      publishError={publish.isError ? publish.error.message : undefined}
      onPublish={(payload) => publish.mutate(payload)}
    />
  );
}

export default function WorkflowBuilder() {
  const { id } = useParams();
  return id && id !== 'new' ? <ExistingWorkflow id={id} /> : <NewWorkflow />;
}
