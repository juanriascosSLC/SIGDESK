import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] hover:opacity-92 active:scale-[0.98]',
  secondary:
    'bg-surface-container border border-border text-on-surface hover:bg-surface-container-high hover:border-outline active:scale-[0.98]',
  ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:scale-[0.98]',
  destructive:
    'bg-destructive text-white hover:opacity-92 active:scale-[0.98]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button, without shifting its label out. */
  loading?: boolean;
  /** Rendered before the label. Hidden while `loading` (the spinner takes its place). */
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/**
 * Base button. Every SIG-DESK action button should render through this
 * component rather than a raw `<button className="primary-button">` — it
 * keeps disabled/loading states, focus rings, and keyboard behavior (native
 * `<button>` already handles Enter/Space) consistent in one place.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leadingIcon, trailingIcon, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-bold whitespace-nowrap transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
