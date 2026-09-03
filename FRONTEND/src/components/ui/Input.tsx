import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from './cn';
import { Field } from './Field';

const controlBase =
  'w-full rounded-xl border border-border bg-surface-container px-3.5 py-2.5 text-sm text-on-surface ' +
  'transition-all placeholder:text-on-surface-variant/60 ' +
  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ' +
  'disabled:opacity-40 disabled:pointer-events-none';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label?: string;
  help?: string;
  error?: string;
  id?: string;
}

/** Replaces `.friendly-input`-on-a-raw-`<input>` with a real labeled field. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, help, error, id, className, required, ...props },
  ref,
) {
  return (
    <Field label={label} id={id} help={help} error={error} required={required}>
      {(fieldProps) => (
        <input ref={ref} className={cn(controlBase, className)} required={required} {...fieldProps} {...props} />
      )}
    </Field>
  );
});

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label?: string;
  help?: string;
  error?: string;
  id?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, help, error, id, className, required, rows = 4, ...props },
  ref,
) {
  return (
    <Field label={label} id={id} help={help} error={error} required={required}>
      {(fieldProps) => (
        <textarea
          ref={ref}
          rows={rows}
          className={cn(controlBase, 'resize-y', className)}
          required={required}
          {...fieldProps}
          {...props}
        />
      )}
    </Field>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label?: string;
  help?: string;
  error?: string;
  id?: string;
  options: SelectOption[];
  /** Rendered as a disabled, unselectable first option (e.g. "Select a team…"). */
  placeholder?: string;
}

/**
 * Native `<select>`, styled through the design tokens instead of the
 * `bg-[#1d2026] text-[#e1e2eb]` + `colorScheme:'dark'` pattern that was
 * hand-copied into ~15 files — `color-scheme` is set once, globally, in
 * `index.css`, and this component just needs the token-based classes.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, help, error, id, className, required, options, placeholder, ...props },
  ref,
) {
  return (
    <Field label={label} id={id} help={help} error={error} required={required}>
      {(fieldProps) => (
        <div className="relative">
          <select
            ref={ref}
            className={cn(controlBase, 'appearance-none pr-9', className)}
            required={required}
            {...fieldProps}
            {...props}
          >
            {placeholder && (
              <option value="" disabled hidden={props.value !== undefined && props.value !== ''}>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
            aria-hidden="true"
          />
        </div>
      )}
    </Field>
  );
});

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  id?: string;
  onClear?: () => void;
  /** aria-label is required since this control usually has no visible
   *  <label> (it sits inline in a toolbar). */
  'aria-label': string;
  icon?: ReactNode;
}

/** A search box with a leading icon and a clear button — used for every
 *  "Search…" input across list/board views instead of a bare `<input>`. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { onClear, className, value, icon, ...props },
  ref,
) {
  const hasValue = typeof value === 'string' && value.length > 0;
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
        {icon ?? <Search className="h-4 w-4" aria-hidden="true" />}
      </span>
      <input
        ref={ref}
        type="search"
        value={value}
        className={cn(controlBase, 'pl-9', hasValue && onClear && 'pr-9')}
        {...props}
      />
      {hasValue && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
