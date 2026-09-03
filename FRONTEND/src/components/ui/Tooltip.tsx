import { cloneElement, useId, useState } from 'react';
import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from './cn';

export interface TooltipProps {
  content: string;
  children: ReactElement;
  side?: 'top' | 'bottom';
}

/**
 * Wraps a single focusable child and labels it via `aria-describedby` (not
 * `aria-label` — that would replace the child's own accessible name rather
 * than add to it). Shows on hover AND focus, so keyboard users see it too,
 * not just mouse users.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {cloneWithDescribedBy(children, id)}
      <AnimatePresence>
        {visible && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className={cn(
              'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-on-surface px-2.5 py-1.5 text-xs font-medium text-surface shadow-lg',
              side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function cloneWithDescribedBy(child: ReactElement, id: string) {
  const props = child.props as { 'aria-describedby'?: string };
  const existing = props['aria-describedby'];
  return cloneElement(child, { 'aria-describedby': existing ? `${existing} ${id}` : id } as Record<string, unknown>);
}
