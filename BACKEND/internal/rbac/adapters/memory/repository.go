// Package memory is the development fallback used when DATABASE_URL is unset.
// It seeds the same default roles as migration 000012 so the admin screen
// behaves identically with and without PostgreSQL.
package memory

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sort"
	"strings"
	"sync"
	"time"

	identityDomain "sig-desk/backend/internal/identity/domain"
	"sig-desk/backend/internal/rbac/domain"
	"sig-desk/backend/internal/rbac/ports"
)

type Repository struct {
	mutex       sync.RWMutex
	roles       map[string]domain.Role
	grants      map[string]map[string]bool // roleID -> permission keys
	assignments map[string]map[string]bool // username -> roleIDs
	knownUsers  map[string]domain.KnownUser
}

func NewRepository() *Repository {
	repository := &Repository{
		roles:       make(map[string]domain.Role),
		grants:      make(map[string]map[string]bool),
		assignments: make(map[string]map[string]bool),
		knownUsers:  make(map[string]domain.KnownUser),
	}
	repository.seedDefaults()
	return repository
}

func (repository *Repository) seedDefaults() {
	all := make([]string, 0)
	for _, entry := range identityDomain.PermissionCatalog() {
		all = append(all, entry.Key)
	}

	agent := []string{
		identityDomain.PermTicketsView, identityDomain.PermTicketsCreate,
		identityDomain.PermTicketsEdit, identityDomain.PermTicketsAssign,
		identityDomain.PermTicketsResolve, identityDomain.PermTicketsComment,
		identityDomain.PermTicketsAttach, identityDomain.PermCatalogView,
		identityDomain.PermSLAView,
	}
	manager := append([]string{
		identityDomain.PermTicketsMerge, identityDomain.PermSLAManage,
	}, agent...)

	repository.insertSeed("admin", "Administrador", "Acceso total. Omite todas las verificaciones de permisos.", true, all)
	repository.insertSeed("manager", "Manager", "Supervisa la operación: SLA, aprobación de cambios y reportes.", false, manager)
	repository.insertSeed("agent", "Agente", "Opera tickets: atiende, asigna, comenta y resuelve.", false, agent)
}

func (repository *Repository) insertSeed(
	name, label, description string,
	isSystem bool,
	permissions []string,
) {
	id := newID()
	repository.roles[id] = domain.Role{
		ID: id, Name: name, Label: label, Description: description,
		IsSystem: isSystem, CreatedAt: time.Now().UTC(),
	}
	keys := make(map[string]bool, len(permissions))
	for _, key := range permissions {
		keys[key] = true
	}
	repository.grants[id] = keys
}

