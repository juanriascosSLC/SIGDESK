import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap + Escape + scroll lock + focus restoration for overlays
 * (Dialog, Drawer). Shared by both so their keyboard behavior can't drift
 * apart.
 *
 * - On open: remembers the element that had focus, moves focus inside the
 *   panel (first focusable element, or the panel itself as a fallback).
 * - While open: Tab/Shift+Tab wrap within the panel; Escape calls `onClose`;
 *   background scroll is locked via `overflow: hidden` on `<body>`.
 * - On close: restores focus to the element that had it before opening —
 *   without this, focus silently falls back to `<body>` and keyboard users
 *   lose their place in the page.
 */
export function useFocusTrap(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  // Consumers commonly pass an inline callback because dismissal can depend
  // on live state (for example, a pending mutation). Re-installing the whole
  // trap whenever that callback changes restores focus and then focuses the
  // first control again, which used to move focus to the dialog's close button
  // after every keystroke. Keep the listener stable while still calling the
  // latest callback.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Deferred so the panel has mounted/animated in before we look for a
    // focus target inside it.
    const focusFrame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        // Focus escaped the panel (e.g. programmatic focus elsewhere) —
        // pull it back in rather than letting Tab continue into the page.
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  return panelRef;
}
