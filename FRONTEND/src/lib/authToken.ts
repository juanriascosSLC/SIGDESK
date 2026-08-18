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

/**
 * SIG-DESK's OWN short-lived JWT (ADR-0017 decisión 3, `POST /v1/session`
 * on organization_service — see features/auth/session.service.ts). This is
 * a DIFFERENT credential than the SIGTools token above: different signer
 * (organization_service's own JWT_SECRET, not SIGTools'), different
 * audience (organization_service behind Kong, not SIGTools), and different
 * claims (role_id/permissions, ADR-0017 decisión 5 — re-verified locally by
 * every domain API, never a repository round-trip per request). Mixing the
 * two into one slot would mean SIG-DESK's own API is asked to verify a
 * token it never signed — that JWT never validates, and every caller
 * silently degrades to "known identity, no role" (the exact failure mode
 * this second slot exists to avoid).
 *
 * Separate sessionStorage key, same lifetime policy as the SIGTools token
 * above (gone when the tab closes, not persisted across restarts).
 */
const SIG_DESK_STORAGE_KEY = 'sig_desk_session_token';

let sigDeskToken: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem(SIG_DESK_STORAGE_KEY) : null;

export function getSigDeskToken(): string | null {
  return sigDeskToken;
}

export function setSigDeskToken(next: string | null): void {
  sigDeskToken = next;
  if (typeof window === 'undefined') return;
  if (next) sessionStorage.setItem(SIG_DESK_STORAGE_KEY, next);
  else sessionStorage.removeItem(SIG_DESK_STORAGE_KEY);
}
