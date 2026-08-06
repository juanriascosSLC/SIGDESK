/**
 * Bearer-token fallback for the SIGTools session, mirroring what
 * SIGInstallations does.
 *
 * Two reasons SIG-DESK needs it rather than relying on the cookie alone:
 *   1. The sig_token cookie is HttpOnly and scoped to the auth service's own
 *      domain, so it cannot travel to SIG-DESK's API on another origin.
 *   2. SameSite=Lax keeps it off cross-site fetches anyway.
 * The backends accept the cookie first and this header as a fallback, so
 * attaching it is always safe.
 *
 * sessionStorage (never localStorage) per the backend team's guidance:
 * survives a refresh, gone when the tab closes.
 */
const STORAGE_KEY = 'sig_access_token';

let token: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;

export function getAccessToken(): string | null {
  return token;
}

export function setAccessToken(next: string | null): void {
  token = next;
  if (typeof window === 'undefined') return;
  if (next) sessionStorage.setItem(STORAGE_KEY, next);
  else sessionStorage.removeItem(STORAGE_KEY);
}
