import { ChangeTasksBoard } from '@/features/changes/ChangeTasksBoard';
import { ListChecks } from 'lucide-react';
import type { TicketPageContext } from './context';

/** RFC task execution remains owned by Change Management. Catalog Builder
 * only decides where this module-owned block appears on the published page. */
export function ChangeTasksWidget({ context }: { context: TicketPageContext }) {
  if (context.entityKey !== 'RFC' || !context.ticket.entityId || !context.changeTasks) return null;
  if (context.preview) {
    return (
      <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ListChecks className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black text-on-surface">Plan de trabajo</h2>
            <p className="mt-1 text-xs text-on-surface-variant">Tareas ejecutables, responsables y dependencias de esta RFC.</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-border/40 p-5 text-sm text-on-surface-variant">
          The real view will show tasks managed by Change Management here.
        </div>
      </div>
    );
  }
  return (
    <ChangeTasksBoard
      changeId={context.ticket.entityId}
      canManage={context.changeTasks.canManage}
      availableAssets={context.assets.links}
      embedded
    />
  );
}
