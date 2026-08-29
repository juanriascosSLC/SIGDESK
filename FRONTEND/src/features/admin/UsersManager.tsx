import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Users as UsersIcon,
  KeyRound,
  Info,
  Loader2,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  rbacService,
  permissionKey,
  type KnownUser,
  type Permission,
  type PermissionCatalog,
  type Role,
} from './rbac.service';
import { useAuth, initialsOf } from '../auth/useAuth';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

/**
 * Roles and permissions — SIG-DESK's own.
 *
 * Accounts are provisioned on the corporate platform (Active Directory +
 * SIGTools) and shared with SIGInstallations and SIGInventory, so this screen
 * cannot create, delete or reset users. What it does own is authorization: the
 * roles this application defines and what each one may do here.
 */
export default function UsersManager() {
  const { can, canManageUsersAndRoles } = useAuth();
  const canReadRoles = can('roles:read');
  const canReadUsers = can('usuarios:read');
  const [tab, setTab] = useState<'roles' | 'users'>(canReadRoles ? 'roles' : 'users');

  if (!canManageUsersAndRoles) {
    return (
      <EmptyState
        title="Sin acceso a la administración"
        description="Necesitas un permiso sobre roles o usuarios para entrar aquí."
      />
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-black text-on-surface">Roles y Permisos</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Roles propios de SIG-DESK. Las cuentas se administran en la plataforma corporativa.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="text-xs text-on-surface-variant leading-relaxed">
          El <strong className="text-on-surface">inicio de sesión</strong> es compartido con
          SIGInstallations y SIGInventory (Active Directory), pero estos roles y permisos son
          exclusivos de SIG-DESK y viven en su propia base de datos. Los usuarios aparecen aquí
          en cuanto entran por primera vez, aunque todavía no tengan rol asignado.
        </p>
      </div>

      <div className="flex items-center gap-1 bg-surface-container-low border border-border/50 rounded-xl p-1 w-fit">
        {([
          { id: 'roles' as const, label: 'Roles y permisos', icon: KeyRound },
          { id: 'users' as const, label: 'Usuarios', icon: UsersIcon },
        ])
          .filter(({ id }) => (id === 'roles' ? canReadRoles : canReadUsers))
          .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === id
                  ? 'bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
      </div>

      {tab === 'roles' && canReadRoles ? <RolesTab /> : canReadUsers ? <UsersTab /> : null}
    </div>
  );
}

function RolesTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const canCreateRole = can('roles:create');
  const canUpdateRole = can('roles:update');
  const canDeleteRole = can('roles:delete');

  const rolesQuery = useQuery({ queryKey: ['rbac', 'roles'], queryFn: rbacService.listRoles });
  const catalogQuery = useQuery({
    queryKey: ['rbac', 'permissions'],
    queryFn: rbacService.listPermissionCatalog,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['rbac'] });
  };

  const savePermissions = useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: string; permissions: Permission[] }) =>
      rbacService.setRolePermissions(roleId, permissions),
    onSuccess: invalidate,
  });
  const createRole = useMutation({
    mutationFn: (input: { name: string; description: string }) => rbacService.createRole(input),
    onSuccess: (role) => {
      invalidate();
      setSelectedRoleId(role.id);
      setIsCreating(false);
    },
  });
  const deleteRole = useMutation({
    mutationFn: (roleId: string) => rbacService.deleteRole(roleId),
    onSuccess: () => {
      invalidate();
      setSelectedRoleId(null);
    },
  });

  const roles = rolesQuery.data ?? [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;
  const catalog: PermissionCatalog = catalogQuery.data ?? { entities: [], actions: [], scopes: [] };

  if (rolesQuery.isLoading || catalogQuery.isLoading) return <LoadingSkeleton type="list" />;
  if (rolesQuery.isError || catalogQuery.isError) {
    const error = rolesQuery.error ?? catalogQuery.error;
    return (
      <EmptyState
        title="No se pudieron cargar los roles"
        description={error instanceof Error ? error.message : 'Error desconocido'}
        action={
          <button
            onClick={() => {
              void rolesQuery.refetch();
              void catalogQuery.refetch();
            }}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold"
          >
            Reintentar
          </button>
        }
      />
    );
  }

  const grantedKeys = new Set((selectedRole?.permissions ?? []).map(permissionKey));

  function togglePermission(entity: string, action: Permission['action'], scope: Permission['scope']) {
    if (!selectedRole) return;
    const key = permissionKey({ entity, action, scope });
    const next = grantedKeys.has(key)
      ? selectedRole.permissions.filter((p) => permissionKey(p) !== key)
      : [...selectedRole.permissions, { entity, action, scope }];
    savePermissions.mutate({ roleId: selectedRole.id, permissions: next });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      <div className="space-y-3 h-fit">
        <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 bg-surface-container/50 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-on-surface-variant">
              Roles ({roles.length})
            </h2>
            {canCreateRole && (
              <button
                onClick={() => setIsCreating((value) => !value)}
                className="text-cyan-400 hover:text-cyan-300 transition-colors"
                title="Crear rol"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="p-2 space-y-1">
            {roles.map((role) => (
              <RoleListItem
                key={role.id}
                role={role}
                isActive={selectedRole?.id === role.id}
                onSelect={() => setSelectedRoleId(role.id)}
              />
            ))}
          </div>
        </div>

        {canCreateRole && isCreating && (
          <CreateRoleForm
            onCancel={() => setIsCreating(false)}
            onSubmit={(input) => createRole.mutate(input)}
            isPending={createRole.isPending}
            error={createRole.error instanceof Error ? createRole.error.message : null}
          />
        )}
      </div>

      {!selectedRole ? (
        <EmptyState title="Sin roles" description="Crea el primer rol para empezar." />
      ) : (
        <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/40 bg-surface-container/50 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-bold text-on-surface">{selectedRole.name}</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {selectedRole.description || 'Sin descripción'} ·{' '}
                {selectedRole.permissions.length} permiso(s)
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {savePermissions.isPending && (
                <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />
              )}
              {canDeleteRole && (
                <button
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el rol "${selectedRole.name}"?`)) {
                      deleteRole.mutate(selectedRole.id);
                    }
                  }}
                  className="text-on-surface-variant hover:text-red-400 transition-colors"
                  title="Eliminar rol"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {(savePermissions.isError || deleteRole.isError) && (
            <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20">
              <p className="text-xs text-red-300">
                {/* A role still assigned to a user can't be deleted — the
                    backend answers 409 ROL_EN_USO for that, surfaced here as
                    any other error rather than a pre-emptive client-side flag. */}
                {(savePermissions.error ?? deleteRole.error) instanceof Error
                  ? (savePermissions.error ?? deleteRole.error)!.message
                  : 'No se pudo guardar el cambio.'}
              </p>
            </div>
          )}

          {catalog.entities.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Todavía no hay entidades con permisos"
                description="El catálogo se llena con las entidades que ya tienen al menos un permiso otorgado en algún rol (ver el runbook de bootstrap del primer admin)."
              />
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {catalog.entities.map((entity) => (
                <div key={entity} className="p-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-3">
                    {entity}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="text-sm">
                      <thead>
                        <tr>
                          <th className="text-left pr-4 pb-2 text-[10px] font-bold uppercase text-on-surface-variant">
                            Acción \ Alcance
                          </th>
                          {catalog.scopes.map((scope) => (
                            <th
                              key={scope}
                              className="px-3 pb-2 text-[10px] font-bold uppercase text-on-surface-variant"
                            >
                              {scope}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {catalog.actions.map((action) => (
                          <tr key={action}>
                            <td className="pr-4 py-1.5 text-xs font-mono text-on-surface-variant">
                              {action}
                            </td>
                            {catalog.scopes.map((scope) => {
                              const isGranted = grantedKeys.has(
                                permissionKey({ entity, action, scope }),
                              );
                              return (
                                <td key={scope} className="px-3 py-1.5 text-center">
                                  <label
                                    className={`inline-flex ${canUpdateRole ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="hidden"
                                      checked={isGranted}
                                      disabled={!canUpdateRole || savePermissions.isPending}
                                      onChange={() => togglePermission(entity, action, scope)}
                                    />
                                    <span
                                      className={`w-5 h-5 rounded flex items-center justify-center border ${
                                        isGranted
                                          ? 'bg-cyan-400 border-cyan-400'
                                          : 'border-border hover:border-cyan-500/40'
                                      }`}
                                    >
                                      {isGranted && <Check className="w-3 h-3 text-slate-950" />}
                                    </span>
                                  </label>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoleListItem({
  role,
  isActive,
  onSelect,
}: {
  role: Role;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
        isActive ? 'bg-primary/15 border border-primary/30' : 'hover:bg-surface-container border border-transparent'
      }`}
    >
      <span className={`text-sm font-bold ${isActive ? 'text-primary' : 'text-on-surface'}`}>
        {role.name}
      </span>
      <p className="text-[10px] font-mono text-on-surface-variant mt-0.5">
        {role.permissions.length} permiso(s)
      </p>
    </button>
  );
}

function CreateRoleForm({
  onCancel,
  onSubmit,
  isPending,
  error,
}: {
  onCancel: () => void;
  onSubmit: (input: { name: string; description: string }) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, description });
      }}
      className="bg-surface-container-low border border-cyan-500/30 rounded-3xl p-5 space-y-3"
    >
      <h3 className="text-xs font-black uppercase tracking-wider text-on-surface-variant">
        Nuevo rol
      </h3>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nombre (ej. Aprobador CAB)"
        required
        className="w-full bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-2 text-on-surface outline-none focus:border-cyan-500/50"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        placeholder="¿Para qué sirve este rol?"
        className="w-full bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-2 text-on-surface outline-none focus:border-cyan-500/50 resize-none"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-on-surface/5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
        >
          {isPending ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </form>
  );
}

function UsersTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const canReadRoles = can('roles:read');
  const canAssignRoles = can('usuarios:update') && canReadRoles;

  const usersQuery = useQuery({ queryKey: ['rbac', 'users'], queryFn: rbacService.listUsers });
  const rolesQuery = useQuery({
    queryKey: ['rbac', 'roles'],
    queryFn: rbacService.listRoles,
    enabled: canReadRoles,
  });

  const setUserRole = useMutation({
    mutationFn: ({ username, roleId }: { username: string; roleId: string }) =>
      rbacService.setUserRole(username, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rbac'] });
      setEditing(null);
    },
  });

  const roles = rolesQuery.data ?? [];
  const users = useMemo(() => {
    const term = search.toLowerCase().trim();
    const all = usersQuery.data ?? [];
    if (!term) return all;
    return all.filter((user) =>
      `${user.username} ${user.displayName} ${user.email}`.toLowerCase().includes(term),
    );
  }, [usersQuery.data, search]);

  if (usersQuery.isLoading || (canReadRoles && rolesQuery.isLoading)) {
    return <LoadingSkeleton type="list" />;
  }
  if (usersQuery.isError) {
    return (
      <EmptyState
        title="No se pudo cargar la lista de usuarios"
        description={usersQuery.error instanceof Error ? usersQuery.error.message : 'Error desconocido'}
        action={
          <button
            onClick={() => void usersQuery.refetch()}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold"
          >
            Reintentar
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por usuario, nombre o correo…"
          className="w-full bg-surface-container border border-border/50 text-sm rounded-lg pl-10 pr-4 py-2 text-on-surface outline-none focus:border-cyan-500/50"
        />
      </div>

      {setUserRole.isError && (
        <p className="text-xs text-red-300">
          {setUserRole.error instanceof Error ? setUserRole.error.message : 'No se pudo guardar.'}
        </p>
      )}

      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface-container text-on-surface-variant border-b border-border/40">
            <tr>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">Usuario</th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">
                Rol en SIG-DESK
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {users.map((user) => (
              <UserRow
                key={user.username}
                user={user}
                roles={roles}
                canEdit={canAssignRoles}
                isEditing={editing === user.username}
                isPending={setUserRole.isPending}
                onEdit={() => setEditing(user.username)}
                onCancel={() => setEditing(null)}
                onSave={(roleId) => setUserRole.mutate({ username: user.username, roleId })}
              />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-on-surface-variant italic">
                  {search
                    ? 'Ningún usuario coincide con la búsqueda.'
                    : 'Todavía nadie ha iniciado sesión en SIG-DESK.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  user,
  roles,
  canEdit,
  isEditing,
  isPending,
  onEdit,
  onCancel,
  onSave,
}: {
  user: KnownUser;
  roles: Role[];
  canEdit: boolean;
  isEditing: boolean;
  isPending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (roleId: string) => void;
}) {
  const currentRole = roles.find((role) => role.id === user.roleId) ?? null;
  const [draftRoleId, setDraftRoleId] = useState<string>(user.roleId ?? roles[0]?.id ?? '');

  // Known identity, never provisioned in SIG-DESK: PUT .../roles would 404
  // (ADR-0017 decisión 4 — provisioning needs a company assignment this
  // screen doesn't collect yet), so this row can only be observed, not
  // edited, until that separate flow exists.
  if (!user.hasAccount) {
    return (
      <tr className="align-top">
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-container-high border border-border/50 flex items-center justify-center text-on-surface font-bold text-xs shrink-0">
              {initialsOf(user.displayName || user.username)}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-on-surface truncate">
                {user.displayName || user.username}
              </p>
              <p className="text-xs font-mono text-on-surface-variant truncate">{user.username}</p>
            </div>
          </div>
        </td>
        <td className="px-6 py-4" colSpan={2}>
          <span className="text-xs italic text-on-surface-variant">
            identidad conocida, sin cuenta en SIG-DESK todavía — no puede operar
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-surface-container/50 transition-colors align-top">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-container-high border border-border/50 flex items-center justify-center text-on-surface font-bold text-xs shrink-0">
            {initialsOf(user.displayName || user.username)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-on-surface truncate">
              {user.displayName || user.username}
            </p>
            <p className="text-xs font-mono text-on-surface-variant truncate">{user.username}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        {isEditing ? (
          <select
            value={draftRoleId}
            onChange={(event) => setDraftRoleId(event.target.value)}
            className="bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-1.5 text-on-surface outline-none focus:border-cyan-500/50"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        ) : currentRole ? (
          <span className="inline-flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-md border border-border/50 text-[10px] font-bold text-on-surface uppercase tracking-wider">
            {currentRole.name}
          </span>
        ) : user.roleId ? (
          <span className="text-xs font-mono text-on-surface-variant">{user.roleId}</span>
        ) : (
          <span className="text-xs italic text-on-surface-variant">
            sin rol asignado — no puede operar
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-right whitespace-nowrap">
        {isEditing ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="text-xs font-bold text-on-surface-variant hover:text-on-surface"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave(draftRoleId)}
              disabled={isPending || !draftRoleId}
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
            >
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        ) : canEdit ? (
          <button
            onClick={() => {
              setDraftRoleId(user.roleId ?? roles[0]?.id ?? '');
              onEdit();
            }}
            disabled={roles.length === 0}
            className="text-xs font-bold text-cyan-500 hover:text-cyan-400 disabled:opacity-50 disabled:text-on-surface-variant"
          >
            {user.roleId ? 'Cambiar rol' : 'Asignar rol'}
          </button>
        ) : (
          <span className="text-xs text-on-surface-variant">Solo lectura</span>
        )}
      </td>
    </tr>
  );
}
