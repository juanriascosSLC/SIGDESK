/**
 * rbac.service.ts
 * Roles and permissions administration — against SIG-DESK's own API.
 *
 * Deliberately NOT SIGTools: authentication is shared company-wide (same
 * Active Directory account as SIGInstallations and SIGInventory), but what a
 * person may do inside SIG-DESK is this application's own decision, stored in
 * its own database. Reusing the shared registry would have meant inheriting
 * roles like designer / field_tech / inventory_op and writing service-desk
 * permissions into another module's tables — its admin endpoints are even
 * namespaced under /installations/.
 */
import { apiRequest } from '@/lib/apiClient';

export interface PermissionCatalogEntry {
  key: string;
  label: string;
  category: string;
  app: string;
}

export interface Role {
  id: string;
  name: string;
  label: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
  createdAt: string;
}

export interface KnownUser {
  username: string;
  displayName: string;
  email: string;
  lastSeenAt: string;
  roles: string[];
}

export const rbacService = {
  /** The permission keys SIG-DESK defines and enforces. Comes from the backend
   *  so the screen can never offer a key the routes do not check. */
  listPermissionCatalog: async (): Promise<PermissionCatalogEntry[]> => {
    const response = await apiRequest<{ items: PermissionCatalogEntry[] }>('/admin/permissions');
    return response.items;
  },

  listRoles: async (): Promise<Role[]> => {
    const response = await apiRequest<{ items: Role[] }>('/admin/roles');
    return response.items;
  },

  createRole: (input: {
    name: string;
    label: string;
    description: string;
    permissionKeys: string[];
  }): Promise<Role> =>
    apiRequest<Role>('/admin/roles', { method: 'POST', body: JSON.stringify(input) }),

  updateRole: (
    roleId: string,
    input: { name: string; label: string; description: string },
  ): Promise<Role> =>
    apiRequest<Role>(`/admin/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...input, permissionKeys: [] }),
    }),

  deleteRole: (roleId: string): Promise<void> =>
    apiRequest<void>(`/admin/roles/${roleId}`, { method: 'DELETE' }),

  /** Replaces the role's grants with exactly these keys. */
  setRolePermissions: (roleId: string, permissionKeys: string[]): Promise<Role> =>
    apiRequest<Role>(`/admin/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionKeys }),
    }),

  /** People who have signed in to SIG-DESK, plus anyone already granted a role.
   *  Accounts themselves live in Active Directory — this app never creates or
   *  deletes them. */
  listUsers: async (): Promise<KnownUser[]> => {
    const response = await apiRequest<{ items: KnownUser[] }>('/admin/users');
    return response.items;
  },

  setUserRoles: (username: string, roleIds: string[]): Promise<void> =>
    apiRequest<void>(`/admin/users/${encodeURIComponent(username)}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    }),
};
