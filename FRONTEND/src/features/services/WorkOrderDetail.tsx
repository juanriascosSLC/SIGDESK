import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CirclePlay,
  FileCheck2,
  GitPullRequest,
  LockKeyhole,
  MapPin,
  PackageSearch,
  RotateCcw,
  Users,
} from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/ui';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { USER_UNAVAILABLE_LABEL } from '@/features/tickets/identity-labels';
import { formatDateTime, formatRelativeTime } from '@/i18n/format';
import { TaskActionDialog } from '@/features/changes/dialogs/TaskActionDialog';
import type { ChangeTask } from '@/features/changes/api';
import { listServiceWorkOrders, transitionServiceWorkOrder } from './api';
import {
  actionsForWorkOrder,
  PRIORITY_TONE,
  WORK_ORDER_STATUS,
  workOrderAssets,
  workOrderAttention,
  workOrderGovernanceBlock,
  workOrderSiteId,
  workOrderStage,
} from './presentation';
import type { WorkOrderAction } from './types';

export default function WorkOrderDetail() {
  const { changeId, taskId } = useParams<{ changeId: string; taskId: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [dialogAction, setDialogAction] = useState<'complete' | 'block' | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['services', 'work-orders', 'scope'],
    queryFn: () => listServiceWorkOrders('scope'),
  });
  const item = useMemo(
    () => query.data?.find(({ task }) => task.id === taskId && task.changeId === changeId),
    [changeId, query.data, taskId],
  );

  const transition = useMutation({
    mutationFn: ({ task, action, value }: { task: ChangeTask; action: WorkOrderAction; value?: string }) =>
      transitionServiceWorkOrder(task.changeId, task.id, action.key, {
        reason: action.requiresInput === 'reason' ? value : undefined,
        evidence: action.requiresInput === 'evidence' && value ? [value] : undefined,
      }),
    onSuccess: (task) => {
      setDialogAction(null);
      setNotice(`${task.humanId} is now ${WORK_ORDER_STATUS[task.status].label.toLowerCase()}.`);
      void queryClient.invalidateQueries({ queryKey: ['services', 'work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['changes', 'assigned-tasks'] });
    },
  });

  if (query.isLoading) return <Shell><LoadingState label="Loading work order…" /></Shell>;
  if (query.isError) return <Shell><ErrorState error={query.error} onRetry={() => void query.refetch()} /></Shell>;
  if (!item) {
    return (
      <Shell>
        <EmptyState
          icon="search"
          title="Work order not available"
          description="It may not belong to Services, may be outside your organizational scope, or may no longer exist."
          action={<Link to="/app/services" className="secondary-button">Back to Services</Link>}
        />
      </Shell>
    );
  }

  const { task, change } = item;
  const status = WORK_ORDER_STATUS[task.status];
  const attention = workOrderAttention(task);
  const assets = workOrderAssets(task);
  const siteId = workOrderSiteId(task);
  const governanceBlock = workOrderGovernanceBlock(task, change.state);
  const actions = can(PERMISSIONS.changeTasksExecute) ? actionsForWorkOrder(task.status, Boolean(governanceBlock)) : [];
  const department = task.organization?.departmentName || task.area || 'Services';
  const team = task.organization?.teamName || task.team || 'Team unavailable';
  const assignee = task.assigneeName || task.organization?.assigneeName || (task.assigneeUserId ? USER_UNAVAILABLE_LABEL : 'Team assignment');
  const stage = workOrderStage(task);

  function runAction(action: WorkOrderAction) {
    setNotice('');
    transition.reset();
    if (action.key === 'complete' || action.key === 'block') {
      setDialogAction(action.key);
      return;
    }
    transition.mutate({ task, action });
  }

  return (
    <Shell>
      <PageHeader
        eyebrow={<Link to="/app/services" className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-services-accent hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to Services</Link>}
        title={task.title || 'Untitled work order'}
        description={`${task.humanId} · Operational task from ${change.humanId}`}
        actions={<div className="flex flex-wrap gap-2"><Badge tone="neutral">{stage}</Badge><Badge tone={PRIORITY_TONE[task.priority.toLowerCase()] ?? 'neutral'}>{task.priority || 'No priority'}</Badge><StatusBadge label={status.label} tone={status.tone} /></div>}
      />

      {notice && <div role="status" className="rounded-xl border border-status-success-border bg-status-success-bg p-3 text-sm text-status-success-fg">{notice}</div>}
      {transition.isError && <div role="alert" className="flex gap-2 rounded-xl border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger-fg"><AlertTriangle className="h-4 w-4 shrink-0" />{transition.error.message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Work instructions</CardTitle><CardDescription>The RFC task is the authoritative execution record.</CardDescription></div></CardHeader>
            <p className="whitespace-pre-wrap text-sm leading-6 text-services-on-surface-variant">{task.description || 'No instructions were recorded for this work order.'}</p>
            {task.blockedReason && <div className="mt-4 flex items-start gap-2 rounded-xl border border-status-warning-border bg-status-warning-bg p-3 text-sm text-status-warning-fg"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Current blocker</strong><p className="mt-1">{task.blockedReason}</p></div></div>}
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Affected equipment</CardTitle><CardDescription>Immutable asset context captured when the RFC task was created.</CardDescription></div>{siteId && can(PERMISSIONS.assetsView) && <Link to={`/app/services/sites/${encodeURIComponent(siteId)}`} className="secondary-button px-3 py-1.5 text-xs"><MapPin className="h-3.5 w-3.5" />Open site</Link>}</CardHeader>
            {assets.length === 0 ? <EmptyState compact icon="inbox" title="No affected equipment" description="This task was created without an asset snapshot." /> : (
              <div className="grid gap-3 sm:grid-cols-2">
                {assets.map((asset) => <div key={`${asset.id}-${asset.role ?? ''}`} className="rounded-xl border border-services-border bg-services-surface-container p-3"><div className="flex items-start gap-2"><PackageSearch className="mt-0.5 h-4 w-4 shrink-0 text-services-accent" /><div className="min-w-0"><div className="truncate text-sm font-bold">{asset.name}</div><div className="mt-1 text-xs text-services-on-surface-variant">{asset.type}{asset.serial ? ` · S/N ${asset.serial}` : ''}</div>{asset.role && <Badge tone="neutral" size="sm" className="mt-2">{asset.role}</Badge>}</div></div></div>)}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Completion evidence</CardTitle><CardDescription>Evidence stays on the task for audit and handoff.</CardDescription></div></CardHeader>
            {task.evidence.length === 0 ? <EmptyState compact icon="inbox" title="No evidence recorded yet" description="Completing this work order requires evidence." /> : (
              <ul className="space-y-2">{task.evidence.map((entry, index) => <li key={index} className="flex items-start gap-2 rounded-xl border border-services-border bg-services-surface-container p-3 text-sm"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-services-accent" /><span>{entry}</span></li>)}</ul>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Next action</CardTitle></CardHeader>
            {governanceBlock && <div role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-status-warning-border bg-status-warning-bg p-3 text-sm text-status-warning-fg"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><span>{governanceBlock}</span></div>}
            {task.status === 'ready' && !task.assigneeUserId && actions.some((action) => action.key === 'start') && <div role="note" className="mb-3 rounded-xl border border-services-border bg-services-surface-container p-3 text-sm text-services-on-surface-variant">Starting this work order assigns it to you and records that ownership on the RFC task.</div>}
            {actions.length === 0 ? <p className="text-sm text-services-on-surface-variant">{can(PERMISSIONS.changeTasksExecute) ? 'No execution action is available in the current state.' : 'You have read access, but not permission to execute this work order.'}</p> : (
              <div className="space-y-2">{actions.map((action) => <Button key={action.key} className="w-full" variant={action.key === 'block' ? 'secondary' : 'primary'} loading={transition.isPending} onClick={() => runAction(action)} leadingIcon={action.key === 'start' ? <CirclePlay className="h-4 w-4" /> : action.key === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : action.key === 'block' ? <LockKeyhole className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}>{action.label}</Button>)}</div>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Assignment</CardTitle></CardHeader>
            <dl className="space-y-3 text-sm"><Meta label="Department" value={department} /><Meta label="Team" value={team} /><Meta label="Assignee" value={assignee} icon={<Users className="h-4 w-4" />} /></dl>
          </Card>

          <Card>
            <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
            {task.dueAt ? <div className={`flex items-start gap-2 text-sm ${attention === 'overdue' ? 'text-status-danger-fg' : attention === 'due-soon' ? 'text-status-warning-fg' : ''}`}><CalendarClock className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-bold">{attention === 'overdue' ? `Overdue ${formatRelativeTime(task.dueAt)}` : `Due ${formatRelativeTime(task.dueAt)}`}</div><div className="mt-1 text-xs opacity-80">{formatDateTime(task.dueAt)}</div></div></div> : <p className="text-sm text-services-on-surface-variant">No due date was defined.</p>}
            {task.dependencyIds.length > 0 && <div className="mt-4 border-t border-services-border pt-3 text-xs text-services-on-surface-variant">{task.dependencyIds.length} prerequisite {task.dependencyIds.length === 1 ? 'task' : 'tasks'} must be completed first.</div>}
          </Card>

          <Card>
            <CardHeader><CardTitle>Source RFC</CardTitle></CardHeader>
            <div className="font-mono text-sm font-bold">{change.humanId}</div><p className="mt-1 text-sm text-services-on-surface-variant">{change.title || 'Untitled change'}</p><Badge tone="neutral" size="sm" className="mt-3">{change.state}</Badge>
            {can(PERMISSIONS.changesView) && <Link to={`/app/changes/${encodeURIComponent(change.humanId)}`} className="secondary-button mt-4 w-full"><GitPullRequest className="h-4 w-4" />Open RFC</Link>}
          </Card>
        </aside>
      </div>

      <TaskActionDialog
        open={dialogAction !== null}
        onClose={() => setDialogAction(null)}
        actionKey={dialogAction}
        loading={transition.isPending}
        error={transition.error?.message}
        onConfirm={(value) => {
          const action = actions.find((candidate) => candidate.key === dialogAction);
          if (action) transition.mutate({ task, action, value });
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <DepartmentScope department="services" className="min-h-full space-y-6 bg-services-background p-4 text-services-on-surface sm:p-6 lg:p-8">{children}</DepartmentScope>;
}

function Meta({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div><dt className="text-xs text-services-on-surface-variant">{label}</dt><dd className="mt-1 flex items-center gap-1.5 font-bold">{icon}{value}</dd></div>;
}
