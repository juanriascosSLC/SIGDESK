import { Link } from 'react-router-dom';
import { CalendarClock, MapPin, PackageSearch, Users } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui';
import { formatDateTime, formatRelativeTime } from '@/i18n/format';
import { USER_UNAVAILABLE_LABEL } from '@/features/tickets/identity-labels';
import type { ServiceWorkOrder } from './types';
import {
  PRIORITY_TONE,
  WORK_ORDER_STATUS,
  workOrderAssets,
  workOrderAttention,
  workOrderSiteId,
  workOrderStage,
} from './presentation';

export function WorkOrderCard({ item }: { item: ServiceWorkOrder }) {
  const { task, change } = item;
  const status = WORK_ORDER_STATUS[task.status];
  const attention = workOrderAttention(task);
  const assets = workOrderAssets(task);
  const department = task.organization?.departmentName || task.area || 'Services';
  const team = task.organization?.teamName || task.team || 'Team unavailable';
  const assignee = task.assigneeName || task.organization?.assigneeName || (task.assigneeUserId ? USER_UNAVAILABLE_LABEL : 'Team assignment');
  const destination = `/app/services/work-orders/${encodeURIComponent(task.changeId)}/${encodeURIComponent(task.id)}`;
  const stage = workOrderStage(task);

  return (
    <Link
      to={destination}
      data-testid={`service-work-order-${task.id}`}
      className="group flex min-h-[250px] flex-col rounded-2xl border border-services-border bg-services-surface-container-low p-4 text-services-on-surface shadow-sm transition hover:border-services-accent/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-services-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] font-black text-services-accent">{task.humanId}</span><Badge tone="neutral" size="sm">{stage}</Badge></div>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold">{task.title || 'Untitled work order'}</h3>
        </div>
        <StatusBadge label={status.label} tone={status.tone} className="shrink-0" />
      </div>

      <div className="mt-3 rounded-xl border border-services-border bg-services-surface-container px-3 py-2.5">
        <div className="text-[10px] font-black uppercase tracking-wider text-services-on-surface-variant">Source change</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-bold">{change.humanId}</span>
          <Badge tone={PRIORITY_TONE[task.priority.toLowerCase()] ?? 'neutral'} size="sm">{task.priority || 'No priority'}</Badge>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-services-on-surface-variant">{change.title || 'Untitled change'}</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-services-on-surface-variant">Destination</dt>
          <dd className="truncate font-bold">{department} · {team}</dd>
        </div>
        <div>
          <dt className="text-services-on-surface-variant">Assignee</dt>
          <dd className="flex items-center gap-1 truncate font-bold"><Users className="h-3 w-3 shrink-0" />{assignee}</dd>
        </div>
      </dl>

      <div className="mt-auto space-y-2 pt-3 text-[11px] text-services-on-surface-variant">
        {task.dueAt && (
          <div className={`flex items-center gap-1.5 ${attention === 'overdue' ? 'font-bold text-status-danger-fg' : attention === 'due-soon' ? 'font-bold text-status-warning-fg' : ''}`} title={formatDateTime(task.dueAt)}>
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            {attention === 'overdue' ? `Overdue ${formatRelativeTime(task.dueAt)}` : `Due ${formatRelativeTime(task.dueAt)}`}
          </div>
        )}
        {workOrderSiteId(task) && <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Site context attached</div>}
        {assets.length > 0 && <div className="flex items-center gap-1.5"><PackageSearch className="h-3.5 w-3.5" />{assets.length} affected {assets.length === 1 ? 'asset' : 'assets'}</div>}
      </div>
    </Link>
  );
}
