import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CirclePlay,
  Clock3,
  ListChecks,
  LockKeyhole,
  Paperclip,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import {
  listAssignedChangeTasks,
  transitionChangeTask,
  type AssignedChangeTask,
  type AssignedChangeTaskFilter,
  type ChangeTask,
} from './api';
import { taskStatusMeta } from './presentation';

/**
 * «Mis tareas» — la superficie de quien EJECUTA el trabajo, no de quien
 * gobierna el cambio.
 *
 * Existe porque una Task de RFC puede dirigirse a un departamento distinto
 * del que abrió la RFC: alguien de Warehouse recibe trabajo de una RFC de
 * Services y necesita verlo, iniciarlo y cerrarlo con evidencia — sin que
 * eso le conceda lectura de todas las RFC de Services. Por eso consume
 * `/changes/tasks/assigned`, que devuelve la Task más el CONTEXTO MÍNIMO de
 * su RFC padre (código, estado y título), nunca la RFC entera.
 */

const filterTabs: Array<{ key: AssignedChangeTaskFilter; label: string; hint: string }> = [
  { key: 'mine', label: 'Asignadas a mí', hint: 'Solo las tareas de las que eres responsable.' },
  { key: 'team', label: 'De mi equipo', hint: 'El trabajo de tu equipo, si tu rol lo alcanza.' },
  { key: 'scope', label: 'Todo mi alcance', hint: 'Todo lo que tu rol permite ver.' },
];

function nextActions(task: ChangeTask): Array<{ key: string; label: string; icon: typeof CirclePlay }> {
  switch (task.status) {
    case 'ready': return [{ key: 'start', label: 'Iniciar', icon: CirclePlay }];
    case 'in_progress': return [{ key: 'complete', label: 'Completar con evidencia', icon: CheckCircle2 }];
    case 'blocked': return [{ key: 'unblock', label: 'Desbloquear', icon: RotateCcw }];
    default: return [];
  }
}

