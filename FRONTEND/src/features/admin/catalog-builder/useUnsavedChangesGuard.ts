import { useCallback, useEffect, useRef, useState } from 'react';

// Warns before losing unsaved changes, both when closing the tab and when
// navigating WITHIN the app.
//
// Catalog Builder used to only have `beforeunload`, which the browser fires
// on reload/close — never on an SPA navigation. Clicking any sidebar entry
// unmounted the editor and took the draft with it, silently.
//
// `useBlocker` from react-router would be the natural fit, but it requires a
// data router (`createBrowserRouter`) and this app mounts `<BrowserRouter>`
// (App.tsx). Migrating the whole router for this one screen would be
// disproportionate, so the two real exit paths are intercepted directly:
//
//   1. Clicking a link to another route — how people actually leave here, via
//      AgentLayout's sidebar.
//   2. Browser back/forward, undoing the jump and asking again.
//
// # Why this can't just call `window.confirm` inline
//
// The click/popstate handlers need to decide SYNCHRONOUSLY whether to
// `preventDefault()` the navigation, and a real `ConfirmDialog` is
// asynchronous (it waits for a person to click a button). So instead of
// blocking on a native confirm, every intercepted navigation is prevented
// UNCONDITIONALLY up front, its "how to actually leave" callback is stashed,
// and the caller renders a `ConfirmDialog` — hooked up via the object this
// returns — that runs the stashed callback if the person confirms.
//
// `window.confirm` is not used anywhere in this file. The only native
// dialog left is the browser's own "leave site?" prompt that `beforeunload`
// triggers — and that one genuinely can't be replaced: per the MDN spec, a
// page cannot customize or suppress that dialog, only ask the browser to
// show it via `preventDefault()`/`returnValue`. It only fires on an actual
// tab close or reload, never on the SPA navigation this hook otherwise
// handles with a real dialog.
export interface UnsavedChangesGuard {
  /** True while a navigation is blocked, waiting for confirmation. Render a
   *  `ConfirmDialog` bound to this. */
  pending: boolean;
  /** Person confirmed leaving — replays the navigation that was blocked. */
  confirmLeave: () => void;
  /** Person canceled — the navigation stays blocked; nothing happens. */
  cancelLeave: () => void;
}

export function useUnsavedChangesGuard(enabled: boolean): UnsavedChangesGuard {
  const [pending, setPending] = useState(false);
  // The action to perform if the person confirms — set synchronously by
  // whichever handler intercepted the navigation, read asynchronously when
  // they click "Leave" in the dialog.
  const resumeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const interceptLinkClick = (event: MouseEvent) => {
      // Respects "open elsewhere" gestures: the browser isn't going to
      // discard anything in those cases.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || anchor.hasAttribute('download')) return;
      const target = anchor.getAttribute('target');
      if (target && target !== '_self') return;

      const destination = new URL(href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      resumeRef.current = () => {
        window.location.assign(destination.href);
      };
      setPending(true);
    };

    // Back/forward already moved the history entry by the time this runs. The
    // current entry is pushed back to stay put, and confirming replays the
    // jump with the guard disabled via `leaving` so it doesn't re-trigger.
    let leaving = false;
    const interceptHistoryPop = () => {
      if (leaving) return;
      window.history.pushState(null, '', window.location.href);
      resumeRef.current = () => {
        leaving = true;
        window.removeEventListener('popstate', interceptHistoryPop);
        window.history.back();
      };
      setPending(true);
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', interceptLinkClick, true);
    window.addEventListener('popstate', interceptHistoryPop);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', interceptLinkClick, true);
      window.removeEventListener('popstate', interceptHistoryPop);
    };
  }, [enabled]);

  const confirmLeave = useCallback(() => {
    setPending(false);
    resumeRef.current?.();
    resumeRef.current = null;
  }, []);

  const cancelLeave = useCallback(() => {
    setPending(false);
    resumeRef.current = null;
  }, []);

  return { pending, confirmLeave, cancelLeave };
}
