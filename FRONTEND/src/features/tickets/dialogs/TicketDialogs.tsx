import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Dialog, ConfirmDialog, Button, SearchInput } from '@/components/ui';
import { AssignmentPicker, type AssignmentTarget } from '@/features/organization/AssignmentPicker';
import { listTickets } from '../api';
import type { Ticket } from '../types';

/**
 * Every native `window.alert`/`window.prompt`/`window.confirm` that used to
 * live in `TicketDetail.tsx` is replaced by one of the dialogs in this file
 * — see the section 4 requirements: assign, reassign, reopen (mandatory
 * reason), merge, watch/unwatch, bulk assignment.
 */

export interface AssignTicketDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (target: AssignmentTarget, overwriteExisting: boolean) => void | Promise<void>;
  currentAssignee?: string | null;
  loading?: boolean;
  error?: string;
}

/** Assign (or reassign) a single ticket via the real organizational
 *  directory — replaces `window.prompt('ID del agente...')`. */
export function AssignTicketDialog({ open, onClose, onConfirm, currentAssignee, loading, error }: AssignTicketDialogProps) {
  const [target, setTarget] = useState<AssignmentTarget | null>(null);
  const isReassign = Boolean(currentAssignee);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isReassign ? 'Reassign ticket' : 'Assign ticket'}
      description={isReassign ? `Currently assigned to ${currentAssignee}.` : 'Choose who should work on this ticket.'}
      preventDismiss={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => target && onConfirm(target, isReassign)}
            disabled={!target}
            loading={loading}
          >
            {isReassign ? 'Reassign' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <AssignmentPicker capability="tickets" value={target} onChange={setTarget} requireAssignee />
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export interface ReopenTicketDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  loading?: boolean;
  error?: string;
}

/** Reopen with a mandatory reason — replaces `window.prompt('Motivo de la
 *  reapertura:')` and the follow-up `window.alert` when it was left blank. */
export function ReopenTicketDialog({ open, onClose, onConfirm, loading, error }: ReopenTicketDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={(reason) => {
        if (reason) onConfirm(reason);
      }}
      title="Reopen ticket"
      description="Reopening moves this ticket back into active work."
      confirmLabel="Reopen"
      reasonLabel="Reason for reopening"
      reasonPlaceholder="Why does this need to be reopened?"
      loading={loading}
      error={error}
    />
  );
}

export interface WatchToggleDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isWatching: boolean;
  loading?: boolean;
  error?: string;
}

/** Watch/unwatch confirmation — a low-stakes action, but still one that used
 *  to surface its failure via `window.alert`. */
export function WatchToggleDialog({ open, onClose, onConfirm, isWatching, loading, error }: WatchToggleDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => onConfirm()}
      title={isWatching ? 'Stop watching this ticket?' : 'Watch this ticket?'}
      description={
        isWatching
          ? "You'll stop receiving activity notifications for this ticket."
          : "You'll receive activity notifications whenever this ticket changes."
      }
      confirmLabel={isWatching ? 'Unwatch' : 'Watch'}
      loading={loading}
      error={error}
    />
  );
}

export interface BulkAssignDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (target: AssignmentTarget) => void | Promise<void>;
  count: number;
  loading?: boolean;
  error?: string;
}

/** Assign several selected tickets at once via the organizational directory
 *  — replaces `window.prompt('Assign selected tickets to:', ...)`. */
export function BulkAssignDialog({ open, onClose, onConfirm, count, loading, error }: BulkAssignDialogProps) {
  const [target, setTarget] = useState<AssignmentTarget | null>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign selected tickets"
      description={`Assign ${count} ticket${count === 1 ? '' : 's'} to a department, team, and person.`}
      preventDismiss={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => target && onConfirm(target)} disabled={!target} loading={loading}>
            Assign {count} ticket{count === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <AssignmentPicker capability="tickets" value={target} onChange={setTarget} requireAssignee />
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export interface MergeIntoTicketDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mergedIds: string[]) => void | Promise<void>;
  currentTicketId: string;
  loading?: boolean;
  error?: string;
}

/**
 * Search for other tickets and merge them into the one being viewed —
 * replaces `window.prompt('Ticket IDs to merge into this one (comma
 * separated):')`, which asked for raw technical ids by hand.
 */
export function MergeIntoTicketDialog({ open, onClose, onConfirm, currentTicketId, loading, error }: MergeIntoTicketDialogProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Ticket[]>([]);

  const results = useQuery({
    queryKey: ['ticket-merge-search', query],
    queryFn: () => listTickets({ q: query, limit: 10 }),
    enabled: open && query.trim().length >= 2,
  });

  const candidates = (results.data?.items ?? []).filter(
    (t) => t.id !== currentTicketId && !selected.some((s) => s.id === t.id),
  );

  function handleClose() {
    setQuery('');
    setSelected([]);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Merge tickets"
      description="Search for tickets to merge into this one. They'll be closed and linked here."
      size="lg"
      preventDismiss={loading}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(selected.map((t) => t.id))} disabled={selected.length === 0} loading={loading}>
            Merge {selected.length > 0 ? `${selected.length} ticket${selected.length === 1 ? '' : 's'}` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {selected.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-primary"
              >
                {t.humanId ?? t.id} — {t.title}
                <button
                  type="button"
                  onClick={() => setSelected((current) => current.filter((s) => s.id !== t.id))}
                  aria-label={`Remove ${t.humanId ?? t.id} from selection`}
                  className="rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <SearchInput
          aria-label="Search tickets to merge"
          placeholder="Search by title, description or ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
        />
        {query.trim().length >= 2 && (
          <ul className="max-h-64 overflow-y-auto rounded-xl border border-border/50">
            {results.isLoading && <li className="p-3 text-sm text-on-surface-variant">Searching…</li>}
            {!results.isLoading && candidates.length === 0 && (
              <li className="p-3 text-sm text-on-surface-variant">No matching tickets found.</li>
            )}
            {candidates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected((current) => [...current, t])}
                  className="flex w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-container-high focus-visible:outline-none focus-visible:bg-surface-container-high"
                >
                  <span className="font-mono text-xs text-on-surface-variant">{t.humanId ?? t.id}</span>
                  <span className="truncate">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
