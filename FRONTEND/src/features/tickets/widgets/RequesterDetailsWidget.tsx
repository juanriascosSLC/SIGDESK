import { UserRound } from 'lucide-react';
import type { TicketPageContext } from './context';
import { REQUESTER_LABEL } from '../identity-labels';

// Only the requester's name is real data available today — no contact
// fields (email/phone/department) exist in the model, so none are invented.
// `requesterDisplayName` is already resolved with a safe fallback ("Usuario
// no disponible") — never the raw `requesterId`.
export function RequesterDetailsWidget({ context }: { context: TicketPageContext }) {
  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <UserRound className="h-4 w-4 text-primary" />
        {REQUESTER_LABEL}
      </h3>
      <p className="text-sm font-medium text-on-surface">{context.ticket.requesterDisplayName}</p>
    </div>
  );
}
