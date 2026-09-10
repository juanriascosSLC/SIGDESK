import { createContext, useContext } from 'react';

/**
 * Where the automations surface lives in the route tree.
 *
 * The default is the IT-wide area, so every existing consumer behaves exactly
 * as before and no caller has to opt in.
 */
export const DEFAULT_AUTOMATIONS_BASE_PATH = '/app/automations';

/**
 * Lets the automations components be mounted under a different route subtree
 * without rewriting their navigation.
 *
 * Before this, `PublishedViewer`, `NewWorkflow`, the canvas editor's Back
 * button and the list's two buttons all navigated to a hardcoded absolute
 * `/app/automations/...`. Mounting any of them elsewhere (a department-scoped
 * area, say) would throw the user out of that area the moment they saved,
 * published, or went back.
 *
 * This context only moves the ROUTE. It does not scope data, and it grants no
 * permission: a consumer mounting these components somewhere else is still
 * responsible for gating the route and for what the API returns.
 */
export const AutomationsBasePathContext = createContext<string>(DEFAULT_AUTOMATIONS_BASE_PATH);

export function useAutomationsBasePath(): string {
  return useContext(AutomationsBasePathContext);
}
