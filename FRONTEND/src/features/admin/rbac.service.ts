/**
 * rbac.service.ts
 * Roles and permissions administration — against SIG-DESK's own API
 * (organization_service, behind the Gateway).
 *
 * Deliberately NOT SIGTools: authentication is shared company-wide (same
 * Active Directory account as SIGInstallations and SIGInventory), but what a
 * person may do inside SIG-DESK is this application's own decision, stored in
 * its own database. Reusing the shared registry would have meant inheriting
 * roles like designer / field_tech / inventory_op and writing service-desk
 * permissions into another module's tables — its admin endpoints are even
 * namespaced under /installations/.
 *
 * Wire shapes below (Rol/AdminUsuario/CatalogoPermisos DTOs) mirror
 * organization_service/adapters/in/dto.go field-for-field, including its
 * Spanish/snake_case naming — that's the real, current contract (TODO-089),
 * not the English shape this file used to assume before it was connected.
 * The mapping to/from that wire shape stays contained to this module so the
 * rest of the frontend keeps working with a clean, typed domain shape.
 */
import { apiRequest } from '@/lib/apiClient';

/** Fixed enums from organization_service's domain (domain/rol.go) — not a
 *  taxonomy invented on the frontend. */
export type PermissionAction = 'create' | 'read' | 'update' | 'delete';
export type PermissionScope = 'propio' | 'equipo' | 'depto' | 'global';

export interface Permission {
  entity: string;
  action: PermissionAction;
  scope: PermissionScope;
}

/** The flat "entity:action:scope" string organization_service uses on the
 *  wire for PUT /admin/roles/{id}/permissions — same format as the
 *  permissions GET /me returns. */
export function permissionKey(permission: Permission): string {
  return `${permission.entity}:${permission.action}:${permission.scope}`;
}

/** The backend publishes the complete, deterministic permission vocabulary;
 *  a fresh installation offers the same entities even before custom roles
 *  have been created. */
