import { useMemo, useState, type FormEvent } from 'react';
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
  Building2,
} from 'lucide-react';
import {
  rbacService,
  permissionKey,
  type Company,
  type KnownUser,
  type Permission,
  type PermissionCatalog,
  type Role,
  type TestAgentInput,
} from './rbac.service';
import { useAuth, initialsOf } from '../auth/useAuth';
import { EmptyState, ErrorState, PermissionDeniedState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

/**
 * Roles and permissions — SIG-DESK's own.
 *
 * Accounts are provisioned on the corporate platform (Active Directory +
 * SIGTools) and shared with SIGInstallations and SIGInventory, so this screen
 * cannot delete or reset those identities. This screen owns their access to
 * SIG-DESK, its organization tree, roles and permissions.
 */
export default function UsersManager() {
  const { can, canManageUsersAndRoles } = useAuth();
  const canReadRoles = can('roles:read');
  const canReadUsers = can('usuarios:read');
  const canReadCompanies = can('companies:read');
  const [tab, setTab] = useState<'roles' | 'users' | 'organization'>(
    canReadRoles ? 'roles' : canReadUsers ? 'users' : 'organization',
  );

  if (!canManageUsersAndRoles && !canReadCompanies) {
    return (
      <PermissionDeniedState
        title="No access to administration"
        description="You need a permission over users, roles or organization to enter here."
      />
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-black text-on-surface">Users, roles and organization</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Control who has access, what they can do, and which unit they belong to within SIG-DESK.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="text-xs text-on-surface-variant leading-relaxed">
          <strong className="text-on-surface">Sign-in</strong> is shared with
          SIGInstallations and SIGInventory (Active Directory), but these roles and permissions are
          exclusive to SIG-DESK and live in its own database. Identities show up here
          the first time they sign in; an administrator decides when to grant them access, a role and a unit.
        </p>
      </div>

      <div className="flex items-center gap-1 bg-surface-container-low border border-border/50 rounded-xl p-1 w-fit">
        {([
          { id: 'roles' as const, label: 'Roles and permissions', icon: KeyRound },
          { id: 'users' as const, label: 'Users', icon: UsersIcon },
          { id: 'organization' as const, label: 'Organization', icon: Building2 },
        ])
          .filter(({ id }) =>
            id === 'roles' ? canReadRoles : id === 'users' ? canReadUsers : canReadCompanies,
          )
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

      {tab === 'roles' && canReadRoles ? (
        <RolesTab />
      ) : tab === 'users' && canReadUsers ? (
        <UsersTab />
      ) : canReadCompanies ? (
        <OrganizationTab />
      ) : null}
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
  const [showDeleteRoleDialog, setShowDeleteRoleDialog] = useState(false);
  const catalog: PermissionCatalog = catalogQuery.data ?? { entities: [], actions: [], scopes: [] };

  if (rolesQuery.isLoading || catalogQuery.isLoading) return <LoadingSkeleton type="list" />;
  if (rolesQuery.isError || catalogQuery.isError) {
    const error = rolesQuery.error ?? catalogQuery.error;
    return (
      <ErrorState
        title="We could not load the roles"
        description={error instanceof Error ? error.message : 'Unknown error'}
        retryLabel="Retry"
        onRetry={() => {
          void rolesQuery.refetch();
          void catalogQuery.refetch();
        }}
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
                title="Create role"
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
        <EmptyState title="No roles" description="Create the first role to get started." />
      ) : (
        <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/40 bg-surface-container/50 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-bold text-on-surface">{selectedRole.name}</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {selectedRole.description || 'No description'} ·{' '}
                {selectedRole.permissions.length} permission(s)
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {savePermissions.isPending && (
                <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />
              )}
              {canDeleteRole && (
                <button
                  onClick={() => setShowDeleteRoleDialog(true)}
                  className="text-on-surface-variant hover:text-red-400 transition-colors"
                  title="Delete role"
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
                  : 'The change could not be saved.'}
              </p>
            </div>
          )}

          {catalog.entities.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No entities with permissions yet"
                description="The catalog fills up with entities that already have at least one permission granted in some role (see the first-admin bootstrap runbook)."
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
                            Action \ Scope
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

      <ConfirmDialog
        open={showDeleteRoleDialog && selectedRole !== null}
        onClose={() => setShowDeleteRoleDialog(false)}
        onConfirm={() => {
          if (!selectedRole) return;
          setShowDeleteRoleDialog(false);
          deleteRole.mutate(selectedRole.id);
        }}
        title="Delete role"
        description={selectedRole ? `Delete the role "${selectedRole.name}"? This can't be undone.` : undefined}
        confirmLabel="Delete role"
        tone="destructive"
        loading={deleteRole.isPending}
      />
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
        New role
      </h3>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name (e.g. CAB Approver)"
        required
        className="w-full bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-2 text-on-surface outline-none focus:border-cyan-500/50"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        placeholder="What is this role for?"
        className="w-full bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-2 text-on-surface outline-none focus:border-cyan-500/50 resize-none"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-on-surface/5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  );
}

function OrganizationTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Company['type']>('departamento');
  const [parentId, setParentId] = useState('');
  const canCreate = can('companies:create');

  const companiesQuery = useQuery({
    queryKey: ['rbac', 'companies'],
    queryFn: rbacService.listCompanies,
  });
  const createCompany = useMutation({
    mutationFn: () =>
      rbacService.createCompany({
        name: name.trim(),
        type,
        parentId: type === 'empresa' ? null : parentId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rbac', 'companies'] });
      setName('');
      setParentId('');
      setIsCreating(false);
    },
  });

  if (companiesQuery.isLoading) return <LoadingSkeleton type="list" />;
  if (companiesQuery.isError) {
    return (
      <ErrorState
        title="We could not load the organization"
        description={
          companiesQuery.error instanceof Error ? companiesQuery.error.message : 'Unknown error'
        }
        onRetry={() => void companiesQuery.refetch()}
      />
    );
  }

  const companies = companiesQuery.data ?? [];
  const rootExists = companies.some(
    (company) => company.type === 'empresa' && company.parentId === null,
  );
  const validParents = companies.filter((company) =>
    type === 'departamento'
      ? company.type === 'empresa'
      : type === 'equipo'
        ? company.type === 'departamento'
        : false,
  );
  const ordered = orderCompanies(companies);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-on-surface">Organizational structure</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Company → areas/departments → teams. You can expand this structure as the company needs it.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setType(rootExists ? 'departamento' : 'empresa');
              setParentId('');
              setIsCreating((value) => !value);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Add area or team
          </button>
        )}
      </div>

      {isCreating && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createCompany.mutate();
          }}
          className="grid gap-3 md:grid-cols-[1fr_190px_1fr_auto] items-end bg-surface-container-low border border-cyan-500/30 rounded-2xl p-4"
        >
          <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
            Area or team name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="bg-surface-container border border-border/50 rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
            Type
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value as Company['type']);
                setParentId('');
              }}
              className="bg-surface-container border border-border/50 rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
            >
              <option value="empresa" disabled={rootExists}>
                Company{rootExists ? ' (already exists)' : ''}
              </option>
              <option value="departamento">Department</option>
              <option value="equipo">Team</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
            Belongs to
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              required={type !== 'empresa'}
              disabled={type === 'empresa'}
              className="bg-surface-container border border-border/50 rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50 disabled:opacity-50"
            >
              <option value="">{type === 'empresa' ? 'Not applicable' : 'Select a unit'}</option>
              {validParents.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={createCompany.isPending || !name.trim() || (type !== 'empresa' && !parentId)}
            className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-black disabled:opacity-50"
          >
            {createCompany.isPending ? 'Creating…' : 'Create'}
          </button>
          {createCompany.isError && (
            <p className="md:col-span-4 text-xs text-red-300">
              {createCompany.error instanceof Error
                ? createCompany.error.message
                : 'The unit could not be created.'}
            </p>
          )}
        </form>
      )}

      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        {ordered.length === 0 ? (
          <p className="p-8 text-sm text-center text-on-surface-variant">
            Create the root company to start the organizational structure.
          </p>
        ) : (
          <div className="divide-y divide-border/20">
            {ordered.map(({ company, depth }) => (
              <div key={company.id} className="flex items-center gap-3 px-6 py-4">
                <div style={{ width: `${depth * 24}px` }} className="shrink-0" />
                <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-sm text-on-surface truncate">{company.name}</p>
                  <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                    {company.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function orderCompanies(companies: Company[]): Array<{ company: Company; depth: number }> {
  const children = new Map<string | null, Company[]>();
  for (const company of companies) {
    const siblings = children.get(company.parentId) ?? [];
    siblings.push(company);
    children.set(company.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name));
  }

  const result: Array<{ company: Company; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (company: Company, depth: number) => {
    if (visited.has(company.id)) return;
    visited.add(company.id);
    result.push({ company, depth });
    for (const child of children.get(company.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  for (const company of companies) visit(company, 0);
  return result;
}

function UsersTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [creatingTestAgent, setCreatingTestAgent] = useState(false);
  const canReadRoles = can('roles:read');
  const canReadCompanies = can('companies:read');
  const canAssignRoles = can('usuarios:update') && canReadRoles;
  const canProvisionUsers = can('usuarios:create') && canReadRoles && canReadCompanies;

  const usersQuery = useQuery({ queryKey: ['rbac', 'users'], queryFn: rbacService.listUsers });
  const rolesQuery = useQuery({
    queryKey: ['rbac', 'roles'],
    queryFn: rbacService.listRoles,
    enabled: canReadRoles,
  });
  const companiesQuery = useQuery({
    queryKey: ['rbac', 'companies'],
    queryFn: rbacService.listCompanies,
    enabled: canReadCompanies && (canProvisionUsers || canAssignRoles),
  });

  const setUserRole = useMutation({
    mutationFn: ({ username, roleId }: { username: string; roleId: string }) =>
      rbacService.setUserRole(username, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rbac'] });
      setEditing(null);
    },
  });
  const updateUser = useMutation({
    mutationFn: ({ userId, companyId, roleId }: { userId: string; companyId: string; roleId: string }) =>
      rbacService.updateUser(userId, { companyId, roleId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rbac'] });
      setEditing(null);
    },
  });
  const provisionUser = useMutation({
    mutationFn: ({
      username,
      companyId,
      roleId,
    }: {
      username: string;
      companyId: string;
      roleId: string;
    }) => rbacService.provisionUser(username, { companyId, roleId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rbac'] });
      setEditing(null);
    },
  });
  const createTestAgent = useMutation({
    mutationFn: rbacService.createTestAgent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rbac'] });
      setCreatingTestAgent(false);
    },
  });

  const roles = rolesQuery.data ?? [];
  const companies = companiesQuery.data ?? [];
  const suggestedAgentRole = roles.find((role) => role.name.trim().toLocaleLowerCase().includes('agente'));
  const organizationalUnits = companies.filter((company) => company.type !== 'empresa');
  const users = useMemo(() => {
    const term = search.toLowerCase().trim();
    const all = usersQuery.data ?? [];
    if (!term) return all;
    return all.filter((user) =>
      `${user.username} ${user.displayName} ${user.email}`.toLowerCase().includes(term),
    );
  }, [usersQuery.data, search]);

  if (
    usersQuery.isLoading ||
    (canReadRoles && rolesQuery.isLoading) ||
    (canReadCompanies && (canProvisionUsers || canAssignRoles) && companiesQuery.isLoading)
  ) {
    return <LoadingSkeleton type="list" />;
  }
  if (usersQuery.isError) {
    return (
      <ErrorState
        title="We could not load the user list"
        description={usersQuery.error instanceof Error ? usersQuery.error.message : 'Unknown error'}
        retryLabel="Retry"
        onRetry={() => void usersQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by username, name or email…"
          className="w-full bg-surface-container border border-border/50 text-sm rounded-lg pl-10 pr-4 py-2 text-on-surface outline-none focus:border-cyan-500/50"
        />
      </div>
        {canProvisionUsers && (
          <button
            type="button"
            data-testid="create-test-agent"
            onClick={() => setCreatingTestAgent((current) => !current)}
            disabled={roles.length === 0 || organizationalUnits.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Crear agente de prueba
          </button>
        )}
      </div>

      {creatingTestAgent && (
        <TestAgentForm
          key={`${suggestedAgentRole?.id ?? ''}-${organizationalUnits[0]?.id ?? ''}`}
          roles={roles}
          companies={organizationalUnits}
          suggestedRoleId={suggestedAgentRole?.id ?? ''}
          isPending={createTestAgent.isPending}
          onCancel={() => setCreatingTestAgent(false)}
          onSubmit={(input) => createTestAgent.mutate(input)}
        />
      )}

      {setUserRole.isError && (
        <p className="text-xs text-red-300">
          {setUserRole.error instanceof Error ? setUserRole.error.message : 'Could not save.'}
        </p>
      )}
      {updateUser.isError && (
        <p className="text-xs text-red-300">
          {updateUser.error instanceof Error ? updateUser.error.message : 'Could not update the user.'}
        </p>
      )}
      {provisionUser.isError && (
        <p className="text-xs text-red-300">
          {provisionUser.error instanceof Error
            ? provisionUser.error.message
            : 'Could not provision the user.'}
        </p>
      )}
      {createTestAgent.isError && (
        <p className="text-xs text-red-300" role="alert">
          {createTestAgent.error instanceof Error
            ? createTestAgent.error.message
            : 'No se pudo crear el agente de prueba.'}
        </p>
      )}

      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface-container text-on-surface-variant border-b border-border/40">
            <tr>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">User</th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">
                Area or team
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">
                Role in SIG-DESK
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {users.map((user) => (
              <UserRow
                key={user.username}
                user={user}
                roles={roles}
                companies={companies}
                canEdit={user.hasAccount ? canAssignRoles : canProvisionUsers}
                isEditing={editing === user.username}
                isPending={setUserRole.isPending || updateUser.isPending || provisionUser.isPending}
                onEdit={() => setEditing(user.username)}
                onCancel={() => setEditing(null)}
                onSave={(companyId, roleId) => {
                  if (user.id && companyId) {
                    updateUser.mutate({ userId: user.id, companyId, roleId });
                    return;
                  }
                  setUserRole.mutate({ username: user.username, roleId });
                }}
                onProvision={(companyId, roleId) =>
                  provisionUser.mutate({ username: user.username, companyId, roleId })
                }
              />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant italic">
                  {search
                    ? 'No user matches the search.'
                    : 'Nobody has signed in to SIG-DESK yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TestAgentForm({
  roles,
  companies,
  suggestedRoleId,
  isPending,
  onCancel,
  onSubmit,
}: {
  roles: Role[];
  companies: Company[];
  suggestedRoleId: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (input: TestAgentInput) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [roleId, setRoleId] = useState(suggestedRoleId || roles[0]?.id || '');
  const [skill, setSkill] = useState('Soporte general');
  const [capacity, setCapacity] = useState('10');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 0) return;
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      companyId,
      roleId,
      skill: skill.trim(),
      capacity: parsedCapacity,
    });
  }

  return (
    <form
      onSubmit={submit}
      data-testid="create-test-agent-form"
      className="grid gap-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5 md:grid-cols-2 xl:grid-cols-3"
    >
      <div className="md:col-span-2 xl:col-span-3">
        <h2 className="text-sm font-black text-on-surface">Nuevo agente de prueba</h2>
        <p className="mt-1 text-xs text-on-surface-variant">
          Crea el Usuario, le asigna una unidad organizacional y registra su perfil de Agente IT.
        </p>
      </div>
      <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
        Nombre completo
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ej. Ana Soporte"
          className="rounded-lg border border-border/50 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
        Correo de prueba
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ana.soporte@example.test"
          className="rounded-lg border border-border/50 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
        Area o equipo IT
        <select
          required
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          className="rounded-lg border border-border/50 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name} ({company.type})
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
        Rol
        <select
          required
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          className="rounded-lg border border-border/50 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
        Habilidad
        <input
          required
          value={skill}
          onChange={(event) => setSkill(event.target.value)}
          className="rounded-lg border border-border/50 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-on-surface-variant">
        Capacidad simultanea
        <input
          required
          min="0"
          step="1"
          type="number"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          className="rounded-lg border border-border/50 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-cyan-500/50"
        />
      </label>
      <div className="flex items-end justify-end gap-3 md:col-span-2 xl:col-span-3">
        <button type="button" onClick={onCancel} className="text-xs font-bold text-on-surface-variant hover:text-on-surface">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending || !name.trim() || !email.trim() || !companyId || !roleId || !skill.trim()}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
        >
          {isPending ? 'Creando...' : 'Crear agente de prueba'}
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  roles,
  companies,
  canEdit,
  isEditing,
  isPending,
  onEdit,
  onCancel,
  onSave,
  onProvision,
}: {
  user: KnownUser;
  roles: Role[];
  companies: Company[];
  canEdit: boolean;
  isEditing: boolean;
  isPending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (companyId: string, roleId: string) => void;
  onProvision: (companyId: string, roleId: string) => void;
}) {
  const currentRole = roles.find((role) => role.id === user.roleId) ?? null;
  const currentCompany = companies.find((company) => company.id === user.companyId) ?? null;
  const [draftRoleId, setDraftRoleId] = useState<string>(user.roleId ?? roles[0]?.id ?? '');
  const [draftCompanyId, setDraftCompanyId] = useState<string>(user.companyId ?? companies[0]?.id ?? '');

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
        <td className="px-6 py-4">
          {isEditing ? (
            <div className="min-w-56">
              <select
                aria-label="Company, department or team"
                value={draftCompanyId}
                onChange={(event) => setDraftCompanyId(event.target.value)}
                className="bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-1.5 text-on-surface outline-none focus:border-cyan-500/50"
              >
                <option value="">Select an organizational unit</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} ({company.type})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs italic text-on-surface-variant">No unit assigned</span>
          )}
        </td>
        <td className="px-6 py-4">
          {isEditing ? (
              <select
                aria-label="Initial role"
                value={draftRoleId}
                onChange={(event) => setDraftRoleId(event.target.value)}
                className="bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-1.5 text-on-surface outline-none focus:border-cyan-500/50"
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
          ) : (
            <span className="text-xs italic text-on-surface-variant">
              Verified identity; pending access to SIG-DESK
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
                Cancel
              </button>
              <button
                onClick={() => onProvision(draftCompanyId, draftRoleId)}
                disabled={isPending || !draftCompanyId || !draftRoleId}
                className="text-xs font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
              >
                {isPending ? 'Provisioning…' : 'Grant access'}
              </button>
            </div>
          ) : canEdit ? (
            <button
              onClick={() => {
                setDraftCompanyId(companies[0]?.id ?? '');
                setDraftRoleId(roles[0]?.id ?? '');
                onEdit();
              }}
              disabled={companies.length === 0 || roles.length === 0}
              className="text-xs font-bold text-cyan-500 hover:text-cyan-400 disabled:opacity-50 disabled:text-on-surface-variant"
            >
              Dar acceso
            </button>
          ) : (
            <span className="text-xs text-on-surface-variant">Solo lectura</span>
          )}
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
        {isEditing && canEdit && companies.length > 0 ? (
          <select
            aria-label="Area or team"
            value={draftCompanyId}
            onChange={(event) => setDraftCompanyId(event.target.value)}
            className="bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-1.5 text-on-surface outline-none focus:border-cyan-500/50"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.type})
              </option>
            ))}
          </select>
        ) : currentCompany ? (
          <div>
            <p className="text-sm font-bold text-on-surface">{currentCompany.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
              {currentCompany.type}
            </p>
          </div>
        ) : user.companyId ? (
          <span className="text-xs font-mono text-on-surface-variant">{user.companyId}</span>
        ) : (
          <span className="text-xs italic text-on-surface-variant">No organizational unit</span>
        )}
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
            no role assigned — cannot operate
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
              Cancel
            </button>
            <button
              onClick={() => onSave(draftCompanyId, draftRoleId)}
              disabled={isPending || !draftRoleId || (companies.length > 0 && !draftCompanyId)}
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : canEdit ? (
          <div className="flex items-center justify-end">
            <button
              onClick={() => {
                setDraftRoleId(user.roleId ?? roles[0]?.id ?? '');
                setDraftCompanyId(user.companyId ?? companies[0]?.id ?? '');
                onEdit();
              }}
              disabled={roles.length === 0}
              className="text-xs font-bold text-cyan-500 hover:text-cyan-400 disabled:opacity-50 disabled:text-on-surface-variant"
            >
              Edit access
            </button>
          </div>
        ) : (
          <span className="text-xs text-on-surface-variant">Read-only</span>
        )}
      </td>
    </tr>
  );
}
