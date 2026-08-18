import { getSigDeskToken } from './authToken';
import { AUTH_FAILURE_EVENT } from './sigtoolsClient';

// Behind Kong (ADR-0016/RIG-01): the gateway proxies bare paths — /me,
// /admin, /tickets, etc. — with no /v1 or /api prefix (kong.yml,
// strip_path: false; route versioning is RIG-02, still pending). The
// gateway's dev proxy port is 8000 (compose.override.yaml), not
// tickets_service's own 8080 — hitting a service directly would skip Kong
// entirely.
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:8000'
).replace(/\/$/, '');

/**
 * Session credential for SIG-DESK's own API (organization_service and
 * whatever else lives behind Kong) — the short-lived JWT minted by
 * `POST /v1/session` (ADR-0017 decisión 3), NOT the SIGTools token. This API
 * verifies the signature itself against its own `JWT_SECRET`; a SIGTools
 * token would never validate here, since SIGTools never signed it.
 */
export function authHeaders(): Record<string, string> {
  const token = getSigDeskToken();
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
    // Real envelope (organization_service, tickets_service adapters/in):
    // { error_code, message }. `error` is kept as a fallback for any
    // endpoint that still returns the older ad hoc shape.
    const payload: { error_code?: string; message?: string; error?: string } =
      contentType.includes('application/json')
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
      payload.message ||
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
