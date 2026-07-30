/**
 * HTTP client for SIGTools, the company-wide auth service shared with
 * SIGInstallations and SIGInventory. Deliberately mirrors their apiClient so
 * all three apps behave identically against the same backend.
 *
 * Two base paths:
 *   sigtoolsFetch     → {SIGTOOLS_URL}/api/v1/...            (admin: users, roles, permissions)
 *   sigtoolsFetchAuth → {SIGTOOLS_URL}/api/v1/web-auth/...    (login, logout, me)
 *
 * Every request sends `credentials: 'include'` so the browser attaches the
 * HttpOnly sig_token cookie, plus the bearer fallback for cross-origin calls.
 */
import { getAccessToken } from './authToken';

export const SIGTOOLS_BASE_URL = (
  import.meta.env.VITE_SIGTOOLS_API_URL || 'http://api.sig.systems:8091'
).replace(/\/$/, '');

export class SigtoolsError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'SigtoolsError';
    this.status = status;
    this.data = data;
  }
}

/** Broadcast when any protected call is rejected, so the auth provider can
 *  clear the session once instead of every screen handling it. */
export const AUTH_FAILURE_EVENT = 'sig:auth-failure';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_TIMEOUT_MS = 15_000;

/** Django expects the csrftoken cookie echoed back in a header on unsafe
 *  methods. That cookie is readable (not HttpOnly) by design. */
function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => '');
  return text ? { detail: text.trim() } : {};
}

async function request<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number },
  dispatchAuthFailure: boolean,
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const token = getAccessToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(UNSAFE_METHODS.has(method) && csrfToken() ? { 'X-CSRFToken': csrfToken()! } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const { timeoutMs, signal, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      credentials: 'include',
      headers,
      signal: signal ?? controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new SigtoolsError('El servidor de autenticación tardó demasiado en responder.', 408, null);
    }
    throw new SigtoolsError(
      'No se pudo contactar al servidor de autenticación. Revisa tu conexión.',
      0,
      null,
    );
  }
  clearTimeout(timer);

  if (response.status === 204) return undefined as T;

  if (response.status === 401 || response.status === 403) {
    const data = await parseBody(response);
    if (dispatchAuthFailure) {
      window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT));
    }
    throw new SigtoolsError(
      (data as { detail?: string })?.detail ?? 'Tu sesión expiró.',
      response.status,
      data,
    );
  }

  const data = await parseBody(response);
  if (!response.ok) {
    throw new SigtoolsError(
      (data as { detail?: string })?.detail ?? `HTTP ${response.status}`,
      response.status,
      data,
    );
  }
  return data as T;
}

/** Admin and data endpoints. A rejection here means the session died, so it
 *  raises sig:auth-failure. */
export function sigtoolsFetch<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  return request<T>(`${SIGTOOLS_BASE_URL}/api/v1${path}`, options, true);
}

/** Auth endpoints. A 401 from /login/ just means wrong credentials, and a 401
 *  from /me/ is the normal "not signed in yet" answer — neither should trigger
 *  a session-expired cascade, so these never dispatch the event. */
export function sigtoolsFetchAuth<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  return request<T>(`${SIGTOOLS_BASE_URL}/api/v1/web-auth${path}`, options, false);
}
