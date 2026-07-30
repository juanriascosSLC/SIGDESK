import { History } from 'lucide-react';
import type { TicketPageContext } from './context';

// A filtered view of the same activity stream ActivityWidget already has —
// independent of ActivityWidget's own tab selector, since these are two
// separate placements that may or may not both be on the page.
export function StatusHistoryWidget({ context }: { context: TicketPageContext }) {
  const entries = context.activity.entries.filter((entry) => entry.kind === 'status_changed');
  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
      <h3 className="mb-4 flex items-center gap-2 border-b border-border/40 pb-3 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <History className="h-4 w-4 text-cyan-400" />
        Historial de estado
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm italic text-on-surface-variant">Sin cambios de estado todavía.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const from = typeof entry.payload.from === 'string' ? entry.payload.from : '?';
            const to = typeof entry.payload.to === 'string' ? entry.payload.to : '?';
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl border border-border/30 p-3 text-sm"
              >
                <span className="text-on-surface-variant">
                  {from} → <span className="font-bold text-on-surface">{to}</span>
                </span>
                <time className="font-mono text-[10px] text-on-surface-variant">
                  {new Date(entry.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
