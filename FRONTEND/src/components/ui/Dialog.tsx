import { useId } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from './cn';
import { useFocusTrap } from './useFocusTrap';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Disables closing on Escape/overlay click — for a dialog whose action is
   *  mid-flight and shouldn't be dismissed accidentally. The header close
   *  button still works. */
  preventDismiss?: boolean;
}

/**
 * The one real modal implementation for SIG-DESK. Every feature-local
 * "Dialog" (MergeTicketsModal, IncidentChangeDialog, ProblemChangeDialog,
 * ChangeTasksBoard's inline modal, …) should render through this instead of
 * hand-building its own overlay — it's the only one of those five that had
 * `role="dialog"`/`aria-modal` at all.
 *
 * Focus trap, Escape-to-close, focus restoration and scroll lock all come
 * from `useFocusTrap`, shared with `Drawer`.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', preventDismiss = false }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useFocusTrap(open, () => {
    if (!preventDismiss) onClose();
  });

  const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={preventDismiss ? undefined : onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'relative z-10 w-full rounded-2xl border border-border bg-surface-container-low shadow-2xl outline-none max-h-[90vh] flex flex-col',
              sizeClass,
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/50 p-5">
              <div>
                <h2 id={titleId} className="text-lg font-bold text-on-surface">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-on-surface-variant">
                    {description}
                  </p>
                )}
              </div>
              <IconButton icon={<X className="h-4 w-4" />} aria-label="Close dialog" size="sm" onClick={onClose} />
            </div>
            {children && <div className="overflow-y-auto p-5">{children}</div>}
            {footer && <div className="flex items-center justify-end gap-2 border-t border-border/50 p-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
