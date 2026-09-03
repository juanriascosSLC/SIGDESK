import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface FieldProps {
  label?: string;
  /** Passed straight through as `htmlFor`/`id` glue between the label and
   *  the control — every Field caller must forward `fieldProps.id` onto its
   *  actual `<input>`/`<select>`/`<textarea>`. */
  id?: string;
  help?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (fieldProps: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/**
 * Label + control + help/error text, wired together with real `htmlFor` and
 * `aria-describedby` — every form control in the design system (`Input`,
 * `Textarea`, `Select`) is built on this so labels are never just visually
 * adjacent text.
 */
export function Field({ label, id, help, error, required, className, children }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helpId = help ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('block', className)}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {help && !error && (
        <p id={helpId} className="mt-1.5 text-xs text-on-surface-variant">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
