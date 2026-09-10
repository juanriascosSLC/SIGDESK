import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from './cn';

export interface TooltipProps {
  content: string;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'right';
}

interface TooltipPosition {
  top: number;
  left: number;
}

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 8;
// A `side="right"` trigger is typically an icon centered inside a padded
// container (the collapsed sidebar rail, currently) — the icon's own edge
// sits well short of the container's edge, so a small gap measured off the
// icon alone can still land the tooltip visually inside the container's
// padding. A bigger gap here (vs. TRIGGER_GAP for top/bottom) keeps it
// clear of that padding with room to spare, without this component having
// to know anything about the specific container it's used in.
const RIGHT_SIDE_GAP = 16;

/**
 * Wraps a single focusable child and labels it via `aria-describedby` (not
 * `aria-label` — that would replace the child's own accessible name rather
 * than add to it). Shows on hover AND focus, so keyboard users see it too,
 * not just mouse users. Escape hides it without moving focus off the
 * trigger — Tab/Enter/Space are left alone, since those belong to whatever
 * the trigger itself does.
 *
 * Rendered through a portal into `document.body`, positioned with `fixed`
 * coordinates computed from the trigger's own `getBoundingClientRect()` —
 * NOT laid out as an absolutely-positioned sibling inside the trigger's DOM
 * position. That was the bug this replaced: a trigger sitting inside any
 * ancestor with `overflow-x-hidden`/`overflow-y-auto` (the collapsed
 * sidebar's scroll container, in particular) could clip an in-flow tooltip
 * even though it was technically present in the DOM — portaling escapes
 * that ancestor entirely, the same reason Dialog/Drawer already portal.
 *
 * The wrapping `<span>` (not `cloneElement`-ing a ref onto the child) is
 * deliberate: `react-hooks/refs` flags passing any ref through
 * `cloneElement` as "may read its value during render", even a callback
 * ref that only ever runs in React's commit phase — a wrapping element we
 * own outright sidesteps that false positive entirely. `aria-describedby`
 * (a plain string, no ref involved) still goes on the real child via
 * `cloneElement`, same as before.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  // Stable across re-renders for a given `side` — safe to call from event
  // listeners registered once per (visible, side) pair, and safe as an
  // effect dependency without forcing a re-subscribe on every render.
  const positionFromTrigger = useCallback((): TooltipPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    // The wrapper is `inline-flex`, sized to its single child, so its rect
    // is the trigger's rect.
    const rect = trigger.getBoundingClientRect();
    if (side === 'right') {
      return { top: rect.top + rect.height / 2, left: rect.right + RIGHT_SIDE_GAP };
    }
    if (side === 'bottom') {
      return { top: rect.bottom + TRIGGER_GAP, left: rect.left + rect.width / 2 };
    }
    return { top: rect.top - TRIGGER_GAP, left: rect.left + rect.width / 2 };
  }, [side]);

  function show() {
    setPosition(positionFromTrigger());
    setVisible(true);
  }
  function hide() {
    setVisible(false);
  }

  // Escape hides the tooltip without touching focus — the trigger stays
  // focused, only the tooltip itself is dismissed. Tab/Enter/Space are not
  // handled here at all, so they keep doing whatever the trigger does.
  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  // Reposition while visible if the page scrolls/resizes underneath it —
  // a `fixed`-position portal no longer moves with its trigger for free the
  // way an in-flow absolutely-positioned element would. rAF-coalesced so a
  // scroll's flood of events collapses to one reposition per frame.
  useLayoutEffect(() => {
    if (!visible) return;
    let frame = 0;
    const reposition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPosition(positionFromTrigger()));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [visible, positionFromTrigger]);

  // Second pass: once the tooltip has actually rendered (and thus has a
  // real width/height to measure), nudge it back inside the viewport if the
  // anchor position above would have run it off any edge. Anchoring is
  // necessarily a guess before the element exists — this is what makes
  // "keep the tooltip inside the viewport" true in general, not just for
  // the one geometry this was written against.
  //
  // Depends on the actual `position` (not merely whether one exists) so a
  // scroll/resize-driven reposition re-runs this clamp too. The `changed`
  // guard below is what stops that from looping: a corrected position is
  // only written back when the numbers actually differ, so the second time
  // this runs against an already-clamped position it finds nothing to
  // change and settles.
  useLayoutEffect(() => {
    if (!visible || !position) return;
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { top, left } = position;
    let changed = false;
    if (rect.right > window.innerWidth - VIEWPORT_MARGIN) {
      left -= rect.right - (window.innerWidth - VIEWPORT_MARGIN);
      changed = true;
    }
    if (rect.left < VIEWPORT_MARGIN) {
      left += VIEWPORT_MARGIN - rect.left;
      changed = true;
    }
    if (rect.bottom > window.innerHeight - VIEWPORT_MARGIN) {
      top -= rect.bottom - (window.innerHeight - VIEWPORT_MARGIN);
      changed = true;
    }
    if (rect.top < VIEWPORT_MARGIN) {
      top += VIEWPORT_MARGIN - rect.top;
      changed = true;
    }
    if (changed && (top !== position.top || left !== position.left)) {
      setPosition({ top, left });
    }
  }, [visible, position]);

  const transformOrigin =
    side === 'right' ? 'translateY(-50%)' : side === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)';

  return (
    <span ref={triggerRef} className="inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {cloneWithDescribedBy(children, id)}
      {createPortal(
        <AnimatePresence>
          {visible && position && (
            <motion.span
              ref={tooltipRef}
              id={id}
              role="tooltip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              style={{ position: 'fixed', top: position.top, left: position.left, transform: transformOrigin }}
              className={cn(
                'pointer-events-none z-[300] whitespace-nowrap rounded-lg bg-on-surface px-2.5 py-1.5 text-xs font-medium text-surface shadow-lg',
              )}
            >
              {content}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}

function cloneWithDescribedBy(child: ReactElement, id: string) {
  const props = child.props as { 'aria-describedby'?: string };
  const existing = props['aria-describedby'];
  return cloneElement(child, { 'aria-describedby': existing ? `${existing} ${id}` : id } as Record<string, unknown>);
}
