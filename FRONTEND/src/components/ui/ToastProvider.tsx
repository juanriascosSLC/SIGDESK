import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { ToastContext, type ToastOptions, type ToastTone } from './toastContext';

export type { ToastOptions, ToastTone };

interface ToastRecord extends ToastOptions {
  id: string;
}

const toneConfig: Record<ToastTone, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-emerald-700 dark:text-emerald-400' },
  error: { icon: XCircle, className: 'text-red-700 dark:text-red-400' },
  warning: { icon: AlertTriangle, className: 'text-amber-800 dark:text-amber-400' },
  info: { icon: Info, className: 'text-cyan-700 dark:text-cyan-400' },
};

const DEFAULT_DURATION_MS = 6000;

/**
 * Global toast host. Mount once near the app root. Two live regions are used
 * on purpose: `assertive` for errors/warnings (interrupts a screen reader
 * immediately — the person needs to know a mutation failed) and `polite`
 * for success/info (announced without cutting off whatever's being read).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, tone: 'info', ...options }]);
    const duration = options.durationMs ?? DEFAULT_DURATION_MS;
    const timer = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, timer);
  }, [dismiss]);

  const value = useMemo(() => ({ show }), [show]);

  const assertiveToasts = toasts.filter((t) => t.tone === 'error' || t.tone === 'warning');
  const politeToasts = toasts.filter((t) => t.tone === 'success' || t.tone === 'info');

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-[calc(56px+env(safe-area-inset-bottom)+0.5rem)] right-4 sm:bottom-4 z-[200] flex w-full max-w-sm flex-col gap-2">
          <div aria-live="assertive" role="status" className="contents">
            <AnimatePresence>
              {assertiveToasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
              ))}
            </AnimatePresence>
          </div>
          <div aria-live="polite" role="status" className="contents">
            <AnimatePresence>
              {politeToasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
              ))}
            </AnimatePresence>
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: string) => void }) {
  const { icon: Icon, className } = toneConfig[toast.tone ?? 'info'];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface-container-lowest p-4 shadow-2xl"
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', className)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-on-surface">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs text-on-surface-variant">{toast.description}</p>}
      </div>
      <IconButton
        icon={<X className="h-3.5 w-3.5" />}
        aria-label="Dismiss notification"
        size="sm"
        onClick={() => onDismiss(toast.id)}
      />
    </motion.div>
  );
}

