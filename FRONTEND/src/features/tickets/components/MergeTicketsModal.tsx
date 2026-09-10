import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTickets, useMergeTickets } from '../hooks';
import { useAuth } from '@/features/auth/useAuth';
import { Dialog, Button } from '@/components/ui';
import { cn } from '@/components/ui/cn';

interface MergeTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTickets: string[]; // e.g., ['INC-202610', 'INC-202611']
}

/** Rebuilt on the shared `Dialog` (real focus trap / Escape / aria-modal —
 *  the previous hand-rolled overlay had none of that) — same props, same
 *  behavior, called from `TicketsList.tsx`'s bulk-merge action. */
export function MergeTicketsModal({ isOpen, onClose, selectedTickets }: MergeTicketsModalProps) {
  const [selectedPrimary, setSelectedPrimary] = useState<string>('');
  const { displayName: currentUserName } = useAuth();
  const { data: ticketPage } = useTickets();
  const tickets = ticketPage?.items ?? [];
  const titleFor = (id: string) => tickets.find((t) => t.id === id)?.title ?? 'Unknown ticket';
  const mergeTickets = useMergeTickets();

  const primaryTicket = selectedTickets.includes(selectedPrimary) ? selectedPrimary : selectedTickets[0] || '';

  function confirmMerge() {
    const mergedIds = selectedTickets.filter((id) => id !== primaryTicket);
    if (!primaryTicket || mergedIds.length === 0) return;
    mergeTickets.mutate(
      { primaryId: primaryTicket, mergedIds, actorName: currentUserName },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Merge tickets"
      description={`Combine ${selectedTickets.length} tickets into one primary ticket`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirmMerge} loading={mergeTickets.isPending} disabled={selectedTickets.length < 2}>
            Merge tickets
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Select primary ticket</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            The selected ticket will be kept open. All other selected tickets will be closed and their notes merged
            into the primary one.
          </p>
        </div>

        <div role="radiogroup" aria-label="Primary ticket" className="space-y-2">
          {selectedTickets.map((id) => (
            <label
              key={id}
              className={cn(
                'flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-all',
                primaryTicket === id
                  ? 'border-primary bg-primary/10'
                  : 'border-border/40 bg-surface-container-low hover:border-primary/30 hover:bg-surface-container/50',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  primaryTicket === id ? 'border-primary bg-primary' : 'border-outline',
                )}
                aria-hidden="true"
              >
                {primaryTicket === id && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
              </span>
              <input
                type="radio"
                name="primaryTicket"
                value={id}
                checked={primaryTicket === id}
                onChange={(e) => setSelectedPrimary(e.target.value)}
                className="sr-only"
              />
              <span className="flex-1">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">{id}</span>
                <p className="mt-1 text-sm font-bold text-on-surface">{titleFor(id)}</p>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            <span className="font-bold">Note:</span> This action cannot be undone. The other selected tickets will be
            marked resolved and linked to the primary ticket.
          </p>
        </div>
        {mergeTickets.isError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {mergeTickets.error.message}
          </p>
        )}
      </div>
    </Dialog>
  );
}
