import { CheckCircle2, ChevronDown, Eye, EyeOff, GitBranch, GitPullRequest, Merge, Pencil, RotateCcw, UserPlus } from 'lucide-react';
import type { TicketPageContext } from './context';
import { Button } from '@/components/ui';

export function TicketActionsWidget({ context }: { context: TicketPageContext }) {
  const { ticket, currentUserId, actions, fieldsLoading } = context;
  return (
    <div className="flex flex-wrap items-center gap-2 pb-6 border-b border-border/40">
      {actions.canEditFields && (
        <Button
          variant="secondary"
          size="sm"
          onClick={actions.onStartEditingFields}
          disabled={actions.isEditingFields || fieldsLoading}
          leadingIcon={<Pencil className="w-3.5 h-3.5" />}
          className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
        >
          Edit fields
        </Button>
      )}
      {actions.canAssign && (
        <Button
          variant="secondary"
          size="sm"
          onClick={actions.onAssign}
          leadingIcon={<UserPlus className="w-3.5 h-3.5" />}
          className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
        >
          {/* Compares by ID, never by display name — two people can share a
              displayed name, and a name is never a reliable identity key. */}
          {ticket.assigneeId && ticket.assigneeId === currentUserId ? 'Reassign' : 'Assign'}
        </Button>
      )}
      <div className="relative">
        <select
          data-testid="ticket-status-select"
          value={ticket.status}
          onChange={(event) => actions.onStatusChange(event.target.value)}
          disabled={actions.updateStatusPending || !actions.canChangeStatus}
          className="appearance-none flex items-center gap-2 pl-4 pr-8 py-2 rounded-xl bg-surface-container border border-border/50 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
        >
          {actions.statusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant" />
      </div>
      {actions.canMerge && (
        <Button variant="secondary" size="sm" onClick={actions.onMerge} leadingIcon={<Merge className="w-3.5 h-3.5 text-on-surface-variant" />}>
          Merge
        </Button>
      )}
      {actions.canManageProblem && (
        <Button
          variant="secondary"
          size="sm"
          onClick={actions.onOpenProblemDialog}
          leadingIcon={<GitBranch className="h-3.5 w-3.5" />}
          className="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20"
        >
          Manage problem
        </Button>
      )}
      {actions.canCreateChange && (
        <Button
          variant="secondary"
          size="sm"
          onClick={actions.onOpenChangeDialog}
          leadingIcon={<GitPullRequest className="h-3.5 w-3.5" />}
          className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20"
        >
          Create RFC
        </Button>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={actions.onToggleWatch}
        leadingIcon={
          actions.isWatching ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-on-surface-variant" />
        }
        className={actions.isWatching ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20' : undefined}
      >
        {actions.isWatching ? `Watching (${actions.watchersCount})` : 'Watch'}
      </Button>
      <div className="flex-1" />
      {actions.canReopen && (
        <Button
          variant="secondary"
          data-testid="ticket-reopen-button"
          onClick={actions.onReopen}
          disabled={actions.updateStatusPending}
          leadingIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Reopen
        </Button>
      )}
      <Button
        onClick={actions.onResolve}
        disabled={!actions.canResolve || actions.updateStatusPending}
        loading={actions.updateStatusPending}
        leadingIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
        className="bg-emerald-500/90 text-slate-950 hover:bg-emerald-500"
      >
        Resolve
      </Button>
      {actions.updateStatusError && (
        <p role="alert" className="-mb-2 w-full text-sm font-medium text-destructive">
          {actions.updateStatusError}
        </p>
      )}
    </div>
  );
}
