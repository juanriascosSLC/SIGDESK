import { useEffect } from 'react';

// Avisa antes de perder cambios sin guardar, tanto al cerrar la pestaña como
// al navegar DENTRO de la aplicación.
//
// El Catalog Builder sólo tenía `beforeunload`, que el navegador dispara al
// recargar o cerrar — nunca en una navegación de la SPA. Hacer clic en
// cualquier entrada del menú lateral desmontaba el editor y se llevaba por
// delante el borrador sin decir nada.
//
// `useBlocker` de react-router sería lo natural, pero exige un data router
// (`createBrowserRouter`) y esta aplicación monta `<BrowserRouter>`
// (App.tsx). Migrar el router entero por esta pantalla sería desproporcionado,
// así que se interceptan los dos caminos reales de salida:
//
//   1. Clic en un enlace hacia otra ruta — cómo se sale de aquí en la
//      práctica, vía el menú de AgentLayout.
//   2. Atrás/adelante del navegador, deshaciendo el salto y volviendo a
//      preguntar.
//
// El listener se registra en fase de captura y SÓLO mientras `enabled` es
// true, de modo que con el borrador guardado no queda nada enganchado.
export function useUnsavedChangesGuard(enabled: boolean, message: string): void {
  useEffect(() => {
    if (!enabled) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const interceptLinkClick = (event: MouseEvent) => {
      // Respeta los gestos de "abrir en otra parte": el navegador no va a
      // descartar nada en esos casos.
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

      if (window.confirm(message)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    // Atrás/adelante ya movieron la entrada del historial cuando esto corre.
    // Se vuelve a empujar la actual para quedarse donde estábamos y luego se
    // pregunta; si el usuario acepta, se repite el salto con la guardia ya
    // desactivada por `leaving`.
    let leaving = false;
    const interceptHistoryPop = () => {
      if (leaving) return;
      window.history.pushState(null, '', window.location.href);
      if (!window.confirm(message)) return;
      leaving = true;
      window.removeEventListener('popstate', interceptHistoryPop);
      window.history.back();
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', interceptLinkClick, true);
    window.addEventListener('popstate', interceptHistoryPop);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', interceptLinkClick, true);
      window.removeEventListener('popstate', interceptHistoryPop);
    };
  }, [enabled, message]);
}
