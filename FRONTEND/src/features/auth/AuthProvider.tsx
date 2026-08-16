import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authService } from './auth.service';
import { sessionService } from './session.service';
import { AuthContext, type AuthState } from './authContext';
import { setAccessToken, setSigDeskToken } from '@/lib/authToken';
import { AUTH_FAILURE_EVENT } from '@/lib/sigtoolsClient';

const ACCESS_LEVEL_KEY = 'access_level';

/**
 * organization_service entities that gate the Users & Roles admin screen
 * (Docs/howto/bootstrap-primer-admin.md inserts permissions over exactly
 * these two tables for the first admin). Fixed by schema, not a role name —
 * ADR-0017 rejects any role that bypasses checks, so access here has to be
 * a real granted permission.
 */
const ADMIN_SURFACE_ENTITIES = ['roles', 'usuarios'];

const CLEARED_STATE: AuthState = {
  user: null,
  accessLevel: null,
  roleId: null,
  permissions: [],
  isLoading: false,
  isAuthenticated: false,
};

/** Exchanges the SIGTools-confirmed email for SIG-DESK's own session
 *  (`POST /v1/session`, ADR-0017 decisión 3) and stores its JWT for
 *  subsequent calls to organization_service. A failure here (404 — identity
 *  known to SIGTools but not yet provisioned as a `Usuario`, or any other
 *  error) degrades to "known identity, no role, no permissions" instead of
 *  throwing — the corporate SIGTools session may still be perfectly valid,
 *  and `Docs/howto/bootstrap-primer-admin.md` is the documented way to
 *  close that gap, not an error this screen should surface as a login
 *  failure. */
async function getAuthorization(email: string): Promise<{
  roleId: string | null;
  permissions: string[];
}> {
  try {
    const sesion = await sessionService.emitir(email);
    setSigDeskToken(sesion.access_token);
    return { roleId: sesion.role_id || null, permissions: sesion.permissions ?? [] };
  } catch {
    setSigDeskToken(null);
    return { roleId: null, permissions: [] };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ...CLEARED_STATE,
    isLoading: true,
  });

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(ACCESS_LEVEL_KEY);
    setAccessToken(null);
    setSigDeskToken(null);
    setState(CLEARED_STATE);
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_FAILURE_EVENT, clearAuthState);
    return () =>
      window.removeEventListener(AUTH_FAILURE_EVENT, clearAuthState);
  }, [clearAuthState]);

  const refresh = useCallback(async () => {
    const user = await authService.getMe();
    const savedLevel = localStorage.getItem(ACCESS_LEVEL_KEY);
    if (user === null) {
      setState(CLEARED_STATE);
      return;
    }
    const authorization = await getAuthorization(user.email);
    setState({
      user,
      accessLevel: savedLevel ? parseInt(savedLevel, 10) : null,
      roleId: authorization.roleId,
      permissions: authorization.permissions,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  useEffect(() => {
    // Schedule restoration after the mount commit. This avoids a synchronous
    // state cascade while preserving the existing session restore behavior.
    const restoreTimer = window.setTimeout(() => {
      void refresh().catch(() =>
        setState((current) => ({ ...current, isLoading: false })),
      );
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await authService.login(username, password);
    localStorage.setItem(ACCESS_LEVEL_KEY, String(response.access_level));
    setAccessToken(response.access_token ?? null);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    clearAuthState();
    await authService.logout();
  }, [clearAuthState]);

  const logoutAll = useCallback(async () => {
    clearAuthState();
    await authService.logoutAll();
  }, [clearAuthState]);

  // Real capability, not a role name: true only if the JWT actually granted
  // a permission over an entity this screen manages. Roles are not fixed or
  // predefined (glossary.md "Rol") — there is no "admin" string to match.
  const canManageUsersAndRoles = state.permissions.some((permission) =>
    ADMIN_SURFACE_ENTITIES.includes(permission.split(':')[0]),
  );

  const value = useMemo(() => {
    // FRONTEND-HANDOFF.md §6: a bare "*" or a "<module>.*" wildcard is a
    // recognized grant. There is no role-based bypass — every capability,
    // including a blanket one, has to be an explicit permission string.
    function can(permissionKey: string): boolean {
      if (!state.isAuthenticated) return false;
      if (state.permissions.includes('*')) return true;
      if (state.permissions.includes(permissionKey)) return true;
      const [module] = permissionKey.split('.');
      return module ? state.permissions.includes(`${module}.*`) : false;
    }

    const displayName =
      state.user?.name ||
      state.user?.username ||
      (state.isAuthenticated ? 'Usuario' : '');

    return {
      ...state,
      login,
      logout,
      logoutAll,
      refresh,
      can,
      canManageUsersAndRoles,
      displayName,
    };
  }, [canManageUsersAndRoles, login, logout, logoutAll, refresh, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
