import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock3, RefreshCw, X } from 'lucide-react';
import WorkflowCanvasEditor from './WorkflowCanvasEditor';
import {
  getWorkflow,
  listWorkflowExecutions,
  createDraftFromVersion,
  publishWorkflow,
  publishWorkflowDraft,
  saveWorkflowDraft,
  type PublishWorkflowInput,
  type SaveDraftInput,
  type WorkflowAssignmentConfig,
  type WorkflowDefinition,
  type WorkflowExecution,
} from './api';

function statusStyle(status: WorkflowExecution['estado']) {
  if (status === 'completada') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'fallida') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (status === 'omitida') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
}

const actionLabels: Record<string, string> = {
  notificar_interesados: 'Notify stakeholders',
  asignar_automatico: 'Assign automatically',
  marcar_sla_en_riesgo: 'Mark SLA at risk',
  marcar_sla_incumplido: 'Mark SLA breached',
  escalar_ait: 'Escalate to IT',
};

/** destinoDeRegla resume a dónde apunta la regla que produjo la ejecución.
 *
 * Sale de la CONFIGURACIÓN publicada, no del historial: la ejecución guarda su
 * desenlace, no el destino que se le pidió. Verlos juntos es lo que permite
 * entender una omisión —"se pidió este equipo y el ticket ya tenía otro"— sin
 * abrir el diagrama. */
function destinoDeRegla(definition: WorkflowDefinition | undefined, reglaID: string): string {
  const regla = definition?.reglas?.find((item) => item.id === reglaID);
  const config = regla?.config as WorkflowAssignmentConfig | undefined;
  if (!config || (config.mode !== 'team' && config.mode !== 'user')) return '—';
  const base = `Area ${config.department_id} · Team ${config.team_id}`;
  return config.mode === 'user' ? `${base} · Person ${config.assignee_user_id ?? '—'}` : base;
}