export default function MyChangeTasks() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AssignedChangeTaskFilter>('mine');
  const [notice, setNotice] = useState('');
  const [evidenceFor, setEvidenceFor] = useState<ChangeTask | null>(null);
  const [evidence, setEvidence] = useState('');
  const canExecute = can(PERMISSIONS.changeTasksExecute);

  const query = useQuery({
    queryKey: ['changes', 'assigned-tasks', filter],
    queryFn: () => listAssignedChangeTasks(filter),
  });
  const items = useMemo(() => query.data ?? [], [query.data]);

  const transition = useMutation({
    mutationFn: ({ task, key, evidenceText }: { task: ChangeTask; key: string; evidenceText?: string }) =>
      transitionChangeTask(task.changeId, task.id, key, {
        evidence: evidenceText ? [evidenceText] : undefined,
      }),
    onSuccess: (task) => {
      setNotice(`${task.humanId} ahora está ${taskStatusMeta[task.status].label.toLowerCase()}.`);
      setEvidenceFor(null);
      setEvidence('');
      void queryClient.invalidateQueries({ queryKey: ['changes', 'assigned-tasks'] });
    },
  });

  function run(task: ChangeTask, key: string) {
    setNotice('');
    transition.reset();
    // Completar SIN evidencia deja una tarea cerrada que nadie puede
    // auditar, así que ese caso pasa por un diálogo y no por un prompt.
    if (key === 'complete') {
      setEvidenceFor(task);
      setEvidence('');
      return;
    }
    transition.mutate({ task, key });
  }

  return (
    <div className="p-6 md:p-8">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ListChecks className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-black text-on-surface">Mis tareas de cambio</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Trabajo dirigido a ti o a tu equipo desde una RFC. Ver una tarea no concede acceso a la RFC completa.
          </p>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtro de tareas asignadas">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={filter === tab.key}
            title={tab.hint}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${
              filter === tab.key
                ? 'border-primary/50 bg-primary/15 text-primary'
                : 'border-border/40 text-on-surface-variant hover:bg-on-surface/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}
      {transition.error && (
        <div className="mt-4 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {transition.error instanceof ApiError ? transition.error.message : transition.error.message}
        </div>
      )}

      {query.isLoading ? (
        <p className="mt-8 text-sm text-on-surface-variant">Cargando tu trabajo asignado…</p>
      ) : query.isError ? (
        <p className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          No se pudo cargar tu trabajo asignado: {query.error.message}
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-border/50 p-12 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-on-surface-variant" />
          <p className="mt-4 font-bold text-on-surface">
            {filter === 'mine' ? 'No tienes tareas asignadas' : 'No hay tareas en este alcance'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">{filterTabs.find((tab) => tab.key === filter)?.hint}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <AssignedTaskCard
              key={item.task.id}
              item={item}
              canExecute={canExecute}
              busy={transition.isPending}
              onAction={run}
            />
          ))}
        </div>
      )}

      {evidenceFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              transition.mutate({ task: evidenceFor, key: 'complete', evidenceText: evidence.trim() });
            }}
            className="w-full max-w-lg rounded-3xl border border-border/50 bg-surface-container-low p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-on-surface">Completar {evidenceFor.humanId}</h2>
                <p className="mt-1 text-xs text-on-surface-variant">{evidenceFor.title}</p>
              </div>
              <button type="button" onClick={() => setEvidenceFor(null)} className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5"><X className="h-5 w-5" /></button>
            </div>
            <label className="mt-5 block text-xs font-bold text-on-surface-variant">
              Evidencia del trabajo realizado
              <textarea
                required
                autoFocus
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                placeholder="Qué se hizo, dónde quedó registrado, número de guía…"
                className="input-field mt-2 min-h-28 w-full"
              />
            </label>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-on-surface-variant">
              <Paperclip className="h-3.5 w-3.5" />
              Queda en el historial de la tarea y lo ve quien gobierna la RFC.
            </p>
            <div className="mt-6 flex justify-end gap-3 border-t border-border/40 pt-5">
              <button type="button" onClick={() => setEvidenceFor(null)} className="secondary-button">Cancelar</button>
              <button type="submit" disabled={transition.isPending} className="primary-button disabled:opacity-40">
                <CheckCircle2 className="h-4 w-4" />{transition.isPending ? 'Guardando…' : 'Completar tarea'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AssignedTaskCard({
  item,
  canExecute,
  busy,
  onAction,
}: {
  item: AssignedChangeTask;
  canExecute: boolean;
  busy: boolean;
  onAction: (task: ChangeTask, key: string) => void;
}) {
  const { task, change } = item;
  const meta = taskStatusMeta[task.status];
  // Los nombres vienen del snapshot congelado al crear la tarea, no de una
  // consulta a Organization por fila: si a alguien lo mueven de equipo, la
  // tarea sigue diciendo a qué equipo se dirigió cuando se creó.
  const department = task.organization?.departmentName || task.area || '—';
  const team = task.organization?.teamName || task.team || '—';
  const assignee = task.organization?.assigneeName || task.assigneeId;

  return (
    <article className="flex flex-col rounded-2xl border border-border/30 bg-surface-container p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold text-primary">{task.humanId}</div>
          <h2 className="mt-1 font-bold text-on-surface">{task.title}</h2>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${meta.style}`}>{meta.label}</span>
      </div>

      {task.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-on-surface-variant">{task.description}</p>}

      {/* Contexto MÍNIMO de la RFC padre: para qué cambio es y en qué punto
          va. Sin enlace al detalle, porque esta vista no presupone que quien
          ejecuta pueda leer la RFC. */}
      <div className="mt-4 rounded-xl border border-border/30 bg-surface-container-low p-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">RFC de origen</div>
        <div className="mt-1 font-mono text-[11px] font-bold text-on-surface">{change.humanId}</div>
        <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{change.title || 'Sin título'}</p>
        <span className="mt-2 inline-block rounded-md bg-on-surface/5 px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">{change.state}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div><dt className="text-on-surface-variant">Departamento</dt><dd className="font-bold text-on-surface">{department}</dd></div>
        <div><dt className="text-on-surface-variant">Equipo</dt><dd className="font-bold text-on-surface">{team}</dd></div>
        <div className="col-span-2">
          <dt className="text-on-surface-variant">Responsable</dt>
          <dd className="flex items-center gap-1.5 font-bold text-on-surface">
            <Users className="h-3.5 w-3.5 text-on-surface-variant" />
            {assignee || 'Dirigida al equipo, sin responsable individual'}
          </dd>
        </div>
      </dl>

      {task.dueAt && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-on-surface-variant">
          <Clock3 className="h-3.5 w-3.5" />Vence {new Date(task.dueAt).toLocaleString()}
        </div>
      )}
      {task.blockedReason && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-300">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />{task.blockedReason}
        </p>
      )}
      {task.evidence.length > 0 && (
        <ul className="mt-3 space-y-1">
          {task.evidence.map((entry, index) => (
            <li key={index} className="flex items-start gap-1.5 rounded-lg bg-on-surface/5 p-2 text-[11px] text-on-surface-variant">
              <Paperclip className="mt-0.5 h-3 w-3 shrink-0" />{entry}
            </li>
          ))}
        </ul>
      )}

      {canExecute && nextActions(task).length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border/30 pt-3">
          {nextActions(task).map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                disabled={busy}
                onClick={() => onAction(task, action.key)}
                className="secondary-button !px-3 !py-1.5 text-[11px] disabled:opacity-40"
              >
                <Icon className="h-3.5 w-3.5" />{action.label}
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
