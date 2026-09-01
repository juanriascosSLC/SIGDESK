import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CirclePlay, ListChecks, LockKeyhole, RotateCcw } from 'lucide-react';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { listAssignedChangeTasks, transitionChangeTask, type ChangeTask } from './api';

function actionFor(task: ChangeTask) {
  switch (task.status) {
    case 'ready': return { key: 'start', label: 'Iniciar', Icon: CirclePlay };
    case 'in_progress': return { key: 'complete', label: 'Completar', Icon: CheckCircle2 };
    case 'blocked': return { key: 'unblock', label: 'Desbloquear', Icon: RotateCcw };
    default: return null;
  }
}

export function AssignedChangeTasksPanel() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canView = can(PERMISSIONS.changeTasksView);
  const canExecute = can(PERMISSIONS.changeTasksExecute);
  const query = useQuery({
    queryKey: ['changes', 'assigned-tasks'],
    queryFn: () => listAssignedChangeTasks('mine'),
    enabled: canView,
    refetchInterval: 20_000,
  });
  const mutation = useMutation({
    mutationFn: ({ task, key }: { task: ChangeTask; key: string }) => {
      const evidence = key === 'complete'
        ? [window.prompt('Evidencia o resultado de la tarea:')?.trim()].filter(Boolean) as string[]
        : undefined;
      return transitionChangeTask(task.changeId, task.id, key, { evidence });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['changes', 'assigned-tasks'] });
    },
  });

  if (!canView) return null;
  const items = query.data ?? [];

  return (
    <section className="mb-6 rounded-3xl border border-primary/25 bg-primary/5 p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/15 p-2.5 text-primary"><ListChecks className="h-5 w-5" /></div>
        <div>
          <h2 className="font-black text-on-surface">Mi trabajo asignado</h2>
          <p className="text-xs text-on-surface-variant">Tasks de RFC dirigidas a tu área. Ver una Task no concede acceso a toda la RFC.</p>
        </div>
      </div>
      {query.isLoading && <p className="mt-4 text-sm text-on-surface-variant">Cargando trabajo asignado…</p>}
      {query.isError && <p className="mt-4 text-sm text-red-300">No se pudo cargar tu trabajo asignado: {query.error.message}</p>}
      {!query.isLoading && !query.isError && items.length === 0 && <p className="mt-4 text-sm text-on-surface-variant">No tienes Tasks de RFC asignadas.</p>}
      {items.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(({ task, change }) => {
            const action = actionFor(task);
            return (
              <article key={task.id} className="rounded-2xl border border-border/40 bg-surface-container-low p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-mono text-[11px] font-bold text-primary">{task.humanId} · {change.humanId}</div><h3 className="mt-1 font-bold text-on-surface">{task.title}</h3></div>
                  <span className="rounded-full border border-border/50 px-2 py-1 text-[9px] font-black uppercase text-on-surface-variant">{task.status.replace('_', ' ')}</span>
                </div>
                <p className="mt-2 text-xs text-on-surface-variant">{change.title || 'RFC'} · {task.organization?.departmentName || task.area}</p>
                {canExecute && action && (
                  <button disabled={mutation.isPending} onClick={() => mutation.mutate({ task, key: action.key })} className="secondary-button mt-4 !px-3 !py-1.5 text-xs disabled:opacity-40"><action.Icon className="h-3.5 w-3.5" />{action.label}</button>
                )}
                {task.status === 'blocked' && <div className="mt-3 flex items-center gap-2 text-xs text-amber-300"><LockKeyhole className="h-3.5 w-3.5" />{task.blockedReason}</div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
