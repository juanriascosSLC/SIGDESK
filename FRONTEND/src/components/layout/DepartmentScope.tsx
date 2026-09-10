import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export interface DepartmentScopeProps {
  /** The department key stamped as `data-department` on this wrapper's own
   *  root — e.g. "services". Each department defines its own parallel CSS
   *  token set keyed off `[data-department="<department>"]` in index.css;
   *  this component only applies the attribute, it doesn't know what any
   *  department's tokens look like. Generic by design (Recommended
   *  Approach, services-department-frontend.md) so the next department-
   *  scoped placeholder reuses this instead of reinventing it. */
  department: string;
  className?: string;
  children: ReactNode;
}

/**
 * Per-page department theming primitive. `AgentLayout` paints its own
 * background at two ancestor levels (`bg-background` on the outer shell,
 * `bg-surface` on `{children}`'s direct container) that this wrapper does
 * NOT and cannot recolor by CSS cascade alone — so every page using this
 * component must also apply its own department-scoped background class
 * (e.g. `bg-services-background`) via `className`, not rely on inheriting
 * one. See Premise 2 (revised) in services-department-frontend.md.
 */
export function DepartmentScope({ department, className, children }: DepartmentScopeProps) {
  return (
    <div data-department={department} className={cn('min-h-full', className)}>
      {children}
    </div>
  );
}
