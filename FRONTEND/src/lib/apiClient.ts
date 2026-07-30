import { getAccessToken } from './authToken';
import { AUTH_FAILURE_EVENT } from './sigtoolsClient';

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'
).replace(/\/$/, '');

/**
 * Session credential for SIG-DESK's own Go API.
 *
 * The API validates this against SIGTools, so the token is the same session
 * the user established at login. It has to travel as a bearer header rather
 * than a cookie: sig_token is HttpOnly and scoped to the auth service's
 * domain, so the browser would never send it to this API on a different
 * origin.
 */
export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & {
    /**
     * Suppresses the global session-teardown on 401. Needed by the call that
     * hydrates authorization during login: the corporate session has already
     * been confirmed by then, so tearing it down here would bounce the user
     * back to the login screen in a loop instead of letting them in with no
     * SIG-DESK permissions (which is a visible, diagnosable state).
     */
    suppressAuthFailure?: boolean;
  },
): Promise<T> {
  const { suppressAuthFailure, ...requestInit } = init ?? {};
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(requestInit.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...requestInit.headers,
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : { error: (await response.text()).trim() };

    // 401 means the shared session is gone; 403 means it is valid but lacks a
    // permission — only the former should tear the session down, otherwise a
    // single forbidden action would log the user out.
    if (response.status === 401 && !suppressAuthFailure) {
      window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT));
    }

    const endpoint = `${new URL(API_BASE_URL).pathname}${path}`;
    throw new ApiError(
      payload.error ||
        `La API respondió ${response.status} en ${endpoint}. Verifica que el backend esté actualizado.`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
