import { AlertTriangle } from 'lucide-react';
import type { TicketPageContext } from './context';

export function TicketHeaderWidget({ context }: { context: TicketPageContext }) {
  const { ticket } = context;
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="px-3 py-1 rounded-full bg-surface-container border border-border/50 text-xs font-mono text-on-surface-variant">
          {ticket.id}
        </span>
        <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary tracking-wide uppercase">
          {ticket.status}
        </span>
        {ticket.priority === 'Critical' && (
          <span className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 tracking-wide uppercase flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            SLA Risk
          </span>
        )}
      </div>
      <h1 className="text-3xl font-black text-on-surface">{ticket.title}</h1>
    </div>
  );
}
