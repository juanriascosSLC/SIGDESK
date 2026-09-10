import type { HTMLAttributes, Ref } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes the default padding, for cards that manage their own inner layout. */
  noPadding?: boolean;
  /** Adds a hover affordance for cards that act as click targets. */
  interactive?: boolean;
  /** Forwarded to the underlying div, for call sites that need to scroll a
   *  card into view or focus it (SrvDetail's equipment checklist). React 19
   *  passes `ref` through as a normal prop, so no forwardRef wrapper is
   *  needed — only the type has to admit it. */
  ref?: Ref<HTMLDivElement>;
}

/** Replaces the `.panel-card` utility class with a real component so variants
 *  (padding, interactive hover) don't have to be hand-composed per call site. */
export function Card({ noPadding = false, interactive = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-border bg-surface-container-low shadow-[0_1px_3px_0_rgba(0,0,0,0.1)] backdrop-blur-xl',
        !noPadding && 'p-5',
        interactive && 'transition-colors hover:border-outline hover:bg-surface-container cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-base font-bold text-on-surface', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('mt-1 text-sm text-on-surface-variant', className)} {...props}>
      {children}
    </p>
  );
}
