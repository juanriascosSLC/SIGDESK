import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authService } from './auth.service';
import { AuthContext, type AuthState } from './authContext';
import { setAccessToken } from '@/lib/authToken';
import { AUTH_FAILURE_EVENT } from '@/lib/sigtoolsClient';
import { apiRequest } from '@/lib/apiClient';

const ACCESS_LEVEL_KEY = 'access_level';

const CLEARED_STATE: AuthState = {
  user: null,
  accessLevel: null,
  roles: [],
  permissions: [],
  isLoading: false,
  isAuthenticated: false,
};

async function getAuthorization(): Promise<{
  roles: string[];
  permissions: string[];
}> {
  try {
    const response = await apiRequest<{
      identity: { roles: string[] | null; permissions: string[] | null };
    }>('/me', { suppressAuthFailure: true });
    return {
      roles: response.identity.roles ?? [],
      permissions: response.identity.permissions ?? [],
    };
  } catch {
    return { roles: [], permissions: [] };
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
    const authorization = await getAuthorization();
    setState({
      user,
      accessLevel: savedLevel ? parseInt(savedLevel, 10) : null,
      roles: authorization.roles,
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

  const isAdmin =
    state.roles.some((role) =>
      ['admin', 'administrator'].includes(role.toLowerCase()),
    ) ||
    state.permissions.includes('*') ||
    state.permissions.includes('admin.*');

  const value = useMemo(() => {
    function can(permissionKey: string): boolean {
      if (!state.isAuthenticated) return false;
      if (isAdmin) return true;
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
      isAdmin,
      displayName,
    };
  }, [isAdmin, login, logout, logoutAll, refresh, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
