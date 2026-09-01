import { createContext } from 'react';
import type { SigtoolsUser } from './auth.service';

export interface AuthState {
  user: SigtoolsUser | null;
  accessLevel: number | null;
  /**
   * SIG-DESK's own role assignment (organization_service, ADR-0017/TODO-088)
   * — singular, a user has at most one role in this application, never an
   * array. `null` means the identity is known to SIG-DESK (has signed in at
   * least once) but has not been provisioned with a role yet — a real,
   * expected state (`GET /admin/users` "tiene_usuario: false"), not an
   * error.
   */
  roleId: string | null;
  deskUserId: string | null;
  /**
   * Flat "entity:action:scope" grants decoded from the JWT by GET /me
   * (ADR-0017 decisión 5) — e.g. "usuarios:read:global". Never a role name:
   * the domain has no "this role bypasses every check" concept, so every
   * capability must show up here explicitly.
   */
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permissionKey: string) => boolean;
  /**
   * Real capability derived from granted organization_service permissions
   * over the roles/usuarios entities (see AuthProvider) — gates the Users &
   * Roles admin screen. Deliberately not a hardcoded role name/string.
   */
  canManageUsersAndRoles: boolean;
  /**
   * Real capability derived from a granted permission over the `tickets`
   * entity (see AuthProvider) — gates the ticket surfaces. Not the same as
   * `can(PERMISSIONS.ticketsView)`: that dotted key belongs to the shared
   * SIGTools registry and organization_service never emits it, so it can
   * never be true for a real role.
   */
  canViewTickets: boolean;
  /**
   * Capacidad real de buscar en el inventario (entidad `assets`, acción
   * `read`, con alcance distinto de `propio`) — gobierna el picker de sitios
   * y dispositivos del Catalog Builder en TODAS las audiencias, portal
   * incluido.
   *
   * Sustituye a la vieja restricción por ruta (`audienceKey === 'requester'`),
   * que no se podía relajar por usuario: el backend ya filtra por alcance en
   * la consulta, así que un solicitante con permiso ve exactamente los
   * equipos de su área y uno sin permiso sigue viendo el mensaje.
   */
  canSearchAssets: boolean;
  displayName: string;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
