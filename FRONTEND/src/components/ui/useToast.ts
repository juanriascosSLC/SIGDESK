import { useContext } from 'react';
import { ToastContext, type ToastContextValue } from './toastContext';

/** `const toast = useToast(); toast.show({ tone: 'error', title: '...' })` */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within <ToastProvider>. Is it mounted near the app root?');
  }
  return ctx;
}
