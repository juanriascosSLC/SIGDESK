import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** Tone is deliberately generic (not tied to any one module's status
 *  vocabulary) — Tickets, RFCs, PRBs and Tasks each have their own status
 *  strings, and this only standardizes how a tone *renders*, not what maps
 *  to what. Callers keep owning their own status→tone decision. */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  info: 'bg-cyan-400/10 text-cyan-600 dark:text-cyan-400',
  success: 'bg-emerald-400/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-400/10 text-amber-600 dark:text-amber-400',
  danger: 'bg-red-400/10 text-red-600 dark:text-red-400',
  primary: 'bg-primary/10 text-primary',
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
