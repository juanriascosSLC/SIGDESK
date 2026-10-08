import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  CirclePlay,
  Clock3,
  ListChecks,
  LockKeyhole,
  Paperclip,
  RotateCcw,
  Users,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { useAuth } from '@/features/auth/useAuth';
import { USER_UNAVAILABLE_LABEL } from '@/features/tickets/identity-labels';
import { PERMISSIONS } from '@/features/auth/permissions';
import { formatDateTime, formatRelativeTime } from '@/i18n/format';
import {
  listAssignedChangeTasks,
  transitionChangeTask,
  type AssignedChangeTask,
  type AssignedChangeTaskFilter,
  type ChangeTask,
} from './api';
import { isGovernedTask, taskAttention, taskStatusMeta, taskWorkTypeMeta } from './presentation';
import { TaskActionDialog } from './dialogs/TaskActionDialog';

/**
 * "My Tasks" — the surface for whoever EXECUTES the work, not whoever
 * governs the change.
 *
 * Exists because an RFC task can be directed to a department other than the
 * one that opened the RFC: someone from Warehouse gets work from a Services
 * RFC and needs to see it, start it, and close it with evidence — without
 * that granting them read access to every Services RFC. That's why it
 * consumes `/changes/tasks/assigned`, which returns the task plus the
 * MINIMUM context of its parent RFC (code, status and title), never the
 * whole RFC.
 */

const filterTabs: Array<{ key: AssignedChangeTaskFilter; label: string; hint: string }> = [
  { key: 'mine', label: 'Assigned to me', hint: 'Only the tasks you are responsible for.' },
  { key: 'team', label: 'My team', hint: "Your team's work, if your role reaches it." },
  { key: 'scope', label: 'My full scope', hint: 'Everything your role lets you see.' },
];

function nextActions(task: ChangeTask): Array<{ key: string; label: string; icon: typeof CirclePlay }> {
  switch (task.status) {
    case 'ready': return [{ key: 'start', label: 'Start', icon: CirclePlay }];
    // Governed work has typed outcomes and must be completed in the task
    // workspace. A generic completion here would hide decisions such as
    // parts_required, payment_not_required or restoration_failed.
    case 'in_progress': return task.workType === 'generic' ? [{ key: 'complete', label: 'Complete with evidence', icon: CheckCircle2 }] : [];
    case 'blocked': return [{ key: 'unblock', label: 'Unblock', icon: RotateCcw }];
    default: return [];
  }
}

