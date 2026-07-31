import { CheckCircle2, ChevronDown, Eye, EyeOff, GitBranch, Merge, Pencil, RotateCcw, UserPlus } from 'lucide-react';
import type { TicketPageContext } from './context';

export function TicketActionsWidget({ context }: { context: TicketPageContext }) {
  const { ticket, currentUserName, actions, fieldsLoading } = context;
  return (
    <div className="flex flex-wrap items-center gap-2 pb-6 border-b border-border/40">
      {actions.canEditFields && (
        <button
          onClick={actions.onStartEditingFields}
          disabled={actions.isEditingFields || fieldsLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/20 transition-all disabled:opacity-40"
        >
          <Pencil className="w-3.5 h-3.5" />
          Editar datos
        </button>
      )}
      <button
        onClick={actions.onAssign}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/20 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all"
      >
        <UserPlus className="w-3.5 h-3.5" />
        {ticket.assignee === currentUserName ? 'Reassign' : 'Assign to me'}
      </button>
      <div className="relative">
        <select
          data-testid="ticket-status-select"
          value={ticket.status}
          onChange={(event) => actions.onStatusChange(event.target.value)}
          disabled={actions.updateStatusPending || !actions.canChangeStatus}
          className="appearance-none flex items-center gap-2 pl-4 pr-8 py-2 rounded-xl bg-surface-container border border-border/50 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
          style={{ colorScheme: 'dark' }}
        >
          {actions.statusOptions.map((option) => (
            <option key={option} value={option} className="bg-[#191c22] text-[#e1e2eb]">
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant" />
      </div>
      {actions.canMerge && (
        <button
          onClick={actions.onMerge}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container border border-border/50 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors"
        >
          <Merge className="w-3.5 h-3.5 text-on-surface-variant" />
          Merge
        </button>
      )}
      {actions.canManageProblem && (
        <button
          onClick={actions.onOpenProblemDialog}
          className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-300 transition-colors hover:bg-violet-500/20"
        >
          <GitBranch className="h-3.5 w-3.5" />
          Gestionar problema
        </button>
      )}
      <button
        onClick={actions.onToggleWatch}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-colors ${
          actions.isWatching
            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
            : 'bg-surface-container border-border/50 text-on-surface hover:bg-surface-container-high'
        }`}
      >
        {actions.isWatching ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <EyeOff className="w-3.5 h-3.5 text-on-surface-variant" />
        )}
        {actions.isWatching ? `Watching (${actions.watchersCount})` : 'Watch'}
      </button>
      <div className="flex-1" />
      {actions.canReopen && (
        <button
          data-testid="ticket-reopen-button"
          onClick={actions.onReopen}
          disabled={actions.updateStatusPending}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-surface-container border border-border/50 text-on-surface text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reabrir
        </button>
      )}
      <button
        onClick={actions.onResolve}
        disabled={ticket.status === 'Resolved' || actions.updateStatusPending}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500/90 text-slate-950 text-xs font-black uppercase tracking-wider shadow-[0_0_15px_rgba(52,211,153,0.3)] hover:shadow-[0_0_25px_rgba(52,211,153,0.5)] transition-all disabled:opacity-50"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {actions.updateStatusPending ? 'Resolving...' : 'Resolve'}
      </button>
      {actions.updateStatusError && (
        <p className="-mb-2 w-full text-sm text-red-400">{actions.updateStatusError}</p>
      )}
    </div>
  );
}
