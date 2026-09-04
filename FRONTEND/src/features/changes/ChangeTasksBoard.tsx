import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CirclePlay,
  Clock3,
  ListChecks,
  LockKeyhole,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { USER_UNAVAILABLE_LABEL } from '@/features/tickets/identity-labels';
import {
  createChangeTask,
  getChangeAssignmentDirectory,
  listChangeTasks,
  transitionChangeTask,
  type ChangeTask,
  type SaveChangeTaskInput,
} from './api';
import { taskStatusMeta as statusMeta } from './presentation';
import { TaskActionDialog } from './dialogs/TaskActionDialog';
import { useToast } from '@/components/ui';

const emptyForm: SaveChangeTaskInput = {
  title: '', description: '', area: '', team: '', assigneeId: '', priority: 'medium',
  departmentId: '', teamId: '', assigneeUserId: '',
  required: true, dependencyIds: [], dueAt: '', assetIds: [],
};

function nextAction(task: ChangeTask): { key: string; label: string; icon: typeof CirclePlay }[] {
  switch (task.status) {
    case 'pending': return [{ key: 'mark_ready', label: 'Mark ready', icon: LockKeyhole }];
    case 'ready': return [{ key: 'start', label: 'Start', icon: CirclePlay }, { key: 'cancel', label: 'Cancel', icon: Ban }];
    case 'in_progress': return [{ key: 'complete', label: 'Complete', icon: CheckCircle2 }, { key: 'block', label: 'Block', icon: LockKeyhole }];
    case 'blocked': return [{ key: 'unblock', label: 'Unblock', icon: RotateCcw }, { key: 'cancel', label: 'Cancel', icon: Ban }];
    case 'completed':
    case 'canceled': return [{ key: 'reopen', label: 'Reopen', icon: RotateCcw }];
  }
}

/** These are the only three task transitions that need a value collected
 *  from a person before they can proceed — everything else (start, mark
 *  ready, unblock, reopen) applies immediately. */
function needsDialog(key: string): key is 'complete' | 'block' | 'cancel' {
  return key === 'complete' || key === 'block' || key === 'cancel';
}