export interface PermissionCatalog {
  entities: string[];
  actions: PermissionAction[];
  scopes: PermissionScope[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface KnownUser {
  /** Internal Organization user id; null until access is provisioned. */
  id: string | null;
  username: string;
  displayName: string;
  email: string;
  /** null when SIG-DESK has never seen this identity log in. */
  lastSeenAt: string | null;
  /**
   * SIG-DESK's own role — singular (TODO-088). `null` means this is a known
   * identity (registered in identidades_conocidas the moment they first
   * signed in) with no `Usuario` provisioned yet — not an error state, see
   * `hasAccount`.
   */
  roleId: string | null;
  /** Current company/department/team snapshot in Organization. */
  companyId: string | null;
  /** False for an identity that only ever reached the login screen — no
   *  organization_service Usuario exists for them yet, so
   *  PUT /admin/users/:username/roles would 404 (ADR-0017 decisión 4:
   *  provisioning is a separate, manual step from role assignment). */
  hasAccount: boolean;
}

export interface Company {
  id: string;
  name: string;
  type: 'empresa' | 'departamento' | 'equipo';
  parentId: string | null;
}

// --- Wire DTOs (organization_service/adapters/in/dto.go) -------------------

interface PermisoDTO {
  entidad: string;
  accion: PermissionAction;
  alcance: PermissionScope;
}

interface RolDTO {
  id: string;
  nombre: string;
  descripcion: string;
  permisos: PermisoDTO[];
}

function roleFromDTO(dto: RolDTO): Role {
  return {
    id: dto.id,
    name: dto.nombre,
    description: dto.descripcion,
    permissions: dto.permisos.map((p) => ({
      entity: p.entidad,
      action: p.accion,
      scope: p.alcance,
    })),
  };
}

interface AdminUsuarioDTO {
  username: string;
  usuario_id?: string;
  nombre: string;
  email: string;
  role_id?: string;
  company_id?: string;
  ultimo_acceso?: string;
  tiene_usuario: boolean;
}

interface CompanyDTO {
  id: string;
  nombre: string;
  tipo: Company['type'];
  parent_id?: string;
}

function companyFromDTO(dto: CompanyDTO): Company {
  return {
    id: dto.id,
    name: dto.nombre,
    type: dto.tipo,
    parentId: dto.parent_id || null,
  };
}

function knownUserFromDTO(dto: AdminUsuarioDTO): KnownUser {
  return {
    id: dto.usuario_id || null,
    username: dto.username,
    displayName: dto.nombre,
    email: dto.email,
    lastSeenAt: dto.ultimo_acceso ?? null,
    roleId: dto.role_id || null,
    companyId: dto.company_id || null,
    hasAccount: dto.tiene_usuario,
  };
}

interface CatalogoPermisosDTO {
  acciones: PermissionAction[];
  alcances: PermissionScope[];
  entidades: string[];
}

export const rbacService = {
  /** The permission vocabulary SIG-DESK's own roles can be granted. Comes
   *  from the backend so the screen can never offer a capability unknown to
   *  the current deployment. */
  listPermissionCatalog: async (): Promise<PermissionCatalog> => {
    const dto = await apiRequest<CatalogoPermisosDTO>('/admin/permissions');
    return { entities: dto.entidades, actions: dto.acciones, scopes: dto.alcances };
  },

  listRoles: async (): Promise<Role[]> => {
    const response = await apiRequest<{ items: RolDTO[] }>('/admin/roles');
    return response.items.map(roleFromDTO);
  },

  createRole: async (input: { name: string; description: string }): Promise<Role> => {
    const dto = await apiRequest<RolDTO>('/admin/roles', {
      method: 'POST',
      body: JSON.stringify({ nombre: input.name, descripcion: input.description }),
    });
    return roleFromDTO(dto);
  },

  updateRole: async (
    roleId: string,
    input: { name: string; description: string },
  ): Promise<Role> => {
    const dto = await apiRequest<RolDTO>(`/admin/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nombre: input.name, descripcion: input.description }),
    });
    return roleFromDTO(dto);
  },

  /** A role referenced by a Usuario can't be deleted — the backend answers
   *  409 ROL_EN_USO (FK on usuarios.role_id) instead of a client-side
   *  "system role" flag that doesn't exist in the domain. */
  deleteRole: (roleId: string): Promise<void> =>
    apiRequest<void>(`/admin/roles/${roleId}`, { method: 'DELETE' }),

  /** Replaces the role's grants with exactly these permissions. */
  setRolePermissions: async (roleId: string, permissions: Permission[]): Promise<Role> => {
    const dto = await apiRequest<RolDTO>(`/admin/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionKeys: permissions.map(permissionKey) }),
    });
    return roleFromDTO(dto);
  },

  /** People who have signed in to SIG-DESK, plus anyone already granted a
   *  role. Accounts themselves live in Active Directory — this app never
   *  creates or deletes them. */
  listUsers: async (): Promise<KnownUser[]> => {
    const response = await apiRequest<{ items: AdminUsuarioDTO[] }>('/admin/users');
    return response.items.map(knownUserFromDTO);
  },

  listCompanies: async (): Promise<Company[]> => {
    const response = await apiRequest<{ items: CompanyDTO[] }>('/admin/companies');
    return response.items.map(companyFromDTO);
  },

  createCompany: async (input: {
    name: string;
    type: Company['type'];
    parentId: string | null;
  }): Promise<Company> => {
    const dto = await apiRequest<CompanyDTO>('/companies', {
      method: 'POST',
      body: JSON.stringify({
        nombre: input.name,
        tipo: input.type,
        ...(input.parentId ? { parent_id: input.parentId } : {}),
      }),
    });
    return companyFromDTO(dto);
  },

  updateCompany: async (
    companyId: string,
    input: { name?: string; parentId?: string },
  ): Promise<Company> => {
    const dto = await apiRequest<CompanyDTO>(`/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(input.name ? { nombre: input.name } : {}),
        ...(input.parentId ? { parent_id: input.parentId } : {}),
      }),
    });
    return companyFromDTO(dto);
  },

  provisionUser: (
    username: string,
    input: { companyId: string; roleId: string },
  ): Promise<void> =>
    apiRequest<void>(`/admin/users/${encodeURIComponent(username)}/provision`, {
      method: 'POST',
      body: JSON.stringify({ company_id: input.companyId, role_id: input.roleId }),
    }),

  updateUser: (
    userId: string,
    input: { companyId: string; roleId: string },
  ): Promise<void> =>
    apiRequest<void>(`/usuarios/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ company_id: input.companyId, role_id: input.roleId }),
    }),

  /** TODO-088: one role per user, ratified as the authoritative model — the
   *  backend rejects a plural roleIds body. Requires the target to already
   *  have a provisioned Usuario (ErrUsuarioNoEncontrado / 404 otherwise);
   *  see `KnownUser.hasAccount`. */
  setUserRole: (username: string, roleId: string): Promise<void> =>
    apiRequest<void>(`/admin/users/${encodeURIComponent(username)}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ role_id: roleId }),
    }),
};