function ExecutionHistory({ workflowID, definition, onClose }: { workflowID: string; definition?: WorkflowDefinition; onClose: () => void }) {
  const executions = useQuery({
    queryKey: ['workflow-executions', workflowID],
    queryFn: () => listWorkflowExecutions(workflowID),
    retry: 1,
    // Polling CONTROLADO mientras algo esté en ejecución.
    //
    // No hay streaming, así que una ejecución que arranca `en_ejecucion`
    // quedaría congelada en pantalla hasta que alguien recargara. Se consulta
    // cada dos segundos, y solo mientras haga falta:
    //
    //   - Se DETIENE en cuanto ninguna ejecución está en curso. Sondear una
    //     lista que ya no puede cambiar es gastar peticiones para siempre.
    //   - Se detiene al desmontar, porque React Query cancela el intervalo con
    //     la consulta; este panel se desmonta al cerrarse.
    //   - `refetchIntervalInBackground` queda en falso (el valor por defecto):
    //     con la pestaña oculta no se consulta nada.
    refetchInterval: (consulta) => {
      const enCurso = (consulta.state.data ?? []).some((ejecucion) => ejecucion.estado === 'en_ejecucion');
      return enCurso ? 2000 : false;
    },
  });
  const hayEnCurso = (executions.data ?? []).some((ejecucion) => ejecucion.estado === 'en_ejecucion');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-border/60 bg-surface-container-low p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-on-surface">
              <Clock3 className="h-5 w-5 text-primary" /> Live execution history
              {hayEnCurso && (
                <span data-testid="historial-en-vivo" className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-cyan-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" /> Live
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">Attempts recorded by Temporal and the Automations runtime.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void executions.refetch()} className="secondary-button px-3" aria-label="Refresh history"><RefreshCw className={`h-4 w-4 ${executions.isFetching ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={onClose} className="secondary-button px-3" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {executions.isLoading && <p className="mt-6 text-sm text-on-surface-variant">Querying executions…</p>}
        {executions.isError && <p className="mt-6 text-sm text-red-300">{executions.error.message}</p>}
        {!executions.isLoading && !executions.isError && (executions.data ?? []).length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-border/50 p-10 text-center text-sm text-on-surface-variant">No tickets have executed this version yet.</div>
        )}
        {(executions.data ?? []).length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border/40 text-xs text-on-surface-variant"><tr><th className="pb-3">Ticket</th><th className="pb-3">Action</th><th className="pb-3">Version</th><th className="pb-3">Configured destination</th><th className="pb-3">Started</th><th className="pb-3">Finished</th><th className="pb-3">Attempts</th><th className="pb-3">Status</th><th className="pb-3">Detail</th></tr></thead>
              <tbody>{(executions.data ?? []).map((execution) => (
                <tr key={execution.id} className="border-b border-border/20">
                  <td className="py-4 font-mono">{execution.ticket_id}</td>
                  <td className="py-4">{actionLabels[execution.accion] ?? execution.accion}</td>
                  <td className="py-4 font-mono text-on-surface-variant" title={`Rule ${execution.regla_id}`}>v{execution.workflow_version}</td>
                  <td className="py-4 max-w-xs truncate text-on-surface-variant" title={destinoDeRegla(definition, execution.regla_id)}>{destinoDeRegla(definition, execution.regla_id)}</td>
                  <td className="py-4 text-on-surface-variant">{new Date(execution.iniciada_en).toLocaleString()}</td>
                  <td className="py-4 text-on-surface-variant">{execution.finalizada_en ? new Date(execution.finalizada_en).toLocaleString() : '—'}</td>
                  <td className="py-4">{execution.intentos}</td>
                  <td className="py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusStyle(execution.estado)}`}>{execution.estado}</span></td>
                  {/* Una omisión NO es un error: es una decisión deliberada de no
                      tocar el ticket. Se muestra su motivo en tono neutro, y solo
                      un fallo se pinta en rojo. */}
                  <td
                    className={`max-w-xs truncate py-4 ${execution.estado === 'fallida' ? 'text-red-300' : 'text-on-surface-variant'}`}
                    title={execution.estado === 'omitida' ? execution.motivo : execution.ultimo_error || execution.motivo}
                  >
                    {execution.estado === 'omitida'
                      ? (execution.motivo || 'No changes were necessary.')
                      : (execution.ultimo_error || execution.motivo || '—')}
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

  if (workflow.isLoading) return <div className="p-8 text-sm text-on-surface-variant">Loading published definition…</div>;
  if (workflow.isError || !workflow.data) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
          <p className="font-black">Could not load workflow</p>
          <p className="mt-1 text-sm">{workflow.error?.message}</p>
          <button type="button" onClick={() => void workflow.refetch()} className="secondary-button mt-4"><RefreshCw className="h-4 w-4" /> Retry</button>
        </div>
      </div>
    );
  }

  // Un BORRADOR se sigue editando; una versión publicada solo se lee.
  //
  // No es una preferencia de interfaz: el backend rechaza modificar una versión
  // publicada, porque es la que el runtime está ejecutando. Ofrecer los
  // controles de edición sobre ella solo produciría un 409 al guardar.
  const esBorrador = workflow.data.estado === 'borrador';

  return (
    <div className="relative h-full min-h-0">
      {esBorrador
        ? <DraftEditor definition={workflow.data} />
        : <PublishedViewer definition={workflow.data} />}
      <button type="button" onClick={() => setShowHistory(true)} /* Por encima del botón flotante del asistente RAG, que ocupa la
             misma esquina (bottom-6 right-6). Compartir el sitio dejaba «Ver
             ejecuciones» tapado y sin poder pulsarse. */
          className="primary-button fixed bottom-24 right-7 z-30 shadow-2xl"><Clock3 className="h-4 w-4" /> View executions</button>
      {showHistory && <ExecutionHistory workflowID={id} definition={workflow.data} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

/** PublishedViewer muestra una versión publicada en solo lectura y ofrece la
 *  única forma de cambiarla: abrir un borrador nuevo de su familia.
 *
 *  El borrador nuevo NO altera la versión publicada ni el workflow que Temporal
 *  está ejecutando; hereda la familia, así que al publicarse archivará a su
 *  predecesora y solo a ella. */
function PublishedViewer({ definition }: { definition: WorkflowDefinition }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const crear = useMutation({
    mutationFn: () => createDraftFromVersion(definition.id),
    onSuccess: async (borrador) => {
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      navigate(`/app/automations/${borrador.id}`);
    },
  });

  return (
    <WorkflowCanvasEditor
      definition={definition}
      readOnly
      onCrearBorrador={() => crear.mutate()}
      creandoBorrador={crear.isPending}
      publishError={crear.isError ? crear.error.message : undefined}
    />
  );
}

/** DraftEditor edita un borrador ya guardado: guardar de nuevo o publicarlo.
 *
 * Publicar usa la ruta del borrador y no el camino directo, para conservar id y
 * versión: el historial de ejecuciones los referencia. */
function DraftEditor({ definition }: { definition: WorkflowDefinition }) {
  const queryClient = useQueryClient();
  const guardar = useMutation({
    mutationFn: (payload: SaveDraftInput) => saveWorkflowDraft(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow', definition.id] });
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
  const publicar = useMutation({
    mutationFn: () => publishWorkflowDraft(definition.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow', definition.id] });
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  return (
    <WorkflowCanvasEditor
      definition={definition}
      saving={guardar.isPending}
      saveError={guardar.isError ? guardar.error.message : undefined}
      onSaveDraft={(payload) => guardar.mutate(payload)}
      publishing={publicar.isPending}
      publishError={publicar.isError ? publicar.error.message : undefined}
      onPublishDraft={() => publicar.mutate()}
    />
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
  // Guardar sin publicar crea el borrador y lleva a su propia URL. Desde ahí
  // recargar reconstruye el diagrama: es lo que hace que el trabajo sobreviva a
  // cerrar la pestaña.
  const guardar = useMutation({
    mutationFn: (payload: SaveDraftInput) => saveWorkflowDraft(payload),
    onSuccess: async (borrador) => {
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      navigate(`/app/automations/${borrador.id}`);
    },
  });

  return (
    <WorkflowCanvasEditor
      publishing={publish.isPending}
      publishError={publish.isError ? publish.error.message : undefined}
      onPublish={(payload) => publish.mutate(payload)}
      saving={guardar.isPending}
      saveError={guardar.isError ? guardar.error.message : undefined}
      onSaveDraft={(payload) => guardar.mutate(payload)}
    />
  );
}

export default function WorkflowBuilder() {
  const { id } = useParams();
  return id && id !== 'new' ? <ExistingWorkflow id={id} /> : <NewWorkflow />;
}
