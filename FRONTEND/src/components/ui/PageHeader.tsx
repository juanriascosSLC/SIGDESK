import type { ReactNode } from 'react';
import { cn } from './cn';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Rendered above the title, e.g. a back link. */
  eyebrow?: ReactNode;
  className?: string;
}

/** The title block every module list/detail screen renders at its top —
 *  standardizes the title/description/actions layout that was previously
 *  hand-composed per page with slightly different spacing and casing each
 *  time (including some ALL-CAPS eyebrow labels this replaces). */
export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow}
        <h1 className="text-2xl font-black tracking-tight text-on-surface break-words">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
