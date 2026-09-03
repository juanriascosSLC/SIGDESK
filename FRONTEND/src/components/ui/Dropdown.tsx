import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from './cn';

export interface DropdownItem {
  key: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  /** aria-label for the trigger wrapper when `trigger` has no visible text
   *  of its own (an icon button, for instance). */
  triggerLabel?: string;
}

/**
 * A small menu anchored to a trigger button, with full keyboard support:
 * Arrow Up/Down moves the highlighted item, Home/End jump to the ends,
 * Enter/Space selects, Escape closes and returns focus to the trigger,
 * click-outside closes.
 */
export function Dropdown({ trigger, items, align = 'right', triggerLabel }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Focusing the first item is a DOM/external-system action (legitimately an
  // effect); resetting `highlighted` is plain React state and happens in
  // `openMenu` below instead, so opening the menu doesn't cost an extra
  // render pass just to zero it out.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [open]);

  function openMenu() {
    setHighlighted(0);
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const enabled = items.map((item, i) => ({ item, i })).filter(({ item }) => !item.disabled);
    if (enabled.length === 0) return;
    const currentPos = enabled.findIndex(({ i }) => i === highlighted);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = enabled[(currentPos + 1) % enabled.length];
      setHighlighted(next.i);
      itemRefs.current[next.i]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = enabled[(currentPos - 1 + enabled.length) % enabled.length];
      setHighlighted(prev.i);
      itemRefs.current[prev.i]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlighted(enabled[0].i);
      itemRefs.current[enabled[0].i]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = enabled[enabled.length - 1];
      setHighlighted(last.i);
      itemRefs.current[last.i]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => (open ? close() : openMenu())}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12 }}
            onKeyDown={handleKeyDown}
            className={cn(
              'absolute z-50 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface-container-lowest py-1 shadow-2xl',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {items.map((item, i) => (
              <button
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                tabIndex={-1}
                onClick={() => {
                  item.onSelect();
                  close();
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:bg-surface-container-high',
                  item.destructive ? 'text-destructive hover:bg-destructive/10' : 'text-on-surface hover:bg-surface-container-high',
                  item.disabled && 'opacity-40 pointer-events-none',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
