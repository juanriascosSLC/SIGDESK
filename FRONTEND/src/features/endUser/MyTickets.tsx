import { Ticket as TicketIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';

/**
 * There is no backend capability yet to list "tickets I personally
 * submitted" — `TicketFilters` (features/tickets/types.ts) has no
 * `requester` filter, only `assignee`, and the list endpoint doesn't apply
 * one either (see the comment on `listTickets` in features/tickets/api.ts).
 * That's the same "My Work" gap Request B explicitly puts out of scope for
 * this round, so it isn't fixed here as a scoped exception.
 *
 * The previous version of this screen was fully fabricated regardless: two
 * hardcoded rows (INC-202611, REQ-202590 — ids that don't exist), a search
 * input with no `onChange`, a "Filter: All" button with no handler, and
 * table rows styled `cursor-pointer` with no `onClick`. None of it was
 * real. Per "no simulated data or non-functional actions", this now says
 * so honestly instead of pretending to work. The route is kept so the
 * portal sidebar/dashboard links here don't break — do not reintroduce
 * local fake rows here; wire this up once a requester-scoped endpoint
 * exists.
 */
export default function MyTickets() {
  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <PageHeader
        eyebrow={
          <div className="mb-1 flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        }
        title="My Tickets"
        description="Track the status of every request you've raised."
      />
      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <EmptyState
          icon="general"
          title="This view isn't available yet"
          description="SIG-DESK doesn't yet have a way to list only the tickets you've personally submitted. This section will become active once that capability ships — nothing here is functional in the meantime."
        />
      </div>
    </div>
  );
}
