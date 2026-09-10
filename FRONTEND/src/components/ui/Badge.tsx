import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** Tone is deliberately generic (not tied to any one module's status
 *  vocabulary) — Tickets, RFCs, PRBs and Tasks each have their own status
 *  strings, and this only standardizes how a tone *renders*, not what maps
 *  to what. Callers keep owning their own status→tone decision. */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-status-neutral-bg text-status-neutral-fg border border-status-neutral-border',
  info: 'bg-status-info-bg text-status-info-fg border border-status-info-border',
  success: 'bg-status-success-bg text-status-success-fg border border-status-success-border',
  warning: 'bg-status-warning-bg text-status-warning-fg border border-status-warning-border',
  danger: 'bg-status-danger-bg text-status-danger-fg border border-status-danger-border',
  primary: 'bg-primary/15 text-primary-foreground bg-primary/10 text-cyan-800 dark:text-cyan-300 border border-primary/25',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

/** A single, consistent pill for status/category/count labels — replaces the
 *  ~10 hand-rolled `rounded-full ... text-xs` implementations across
 *  features that each picked slightly different padding/casing. */
export function Badge({ tone = 'neutral', size = 'md', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
