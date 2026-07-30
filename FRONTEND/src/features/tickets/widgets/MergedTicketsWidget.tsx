import { Merge } from 'lucide-react';
import type { TicketPageContext } from './context';

export function MergedTicketsWidget({ context }: { context: TicketPageContext }) {
  const { ticket, mergedTickets, onNavigate } = context;
  if (!ticket.mergedCount) return null;

  return (
    <div className="bg-surface-container-low border border-primary/20 rounded-3xl p-5">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/40">
        <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <Merge className="w-3.5 h-3.5 text-primary" />
          Tickets combinados en {ticket.id}
        </h4>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black text-primary">
          {ticket.mergedCount}
        </span>
      </div>
      {mergedTickets.loading ? (
        <p className="text-sm text-on-surface-variant p-3">Loading…</p>
      ) : (
        <div className="space-y-1">
          {mergedTickets.items.map((merged) => (
            <div
              key={merged.id}
              className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-container transition-colors group"
            >
              <button
                onClick={() => onNavigate(`/app/tickets/${merged.id}`)}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <span className="font-mono text-xs text-primary shrink-0">{merged.id}</span>
                <span className="text-sm text-on-surface truncate flex-1">{merged.title}</span>
                <span className="text-xs text-on-surface-variant shrink-0">{merged.requester}</span>
              </button>
              {mergedTickets.canUnmerge && (
                <button
                  onClick={() => mergedTickets.onUnmerge(merged.id)}
                  className="px-3 py-1 rounded-lg border border-border/50 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider opacity-0 group-hover:opacity-100 hover:text-red-400 hover:border-red-500/30 transition-all shrink-0"
                >
                  Separar
                </button>
              )}
            </div>
          ))}
          {mergedTickets.items.length === 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-300">
              El contador indica tickets combinados, pero la relación no devolvió registros.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