export default function MyChangeTasks() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AssignedChangeTaskFilter>('mine');
  const [notice, setNotice] = useState('');
  const [evidenceFor, setEvidenceFor] = useState<ChangeTask | null>(null);
  const canExecute = can(PERMISSIONS.changeTasksExecute);

  const query = useQuery({
    queryKey: ['changes', 'assigned-tasks', filter],
    queryFn: () => listAssignedChangeTasks(filter),
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  const summary = useMemo(() => ({
    ready: items.filter(({ task }) => task.status === 'ready').length,
    active: items.filter(({ task }) => task.status === 'in_progress').length,
    blocked: items.filter(({ task }) => task.status === 'blocked').length,
    overdue: items.filter(({ task }) => taskAttention(task) === 'overdue').length,
  }), [items]);

  const transition = useMutation({
    mutationFn: ({ task, key, evidenceText }: { task: ChangeTask; key: string; evidenceText?: string }) =>
      transitionChangeTask(task.changeId, task.id, key, {
        evidence: evidenceText ? [evidenceText] : undefined,
      }),
    onSuccess: (task) => {
      setNotice(`${task.humanId} is now ${taskStatusMeta[task.status].label.toLowerCase()}.`);
      setEvidenceFor(null);
      void queryClient.invalidateQueries({ queryKey: ['changes', 'assigned-tasks'] });
    },
  });

  function run(task: ChangeTask, key: string) {
    setNotice('');
    transition.reset();
    // Completing WITHOUT evidence leaves a closed task nobody can audit,
    // so that case goes through a dialog, never a native prompt.
    if (key === 'complete') {
      setEvidenceFor(task);
      return;
    }
    transition.mutate({ task, key });
  }

  return (
    <div className="p-6 md:p-8">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ListChecks className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-black text-on-surface">My change tasks</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Your operational queue across IT, Services, Inventory and Finance. Governed decisions are recorded in each task workspace.
          </p>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Assigned task filter">
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

      {!query.isLoading && !query.isError && items.length > 0 && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Task queue summary">
          {[
            ['Ready', summary.ready, 'text-primary'],
            ['In progress', summary.active, 'text-status-info-fg'],
            ['Blocked', summary.blocked, 'text-status-warning-fg'],
            ['Overdue', summary.overdue, 'text-status-danger-fg'],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-2xl border border-border/40 bg-surface-container px-4 py-3">
              <dt className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{label}</dt>
              <dd className={`mt-1 text-2xl font-black ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {notice && <div className="mt-4 rounded-xl border border-status-success-border bg-status-success-bg p-3 text-sm text-status-success-fg">{notice}</div>}
      {transition.error && (
        <div className="mt-4 flex gap-2 rounded-xl border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-danger-icon" />
          {transition.error instanceof ApiError ? transition.error.message : transition.error.message}
        </div>
      )}

      {query.isLoading ? (
        <p className="mt-8 text-sm text-on-surface-variant">Loading your assigned work…</p>
      ) : query.isError ? (
        <p className="mt-8 rounded-xl border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger-fg">
          We couldn't load your assigned work: {query.error.message}
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-border/50 p-12 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-on-surface-variant" />
          <p className="mt-4 font-bold text-on-surface">
            {filter === 'mine' ? 'You have no assigned tasks' : 'No tasks in this scope'}
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

      <TaskActionDialog
        open={evidenceFor !== null}
        onClose={() => setEvidenceFor(null)}
        onConfirm={(evidenceText) => {
          if (evidenceFor) transition.mutate({ task: evidenceFor, key: 'complete', evidenceText });
        }}
        actionKey={evidenceFor ? 'complete' : null}
        loading={transition.isPending}
        error={evidenceFor ? transition.error?.message : undefined}
      />
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
  const work = taskWorkTypeMeta[task.workType];
  const attention = taskAttention(task);
  // The names come from the snapshot frozen when the task was created, not
  // a per-row Organization lookup: if someone changes teams, the task still
  // says which team it was directed to when it was created.
  const department = task.organization?.departmentName || task.area || '—';
  const team = task.organization?.teamName || task.team || '—';
  // Never the raw id as a fallback: an id with no resolved name reads as
  // "User unavailable", distinct from genuinely having no individual
  // assignee (team-only), which the render below phrases separately.
  const assignee = task.assigneeName || task.organization?.assigneeName || (task.assigneeUserId ? USER_UNAVAILABLE_LABEL : '');

  return (
    <article className="flex flex-col rounded-2xl border border-border/30 bg-surface-container p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-bold text-primary">{task.humanId}</div>
          <h2 className="mt-1 font-bold text-on-surface">{task.title}</h2>
          <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{work.label} · {work.stage}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${meta.style}`}>{meta.label}</span>
      </div>

      {task.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-on-surface-variant">{task.description}</p>}

      {/* MINIMUM context of the parent RFC: which change it's for and where
          it stands. No link to the detail page, because this view doesn't
          assume whoever executes it can read the RFC. */}
      <div className="mt-4 rounded-xl border border-border/30 bg-surface-container-low p-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Source RFC</div>
        <div className="mt-1 font-mono text-[11px] font-bold text-on-surface">{change.humanId}</div>
        <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{change.title || 'Untitled'}</p>
        <span className="mt-2 inline-block rounded-md bg-on-surface/5 px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">{change.state}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div><dt className="text-on-surface-variant">Department</dt><dd className="font-bold text-on-surface">{department}</dd></div>
        <div><dt className="text-on-surface-variant">Team</dt><dd className="font-bold text-on-surface">{team}</dd></div>
        <div className="col-span-2">
          <dt className="text-on-surface-variant">Assignee</dt>
          <dd className="flex items-center gap-1.5 font-bold text-on-surface">
            <Users className="h-3.5 w-3.5 text-on-surface-variant" />
            {assignee || 'Directed to the team, no individual assignee'}
          </dd>
        </div>
      </dl>

      {task.dueAt && (
        <div className={`mt-3 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11px] ${attention === 'overdue' ? 'bg-status-danger-bg text-status-danger-fg' : attention === 'due-soon' ? 'bg-status-warning-bg text-status-warning-fg' : 'text-on-surface-variant'}`}>
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><strong>{attention === 'overdue' ? `Overdue ${formatRelativeTime(task.dueAt)}` : `Due ${formatRelativeTime(task.dueAt)}`}</strong><br />{formatDateTime(task.dueAt, 'en-US')}</span>
        </div>
      )}
      {task.scheduledStart && task.scheduledEnd && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-on-surface-variant">
          <CalendarCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Scheduled {formatDateTime(task.scheduledStart, 'en-US')} – {formatDateTime(task.scheduledEnd, 'en-US')}</span>
        </div>
      )}
      {task.dependencyIds.length > 0 && task.status === 'pending' && (
        <p className="mt-3 text-[11px] text-on-surface-variant">Waiting for {task.dependencyIds.length} prerequisite {task.dependencyIds.length === 1 ? 'task' : 'tasks'}.</p>
      )}
      {task.blockedReason && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-status-warning-border bg-status-warning-bg p-2 text-[11px] text-status-warning-fg">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning-icon" />{task.blockedReason}
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

      {task.outcomeCode && (
        <p className="mt-3 rounded-lg border border-status-success-border bg-status-success-bg p-2 text-[11px] font-bold text-status-success-fg">
          Recorded outcome: {task.outcomeCode.replaceAll('_', ' ')}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border/30 pt-3">
        <Link
          to={`/app/tasks/${encodeURIComponent(task.changeId)}/${encodeURIComponent(task.id)}`}
          className="secondary-button !px-3 !py-1.5 text-[11px]"
          aria-label={`Open ${task.humanId} task workspace`}
        >
          {isGovernedTask(task) && task.status === 'in_progress' ? 'Record governed outcome' : 'Open task'}<ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {canExecute && nextActions(task).map((action) => {
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
    </article>
  );
}
