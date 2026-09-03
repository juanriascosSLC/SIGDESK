import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useId } from 'react';
import { cn } from './cn';
import { useFocusTrap } from './useFocusTrap';
import { IconButton } from './IconButton';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: 'left' | 'right';
  widthClassName?: string;
}

/**
 * Slide-in panel used for the tablet sidebar and the mobile "More" menu.
 * Shares the same focus-trap/Escape/scroll-lock/focus-restoration behavior
 * as `Dialog` via `useFocusTrap`, so keyboard users get identical guarantees
 * from either overlay.
 */
export function Drawer({ open, onClose, title, children, side = 'left', widthClassName = 'w-80 max-w-[85vw]' }: DrawerProps) {
  const titleId = useId();
  const panelRef = useFocusTrap(open, onClose);
  const fromX = side === 'left' ? '-100%' : '100%';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ x: fromX }}
            animate={{ x: 0 }}
            exit={{ x: fromX }}
            transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'relative z-10 flex h-full flex-col overflow-y-auto bg-surface-container-lowest shadow-2xl outline-none',
              widthClassName,
              side === 'right' && 'ml-auto',
            )}
          >
            <div className="flex items-center justify-between border-b border-border/50 p-4">
              <h2 id={titleId} className="text-base font-bold text-on-surface">
                {title}
              </h2>
              <IconButton icon={<X className="h-4 w-4" />} aria-label="Close menu" size="sm" onClick={onClose} />
            </div>
            <div className="flex-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
