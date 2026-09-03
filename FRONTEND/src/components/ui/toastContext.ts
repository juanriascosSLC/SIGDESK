import { createContext } from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  tone?: ToastTone;
  title: string;
  /** Keep this to what the person can act on. Never pass a raw error
   *  object, stack trace, or backend response body here. */
  description?: string;
  durationMs?: number;
}

export interface ToastContextValue {
  show: (options: ToastOptions) => void;
}

/** Split from `ToastProvider.tsx` so that file can stay component-only
 *  (react-refresh/only-export-components). */
export const ToastContext = createContext<ToastContextValue | null>(null);
