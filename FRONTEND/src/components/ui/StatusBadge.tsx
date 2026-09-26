import { Circle } from 'lucide-react';
import { Badge, type BadgeTone } from './Badge';
import { cn } from './cn';

export interface StatusBadgeProps {
  /** Already-English display label (statuses must be mapped to English
   *  labels at the API/presentation boundary before reaching this
   *  component — see e.g. `statusFromApi` in `features/tickets/api.ts`).
   *
   *  This contract is NOT honored everywhere today: `TicketsKanban.tsx`'s
   *  `KNOWN_TICKET_STATUSES`/`TicketsList.tsx`'s `getSlaChip` compare
   *  against English literals while `domain.Ticket.Estado` is always
   *  Spanish (`abierto`/`en_progreso`/...) — confirmed unresolved,
   *  TODO-111 in SIG-Desk-Backend/Docs/TODOS.md, audit 2026-09-09. Any
   *  new consumer of this component must verify its own mapping is
   *  actually in place, not assume this doc comment describes reality. */
  label: string;
  tone: BadgeTone;
  className?: string;
}

/** A `Badge` with a leading dot, for when a status needs to be scannable at
 *  a glance in a dense list (kanban cards, table rows) — not just readable. */
export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  const dotClass: Record<BadgeTone, string> = {
    neutral: 'text-status-neutral-icon',
    info: 'text-status-info-icon',
    success: 'text-status-success-icon',
    warning: 'text-status-warning-icon',
    danger: 'text-status-danger-icon',
    primary: 'text-primary',
  };
  return (
    <Badge tone={tone} className={cn('pl-1.5', className)}>
      <Circle className={cn('h-1.5 w-1.5 shrink-0 fill-current', dotClass[tone])} aria-hidden="true" />
      {label}
    </Badge>
  );
}
