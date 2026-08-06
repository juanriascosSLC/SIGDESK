/**
 * auth.service.ts
 * AUTHENTICATION against SIGTools, the company-wide backend shared with
 * SIGInstallations and SIGInventory.
 *
 * Credentials are Active Directory domain credentials; the sig_token HttpOnly
 * cookie is managed by the browser. SIG-DESK stores no passwords and does not
 * own the user record — users are provisioned on the shared platform.
 *
 * AUTHORIZATION is not here: SIG-DESK's roles and permissions are its own and
 * live in its own database. See features/admin/rbac.service.ts. Reusing the
 * shared registry would have meant inheriting SIGInstallations' roles
 * (designer, field_tech, inventory_op) and writing service-desk permissions
 * into another module's tables.
 */
import { sigtoolsFetchAuth, SigtoolsError } from '@/lib/sigtoolsClient';

export interface SigtoolsUser {
  id: number;
  name: string;
  email: string;
  username: string | null;
  roles?: string[];
  permissions?: string[];
}

export interface LoginResponse {
  user: SigtoolsUser;
  access_level: number;
  /** Present on newer deployments; required for SIG-DESK because its API
   *  lives on a different origin than the auth service, so the cookie alone
   *  cannot authenticate those calls. */
  access_token?: string;
}

export const authService = {
  login: (username: string, password: string): Promise<LoginResponse> =>
    sigtoolsFetchAuth<LoginResponse>('/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: async (): Promise<void> => {
    try {
      await sigtoolsFetchAuth<void>('/logout/', { method: 'POST' });
    } catch {
      // Ignored: the caller clears local state regardless, and a already-dead
      // session returning 401 here is not an error worth surfacing.
    }
  },

  /** Revokes every session of this user across all three apps. */
  logoutAll: async (): Promise<void> => {
    try {
      await sigtoolsFetchAuth<{ message: string }>('/logout-all/', { method: 'POST' });
    } catch {
      // Same rationale as logout.
    }
  },

  getMe: async (): Promise<SigtoolsUser | null> => {
    try {
      return await sigtoolsFetchAuth<SigtoolsUser>('/me/');
    } catch (error) {
      // 401 is the normal "no session" answer on a cold load, not a failure.
      if (
        error instanceof SigtoolsError &&
        [401, 403, 404].includes(error.status)
      ) {
        return null;
      }
      throw error;
    }
  },

};