export function ChangeTasksBoard({
  changeId,
  canManage,
  embedded = false,
  availableAssets = [],
}: {
  changeId: string;
  canManage: boolean;
  embedded?: boolean;
  availableAssets?: Array<{ assetId: string; role?: string; snapshot: Record<string, unknown> }>;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SaveChangeTaskInput>(emptyForm);
  const [notice, setNotice] = useState('');
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState<{ task: ChangeTask; key: 'complete' | 'block' | 'cancel' } | null>(null);

  const tasksQuery = useQuery({
    queryKey: ['changes', changeId, 'tasks'],
    queryFn: () => listChangeTasks(changeId),
  });
  const directoryQuery = useQuery({
    queryKey: ['changes', 'assignment-directory'],
    queryFn: getChangeAssignmentDirectory,
    enabled: canManage,
    staleTime: 60_000,
  });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const directory = directoryQuery.data;
  const availableTeams = useMemo(
    () => (directory?.teams ?? []).filter((team) => team.departmentId === form.departmentId),
    [directory?.teams, form.departmentId],
  );
  const availableAssignees = useMemo(
    () => (directory?.assignees ?? []).filter((assignee) => assignee.teamId === form.teamId),
    [directory?.assignees, form.teamId],
  );
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const required = tasks.filter((task) => task.required);
  const requiredComplete = required.filter((task) => task.status === 'completed').length;
  const progress = required.length === 0 ? 100 : Math.round((requiredComplete / required.length) * 100);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['changes', changeId, 'tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['changes', changeId] });
  };
  const createMutation = useMutation({
    mutationFn: () => createChangeTask(changeId, {
      ...form,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : '',
    }),
    onSuccess: () => {
      setForm(emptyForm);
      setCreating(false);
      setNotice('Task created and linked to the RFC.');
      refresh();
    },
  });
  const transitionMutation = useMutation({
    mutationFn: ({ task, key, value }: { task: ChangeTask; key: string; value?: string }) => {
      const reason = key === 'block' || key === 'cancel' ? value : undefined;
      const evidence = key === 'complete' && value ? [value] : undefined;
      return transitionChangeTask(changeId, task.id, key, { reason, evidence });
    },
    onSuccess: (task) => {
      setNotice(`${task.humanId} is now ${statusMeta[task.status].label.toLowerCase()}.`);
      setPendingAction(null);
      refresh();
    },
    onError: (err) => {
      toast.show({ tone: 'error', title: "Couldn't update the task", description: err.message });
    },
  });
  const mutationError = createMutation.error ?? (pendingAction ? undefined : transitionMutation.error);

  function handleTaskAction(task: ChangeTask, key: string) {
    if (needsDialog(key)) {
      setPendingAction({ task, key });
      return;
    }
    transitionMutation.mutate({ task, key });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    createMutation.reset();
    setNotice('');
    createMutation.mutate();
  }

  function selectDepartment(departmentId: string) {
    const teams = (directory?.teams ?? []).filter((team) => team.departmentId === departmentId);
    const teamId = teams.length === 1 ? teams[0].id : '';
    setForm({ ...form, departmentId, teamId, assigneeUserId: '', area: '', team: '', assigneeId: '' });
  }

  return (
    <section className={`${embedded ? '' : 'mb-6'} rounded-3xl border border-border/40 bg-surface-container-low p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ListChecks className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black text-on-surface">Work plan</h2>
            <p className="mt-1 text-xs text-on-surface-variant">Executable tasks, owners and dependencies for this RFC.</p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setCreating(true)} className="primary-button"><Plus className="h-4 w-4" />New task</button>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-border/30 bg-surface-container p-4">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-on-surface">Required task progress</span>
          <span className="text-primary">{requiredComplete}/{required.length} · {progress}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        {required.length > requiredComplete && (
          <p className="mt-2 text-[11px] text-amber-300">The RFC can't be completed or closed until required tasks are finished.</p>
        )}
      </div>

      {notice && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}
      {mutationError && (
        <div className="mt-4 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {mutationError instanceof ApiError ? mutationError.message : mutationError.message}
        </div>
      )}

      {tasksQuery.isLoading ? (
        <p className="mt-6 text-sm text-on-surface-variant">Loading tasks…</p>
      ) : tasksQuery.isError ? (
        <p className="mt-6 text-sm text-red-300">{tasksQuery.error.message}</p>
      ) : tasks.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border/50 p-8 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-on-surface-variant" />
          <p className="mt-3 font-bold text-on-surface">This RFC has no tasks yet</p>
          <p className="mt-1 text-xs text-on-surface-variant">Break the change into actions assignable to different areas.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <article key={task.id} className="rounded-2xl border border-border/30 bg-surface-container p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[11px] font-bold text-primary">{task.humanId}</div>
                  <h3 className="mt-1 font-bold text-on-surface">{task.title}</h3>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusMeta[task.status].style}`}>{statusMeta[task.status].label}</span>
              </div>
              {task.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-on-surface-variant">{task.description}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div><dt className="text-on-surface-variant">Area</dt><dd className="font-bold text-on-surface">{task.organization?.departmentName || task.area}</dd></div>
                <div><dt className="text-on-surface-variant">Team</dt><dd className="font-bold text-on-surface">{task.organization?.teamName || task.team || 'Not set'}</dd></div>
                {/* Never the raw id: an id with no resolved name reads as
                    "User unavailable", distinct from genuinely no individual
                    assignee ("Unassigned"). */}
                <div><dt className="text-on-surface-variant">Assignee</dt><dd className="font-bold text-on-surface">{task.organization?.assigneeName || (task.assigneeId ? USER_UNAVAILABLE_LABEL : 'Unassigned')}</dd></div>
                <div><dt className="text-on-surface-variant">Priority</dt><dd className="font-bold capitalize text-on-surface">{task.priority}</dd></div>
              </dl>
              {task.dependencyIds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-on-surface-variant">
                  Depends on {task.dependencyIds.map((dependencyId) => (
                    <span key={dependencyId} className="rounded-md bg-on-surface/5 px-2 py-1 font-mono">{taskById.get(dependencyId)?.humanId ?? dependencyId}</span>
                  ))}
                </div>
              )}
              {(task.assetContext?.links.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {task.assetContext!.links.map((link) => (
                    <span key={link.assetId} className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                      {String(link.snapshot.name ?? link.snapshot.displayName ?? link.assetId)}
                    </span>
                  ))}
                </div>
              )}
              {task.blockedReason && <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-300">{task.blockedReason}</p>}
              {task.dueAt && <div className="mt-3 flex items-center gap-1.5 text-[11px] text-on-surface-variant"><Clock3 className="h-3.5 w-3.5" />Due {new Date(task.dueAt).toLocaleString()}</div>}
              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border/30 pt-3">
                  {nextAction(task).map((action) => {
                    const Icon = action.icon;
                    return <button key={action.key} disabled={transitionMutation.isPending} onClick={() => handleTaskAction(task, action.key)} className="secondary-button !px-3 !py-1.5 text-[11px] disabled:opacity-40"><Icon className="h-3.5 w-3.5" />{action.label}</button>;
                  })}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border/50 bg-surface-container-low p-6 shadow-2xl">
            <div className="flex items-center justify-between"><div><h3 className="text-xl font-black text-on-surface">New RFC task</h3><p className="mt-1 text-xs text-on-surface-variant">Can belong to a different area than the other tasks.</p></div><button type="button" onClick={() => setCreating(false)} className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5"><X className="h-5 w-5" /></button></div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2 text-xs font-bold text-on-surface-variant">Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="input-field mt-2 w-full" /></label>
              <label className="md:col-span-2 text-xs font-bold text-on-surface-variant">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input-field mt-2 min-h-24 w-full" /></label>
              <label className="text-xs font-bold text-on-surface-variant">Area<select required value={form.departmentId} onChange={(event) => selectDepartment(event.target.value)} className="input-field mt-2 w-full"><option value="">Select an area</option>{(directory?.departments ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label className="text-xs font-bold text-on-surface-variant">Team<select required value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value, assigneeUserId: '' })} disabled={!form.departmentId} className="input-field mt-2 w-full disabled:opacity-50"><option value="">Select a team</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="text-xs font-bold text-on-surface-variant">Assignee<select value={form.assigneeUserId} onChange={(event) => setForm({ ...form, assigneeUserId: event.target.value })} disabled={!form.teamId} className="input-field mt-2 w-full disabled:opacity-50"><option value="">No individual assignee</option>{availableAssignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.email}</option>)}</select></label>
              <label className="text-xs font-bold text-on-surface-variant">Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="input-field mt-2 w-full"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
              <label className="text-xs font-bold text-on-surface-variant">Due date<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className="input-field mt-2 w-full" /></label>
              <label className="mt-7 flex items-center gap-2 text-sm font-bold text-on-surface"><input type="checkbox" checked={form.required} onChange={(event) => setForm({ ...form, required: event.target.checked })} />Required to close the RFC</label>
            </div>
            {tasks.length > 0 && <fieldset className="mt-5"><legend className="text-xs font-bold text-on-surface-variant">Prior dependencies</legend><div className="mt-2 grid gap-2 md:grid-cols-2">{tasks.filter((task) => !['canceled'].includes(task.status)).map((task) => <label key={task.id} className="flex items-center gap-2 rounded-xl border border-border/30 p-3 text-xs text-on-surface"><input type="checkbox" checked={form.dependencyIds.includes(task.id)} onChange={(event) => setForm({ ...form, dependencyIds: event.target.checked ? [...form.dependencyIds, task.id] : form.dependencyIds.filter((id) => id !== task.id) })} />{task.humanId} · {task.title}</label>)}</div></fieldset>}
            {/* El formulario NO puede enviarse sin departamento y equipo
                reales (el backend los exige y los valida contra
                Organization), asi que su estado de carga, vacio y error se
                dicen explicitamente en vez de dejar tres selectores mudos. */}
            {directoryQuery.isLoading && <p className="mt-4 rounded-xl border border-border/40 bg-surface-container p-3 text-xs text-on-surface-variant">Loading areas, teams and assignees from Organization…</p>}
            {directoryQuery.isError && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">We couldn't load the area/team/assignee structure: {directoryQuery.error.message}. The task can't be created without it.</p>}
            {directory && directory.departments.length === 0 && <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">Organization has no departments set up yet. An administrator must create them before tasks can be directed.</p>}
            {directory && form.departmentId !== '' && availableTeams.length === 0 && <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">This department has no assignable teams.</p>}
            {directory && form.teamId !== '' && availableAssignees.length === 0 && <p className="mt-4 rounded-xl border border-border/40 bg-surface-container p-3 text-xs text-on-surface-variant">This team has no active users who can execute tasks. The task will be directed to the team, with no individual assignee.</p>}
            {/* Sin responsable individual la tarea se notifica a TODO el
                equipo. Es deliberado —una tarea puede dirigirse a un equipo
                antes de tener dueno— pero conviene decirlo antes de crearla:
                quien elige "sin responsable" por comodidad esta eligiendo
                avisar a varias personas. */}
            {form.teamId !== '' && form.assigneeUserId === '' && availableAssignees.length > 0 && (
              <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                Without an individual assignee, the task will notify everyone on the team. Choose a person if you want to direct it to someone specific.
              </p>
            )}
            {availableAssets.length > 0 && <fieldset className="mt-5"><legend className="text-xs font-bold text-on-surface-variant">Assets involved in this task</legend><div className="mt-2 grid gap-2 md:grid-cols-2">{availableAssets.map((asset) => <label key={asset.assetId} className="flex items-center gap-2 rounded-xl border border-border/30 p-3 text-xs text-on-surface"><input type="checkbox" checked={form.assetIds.includes(asset.assetId)} onChange={(event) => setForm({ ...form, assetIds: event.target.checked ? [...form.assetIds, asset.assetId] : form.assetIds.filter((id) => id !== asset.assetId) })} />{String(asset.snapshot.name ?? asset.snapshot.displayName ?? asset.assetId)}</label>)}</div></fieldset>}
            <div className="mt-6 flex justify-end gap-3 border-t border-border/40 pt-5"><button type="button" onClick={() => setCreating(false)} className="secondary-button">Cancel</button><button type="submit" disabled={createMutation.isPending} className="primary-button disabled:opacity-40"><Plus className="h-4 w-4" />{createMutation.isPending ? 'Creating…' : 'Create task'}</button></div>
          </form>
        </div>
      )}

      <TaskActionDialog
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={(value) => {
          if (pendingAction) transitionMutation.mutate({ task: pendingAction.task, key: pendingAction.key, value });
        }}
        actionKey={pendingAction?.key ?? null}
        loading={transitionMutation.isPending}
        error={pendingAction ? transitionMutation.error?.message : undefined}
      />
    </section>
  );
}