func (repository *Repository) hydrate(role domain.Role) domain.Role {
	keys := make([]string, 0, len(repository.grants[role.ID]))
	for key := range repository.grants[role.ID] {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	role.Permissions = keys
	role.UserCount = 0
	for _, roleIDs := range repository.assignments {
		if roleIDs[role.ID] {
			role.UserCount++
		}
	}
	return role
}

func (repository *Repository) ListRoles(_ context.Context) ([]domain.Role, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()

	roles := make([]domain.Role, 0, len(repository.roles))
	for _, role := range repository.roles {
		roles = append(roles, repository.hydrate(role))
	}
	sort.Slice(roles, func(i, j int) bool {
		if roles[i].IsSystem != roles[j].IsSystem {
			return roles[i].IsSystem
		}
		return roles[i].Name < roles[j].Name
	})
	return roles, nil
}

func (repository *Repository) GetRoleByID(_ context.Context, roleID string) (domain.Role, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	role, ok := repository.roles[roleID]
	if !ok {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	return repository.hydrate(role), nil
}

func (repository *Repository) GetRoleByName(_ context.Context, name string) (domain.Role, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	for _, role := range repository.roles {
		if role.Name == name {
			return repository.hydrate(role), nil
		}
	}
	return domain.Role{}, domain.ErrRoleNotFound
}

func (repository *Repository) CreateRole(
	_ context.Context,
	input domain.NewRole,
	permissionKeys []string,
) (domain.Role, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()

	id := newID()
	role := domain.Role{
		ID: id, Name: input.Name, Label: input.Label,
		Description: input.Description, CreatedAt: time.Now().UTC(),
	}
	repository.roles[id] = role
	repository.setGrantsLocked(id, permissionKeys)
	return repository.hydrate(role), nil
}

func (repository *Repository) UpdateRole(
	_ context.Context,
	roleID string,
	input domain.NewRole,
) (domain.Role, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()

	role, ok := repository.roles[roleID]
	if !ok {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	role.Name, role.Label, role.Description = input.Name, input.Label, input.Description
	repository.roles[roleID] = role
	return repository.hydrate(role), nil
}

func (repository *Repository) DeleteRole(_ context.Context, roleID string) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()

	role, ok := repository.roles[roleID]
	if !ok || role.IsSystem {
		return domain.ErrRoleNotFound
	}
	delete(repository.roles, roleID)
	delete(repository.grants, roleID)
	for username := range repository.assignments {
		delete(repository.assignments[username], roleID)
	}
	return nil
}

func (repository *Repository) SetRolePermissions(
	_ context.Context,
	roleID string,
	permissionKeys []string,
) (domain.Role, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()

	role, ok := repository.roles[roleID]
	if !ok {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	repository.setGrantsLocked(roleID, permissionKeys)
	return repository.hydrate(role), nil
}

// setGrantsLocked must be called with mutex held.
func (repository *Repository) setGrantsLocked(roleID string, permissionKeys []string) {
	keys := make(map[string]bool, len(permissionKeys))
	for _, key := range permissionKeys {
		keys[key] = true
	}
	repository.grants[roleID] = keys
}

func (repository *Repository) GrantsFor(
	_ context.Context,
	username string,
) (domain.Grants, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()

	var grants domain.Grants
	permissions := make(map[string]bool)
	for roleID := range repository.assignments[username] {
		role, ok := repository.roles[roleID]
		if !ok {
			continue
		}
		grants.Roles = append(grants.Roles, role.Name)
		for key := range repository.grants[roleID] {
			permissions[key] = true
		}
	}
	for key := range permissions {
		grants.Permissions = append(grants.Permissions, key)
	}
	sort.Strings(grants.Roles)
	sort.Strings(grants.Permissions)
	return grants, nil
}

func (repository *Repository) SetUserRoles(
	_ context.Context,
	username string,
	roleIDs []string,
	_ *string,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()

	assigned := make(map[string]bool, len(roleIDs))
	for _, roleID := range roleIDs {
		assigned[roleID] = true
	}
	repository.assignments[username] = assigned
	return nil
}

func (repository *Repository) ListAssignments(
	_ context.Context,
	username string,
) ([]domain.Assignment, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()

	assignments := make([]domain.Assignment, 0)
	for roleID := range repository.assignments[username] {
		role, ok := repository.roles[roleID]
		if !ok {
			continue
		}
		assignments = append(assignments, domain.Assignment{
			Username: username, RoleID: roleID, RoleName: role.Name,
		})
	}
	sort.Slice(assignments, func(i, j int) bool {
		return assignments[i].RoleName < assignments[j].RoleName
	})
	return assignments, nil
}

func (repository *Repository) ListKnownUsers(_ context.Context) ([]domain.KnownUser, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()

	byUsername := make(map[string]domain.KnownUser, len(repository.knownUsers))
	for username, user := range repository.knownUsers {
		byUsername[username] = user
	}
	// Someone granted a role but who has never signed in still needs to appear.
	for username := range repository.assignments {
		if _, exists := byUsername[username]; !exists {
			byUsername[username] = domain.KnownUser{Username: username, DisplayName: username}
		}
	}

	users := make([]domain.KnownUser, 0, len(byUsername))
	for username, user := range byUsername {
		for roleID := range repository.assignments[username] {
			if role, ok := repository.roles[roleID]; ok {
				user.Roles = append(user.Roles, role.Name)
			}
		}
		sort.Strings(user.Roles)
		users = append(users, user)
	}
	sort.Slice(users, func(i, j int) bool { return users[i].Username < users[j].Username })
	return users, nil
}

func (repository *Repository) RecordSeenUser(_ context.Context, user domain.KnownUser) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	user.Username = strings.ToLower(user.Username)
	user.LastSeenAt = time.Now().UTC()
	repository.knownUsers[user.Username] = user
	return nil
}

func newID() string {
	raw := make([]byte, 16)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}

var _ ports.Repository = (*Repository)(nil)
