import { ApiError } from './apiClient';

export type ErrorKind = 'offline' | 'session_expired' | 'permission_denied' | 'not_found' | 'validation' | 'server' | 'unknown';

export interface DescribedError {
  kind: ErrorKind;
  /** Short, human title — safe to show as a toast heading or ErrorState title. */
  title: string;
  /** One actionable sentence. Never the raw error object, a stack trace, or
   *  a full response body — see the module doc below. */
  description: string;
}

/**
 * Turns a caught error into copy a person can act on, for toasts and
 * `ErrorState`. Deliberately narrow about what it will surface:
 *
 * - A `fetch` failure (network down, CORS, DNS) throws a plain `TypeError`
 *   with no `status` — that's the "offline/unreachable" case.
 * - `ApiError` carries a `message` that the BACKEND already curated for
 *   display (adapters/in returns `{error_code, message}` — never a stack
 *   trace or raw exception text), so it's safe to show as-is. This function
 *   never reads `err.stack`, headers, or any other field that could carry a
 *   token or internal detail.
 * - Anything else (a bug in our own code) falls back to a generic message —
 *   NOT the raw `String(err)`, which could be anything.
 */
export function describeError(err: unknown, fallbackContext?: string): DescribedError {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return {
          kind: 'session_expired',
          title: 'Your session has expired',
          description: 'Sign in again to continue.',
        };
      case 403:
        return {
          kind: 'permission_denied',
          title: "You don't have permission to do this",
          description: err.message || 'Contact an administrator if you believe this is a mistake.',
        };
      case 404:
        return {
          kind: 'not_found',
          title: 'Not found',
          description: err.message || "This item doesn't exist or was removed.",
        };
      case 409:
      case 422:
        return {
          kind: 'validation',
          title: "That couldn't be completed",
          description: err.message || 'Check the values and try again.',
        };
      default:
        if (err.status >= 500 || err.status === 0) {
          return {
            kind: 'server',
            title: 'Service temporarily unavailable',
            description: 'Something went wrong on our end. Please try again in a moment.',
          };
        }
        return {
          kind: 'unknown',
          title: fallbackContext ?? 'Something went wrong',
          description: err.message || 'Please try again.',
        };
    }
  }

  if (err instanceof TypeError) {
    // fetch() throws a bare TypeError for network failures — no `status`,
    // no server response at all.
    return {
      kind: 'offline',
      title: "We couldn't reach the server",
      description: 'Check your connection and try again.',
    };
  }

  return {
    kind: 'unknown',
    title: fallbackContext ?? 'Something went wrong',
    description: 'Please try again. If this keeps happening, contact your administrator.',
  };
}
