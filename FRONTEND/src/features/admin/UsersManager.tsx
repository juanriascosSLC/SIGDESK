import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Search,
  Users as UsersIcon,
  KeyRound,
  Info,
  Loader2,
  Check,
  Plus,
  Trash2,
  Lock,
} from 'lucide-react';
import {
  rbacService,
  type KnownUser,
  type PermissionCatalogEntry,
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
  const { isAdmin, can } = useAuth();
  const [tab, setTab] = useState<'roles' | 'users'>('roles');

  if (!isAdmin && !can('sigdesk.admin.roles')) {
    return (
      <EmptyState
        title="Sin acceso a la administración"
        description="Necesitas el permiso de gestión de roles para entrar aquí."
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
          en cuanto entran por primera vez.
        </p>
      </div>

      <div className="flex items-center gap-1 bg-surface-container-low border border-border/50 rounded-xl p-1 w-fit">
        {([
          { id: 'roles' as const, label: 'Roles y permisos', icon: KeyRound },
          { id: 'users' as const, label: 'Usuarios', icon: UsersIcon },
        ]).map(({ id, label, icon: Icon }) => (
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

      {tab === 'roles' ? <RolesTab /> : <UsersTab />}
    </div>
  );
}

function RolesTab() {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const rolesQuery = useQuery({ queryKey: ['rbac', 'roles'], queryFn: rbacService.listRoles });
  const catalogQuery = useQuery({
    queryKey: ['rbac', 'permissions'],
    queryFn: rbacService.listPermissionCatalog,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['rbac'] });
  };

  const savePermissions = useMutation({
    mutationFn: ({ roleId, keys }: { roleId: string; keys: string[] }) =>
      rbacService.setRolePermissions(roleId, keys),
    onSuccess: invalidate,
  });
  const createRole = useMutation({
    mutationFn: (input: { name: string; label: string; description: string }) =>
      rbacService.createRole({ ...input, permissionKeys: [] }),
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

  const byCategory = useMemo(() => {
    const groups = new Map<string, PermissionCatalogEntry[]>();
    for (const entry of catalogQuery.data ?? []) {
      groups.set(entry.category, [...(groups.get(entry.category) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [catalogQuery.data]);

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

  const grantedKeys = new Set(selectedRole?.permissions ?? []);

  function togglePermission(key: string) {
    if (!selectedRole) return;
    const next = new Set(grantedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    savePermissions.mutate({ roleId: selectedRole.id, keys: [...next] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      <div className="space-y-3 h-fit">
        <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 bg-surface-container/50 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-on-surface-variant">
              Roles ({roles.length})
            </h2>
            <button
              onClick={() => setIsCreating((value) => !value)}
              className="text-cyan-400 hover:text-cyan-300 transition-colors"
              title="Crear rol"
            >
              <Plus className="w-4 h-4" />
            </button>
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

        {isCreating && (
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
              <h2 className="font-bold text-on-surface flex items-center gap-2">
                {selectedRole.label}
                {selectedRole.isSystem && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-purple-400">
                    <Lock className="w-3 h-3" /> sistema
                  </span>
                )}
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                <span className="font-mono">{selectedRole.name}</span> ·{' '}
                {selectedRole.permissions.length} permiso(s) · {selectedRole.userCount} usuario(s)
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {savePermissions.isPending && (
                <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />
              )}
              {!selectedRole.isSystem && (
                <button
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el rol "${selectedRole.label}"? Se revocará de todos sus usuarios.`)) {
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

          {selectedRole.name === 'admin' && (
            <div className="px-6 py-3 bg-purple-500/5 border-b border-border/40">
              <p className="text-xs text-on-surface-variant">
                El rol <strong className="text-on-surface">admin</strong> omite todas las
                verificaciones, así que estas casillas son informativas.
              </p>
            </div>
          )}
          {(savePermissions.isError || deleteRole.isError) && (
            <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20">
              <p className="text-xs text-red-300">
                {(savePermissions.error ?? deleteRole.error) instanceof Error
                  ? (savePermissions.error ?? deleteRole.error)!.message
                  : 'No se pudo guardar el cambio.'}
              </p>
            </div>
          )}

          <div className="divide-y divide-border/20">
            {byCategory.map(([category, entries]) => (
              <div key={category} className="p-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-3">
                  {category}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {entries.map((entry) => {
                    const isGranted = grantedKeys.has(entry.key);
                    return (
                      <label
                        key={entry.key}
                        className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${
                          isGranted
                            ? 'bg-cyan-500/10 border-cyan-500/30'
                            : 'bg-surface-container border-border/40 hover:border-cyan-500/20'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            isGranted ? 'bg-cyan-400 border-cyan-400' : 'border-border'
                          }`}
                        >
                          {isGranted && <Check className="w-3 h-3 text-slate-950" />}
                        </span>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={isGranted}
                          disabled={savePermissions.isPending}
                          onChange={() => togglePermission(entry.key)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-on-surface">{entry.label}</span>
                          <span className="block text-[10px] font-mono text-on-surface-variant truncate">
                            {entry.key}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
      <div className="flex items-center gap-2">
        {role.name === 'admin' && <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
        <span className={`text-sm font-bold ${isActive ? 'text-primary' : 'text-on-surface'}`}>
          {role.label}
        </span>
      </div>
      <p className="text-[10px] font-mono text-on-surface-variant mt-0.5">
        {role.name} · {role.permissions.length}p · {role.userCount}u
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
  onSubmit: (input: { name: string; label: string; description: string }) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, label, description });
      }}
      className="bg-surface-container-low border border-cyan-500/30 rounded-3xl p-5 space-y-3"
    >
      <h3 className="text-xs font-black uppercase tracking-wider text-on-surface-variant">
        Nuevo rol
      </h3>
      <input
        value={label}
        onChange={(event) => {
          setLabel(event.target.value);
          // Suggest a technical name from the label so the user does not have
          // to know the naming rules, while still being able to override it.
          setName(
            event.target.value
              .toLowerCase()
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, '')
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_+|_+$/g, ''),
          );
        }}
        placeholder="Nombre visible (ej. Aprobador CAB)"
        required
        className="w-full bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-2 text-on-surface outline-none focus:border-cyan-500/50"
      />
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="clave_tecnica"
        required
        className="w-full bg-surface-container border border-border/50 text-xs font-mono rounded-lg px-3 py-2 text-on-surface outline-none focus:border-cyan-500/50"
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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const usersQuery = useQuery({ queryKey: ['rbac', 'users'], queryFn: rbacService.listUsers });
  const rolesQuery = useQuery({ queryKey: ['rbac', 'roles'], queryFn: rbacService.listRoles });

  const setUserRoles = useMutation({
    mutationFn: ({ username, roleIds }: { username: string; roleIds: string[] }) =>
      rbacService.setUserRoles(username, roleIds),
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

  if (usersQuery.isLoading || rolesQuery.isLoading) return <LoadingSkeleton type="list" />;
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

      {setUserRoles.isError && (
        <p className="text-xs text-red-300">
          {setUserRoles.error instanceof Error ? setUserRoles.error.message : 'No se pudo guardar.'}
        </p>
      )}

      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface-container text-on-surface-variant border-b border-border/40">
            <tr>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">Usuario</th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">
                Roles en SIG-DESK
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
                isEditing={editing === user.username}
                isPending={setUserRoles.isPending}
                onEdit={() => setEditing(user.username)}
                onCancel={() => setEditing(null)}
                onSave={(roleIds) => setUserRoles.mutate({ username: user.username, roleIds })}
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
  isEditing,
  isPending,
  onEdit,
  onCancel,
  onSave,
}: {
  user: KnownUser;
  roles: Role[];
  isEditing: boolean;
  isPending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (roleIds: string[]) => void;
}) {
  const currentRoleIds = roles.filter((role) => user.roles.includes(role.name)).map((role) => role.id);
  const [draft, setDraft] = useState<string[]>(currentRoleIds);

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
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => {
              const checked = draft.includes(role.id);
              return (
                <label
                  key={role.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-bold transition-colors ${
                    checked
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-surface-container border-border/40 text-on-surface-variant hover:border-cyan-500/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={checked}
                    onChange={() =>
                      setDraft((current) =>
                        current.includes(role.id)
                          ? current.filter((id) => id !== role.id)
                          : [...current, role.id],
                      )
                    }
                  />
                  {checked && <Check className="w-3 h-3" />}
                  {role.label}
                </label>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.roles.length === 0 ? (
              <span className="text-xs italic text-on-surface-variant">
                sin roles — no puede operar
              </span>
            ) : (
              user.roles.map((roleName) => (
                <span
                  key={roleName}
                  className="inline-flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-md border border-border/50 text-[10px] font-bold text-on-surface uppercase tracking-wider"
                >
                  {roleName === 'admin' && <Shield className="w-3 h-3 text-purple-400" />}
                  {roleName}
                </span>
              ))
            )}
          </div>
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
              onClick={() => onSave(draft)}
              disabled={isPending}
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
            >
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setDraft(currentRoleIds);
              onEdit();
            }}
            className="text-xs font-bold text-cyan-500 hover:text-cyan-400"
          >
            Editar roles
          </button>
        )}
      </td>
    </tr>
  );
}
