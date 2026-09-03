import { Circle } from 'lucide-react';
import { Badge, type BadgeTone } from './Badge';
import { cn } from './cn';

export interface StatusBadgeProps {
  /** Already-English display label (statuses must be mapped to English
   *  labels at the API/presentation boundary before reaching this
   *  component — see e.g. `statusFromApi` in `features/tickets/api.ts`). */
  label: string;
  tone: BadgeTone;
  className?: string;
}

/** A `Badge` with a leading dot, for when a status needs to be scannable at
 *  a glance in a dense list (kanban cards, table rows) — not just readable. */
export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  const dotClass: Record<BadgeTone, string> = {
    neutral: 'text-on-surface-variant',
    info: 'text-cyan-500',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    danger: 'text-red-500',
    primary: 'text-primary',
  };
  return (
    <Badge tone={tone} className={cn('pl-1.5', className)}>
      <Circle className={cn('h-1.5 w-1.5 shrink-0 fill-current', dotClass[tone])} aria-hidden="true" />
      {label}
    </Badge>
  );
}
