package application

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	identityDomain "sig-desk/backend/internal/identity/domain"
	identityPorts "sig-desk/backend/internal/identity/ports"
	"sig-desk/backend/internal/rbac/domain"
	"sig-desk/backend/internal/rbac/ports"
)

type Service struct {
	repository ports.Repository
	// bootstrapAdmins always resolve as administrators regardless of what the
	// database says. Without it there is no way to grant the first role: an
	// empty install would have nobody able to reach role administration.
	bootstrapAdmins map[string]bool
	knownPermission map[string]bool

	// seenRecently throttles the convenience upsert of signed-in users so it
	// does not become a database write on every request.
	seenMutex    sync.Mutex
	seenRecently map[string]time.Time
	now          func() time.Time
}

const seenThrottle = 10 * time.Minute

func NewService(repository ports.Repository, bootstrapAdmins []string) *Service {
	admins := make(map[string]bool, len(bootstrapAdmins))
	for _, username := range bootstrapAdmins {
		if normalized := strings.ToLower(strings.TrimSpace(username)); normalized != "" {
			admins[normalized] = true
		}
	}
	known := make(map[string]bool)
	for _, entry := range identityDomain.PermissionCatalog() {
		known[entry.Key] = true
	}
	return &Service{
		repository:      repository,
		bootstrapAdmins: admins,
		knownPermission: known,
		seenRecently:    make(map[string]time.Time),
		now:             time.Now,
	}
}

// HasBootstrapAdmins lets main warn loudly when an install has no way in.
func (service *Service) HasBootstrapAdmins() bool {
	return len(service.bootstrapAdmins) > 0
}

// PermissionCatalog is what this application defines and enforces. Exposed so
// the admin UI offers exactly the keys the routes check — no more, no fewer.
func (service *Service) PermissionCatalog() []identityDomain.CatalogEntry {
	return identityDomain.PermissionCatalog()
}

// AuthorizeUser implements identity's Authorizer port: given the username that
// SIGTools authenticated, it returns the roles and permissions SIG-DESK grants.
// The roles SIGTools reports for its own apps are deliberately not consulted.
func (service *Service) AuthorizeUser(
	ctx context.Context,
	identity identityDomain.Identity,
) ([]string, []string, error) {
	username := strings.ToLower(strings.TrimSpace(identity.Username))
	if username == "" {
		// Without a username there is nothing to look grants up by, so the
		// caller ends up authenticated with no permissions rather than
		// inheriting anything.
		return nil, nil, nil
	}

	service.recordSeen(ctx, identity)

	grants, err := service.repository.GrantsFor(ctx, username)
	if err != nil {
		return nil, nil, err
	}

	if service.bootstrapAdmins[username] && !grants.IsAdmin() {
		grants.Roles = append(grants.Roles, domain.AdminRoleName)
	}
	return grants.Roles, grants.Permissions, nil
}

// recordSeen keeps a local note of who has signed in, throttled, so the admin
// screen can list real people to assign roles to.
func (service *Service) recordSeen(ctx context.Context, identity identityDomain.Identity) {
	username := strings.ToLower(strings.TrimSpace(identity.Username))
	now := service.now()

	service.seenMutex.Lock()
	last, seen := service.seenRecently[username]
	if seen && now.Sub(last) < seenThrottle {
		service.seenMutex.Unlock()
		return
	}
	service.seenRecently[username] = now
	service.seenMutex.Unlock()

	// Best effort: failing to record a convenience row must never block a
	// request that is otherwise perfectly authenticated.
	_ = service.repository.RecordSeenUser(ctx, domain.KnownUser{
		Username:    username,
		DisplayName: identity.DisplayName(),
		Email:       identity.Email,
		LastSeenAt:  now,
	})
}

func (service *Service) ListRoles(ctx context.Context) ([]domain.Role, error) {
	return service.repository.ListRoles(ctx)
}

func (service *Service) CreateRole(
	ctx context.Context,
	input domain.NewRole,
	permissionKeys []string,
) (domain.Role, error) {
	input = input.Normalized()
	if err := input.Validate(); err != nil {
		return domain.Role{}, err
	}
	keys, err := domain.ValidatePermissionKeys(permissionKeys, service.knownPermission)
	if err != nil {
		return domain.Role{}, err
	}
	if _, err := service.repository.GetRoleByName(ctx, input.Name); err == nil {
		return domain.Role{}, fmt.Errorf("%w: %s", domain.ErrRoleNameTaken, input.Name)
	} else if !errors.Is(err, domain.ErrRoleNotFound) {
		return domain.Role{}, err
	}
	return service.repository.CreateRole(ctx, input, keys)
}

func (service *Service) UpdateRole(
	ctx context.Context,
	roleID string,
	input domain.NewRole,
) (domain.Role, error) {
	existing, err := service.repository.GetRoleByID(ctx, roleID)
	if err != nil {
		return domain.Role{}, err
	}
	input = input.Normalized()
	// A system role keeps its name — the code looks "admin" up by name — but
	// its label and description are just presentation and stay editable.
	if existing.IsSystem {
		input.Name = existing.Name
	}
	if err := input.Validate(); err != nil {
		return domain.Role{}, err
	}
	if input.Name != existing.Name {
		if _, err := service.repository.GetRoleByName(ctx, input.Name); err == nil {
			return domain.Role{}, fmt.Errorf("%w: %s", domain.ErrRoleNameTaken, input.Name)
		} else if !errors.Is(err, domain.ErrRoleNotFound) {
			return domain.Role{}, err
		}
	}
	return service.repository.UpdateRole(ctx, roleID, input)
}

func (service *Service) DeleteRole(ctx context.Context, roleID string) error {
	existing, err := service.repository.GetRoleByID(ctx, roleID)
	if err != nil {
		return err
	}
	if existing.IsSystem {
		return fmt.Errorf("%w: %s", domain.ErrSystemRoleLocked, existing.Name)
	}
	return service.repository.DeleteRole(ctx, roleID)
}

// SetRolePermissions replaces a role's grants with exactly the keys given.
// Unknown keys are rejected rather than stored: a typo that sits in the
// database looks granted while never matching anything the routes enforce.
func (service *Service) SetRolePermissions(
	ctx context.Context,
	roleID string,
	permissionKeys []string,
) (domain.Role, error) {
	if _, err := service.repository.GetRoleByID(ctx, roleID); err != nil {
		return domain.Role{}, err
	}
	keys, err := domain.ValidatePermissionKeys(permissionKeys, service.knownPermission)
	if err != nil {
		return domain.Role{}, err
	}
	return service.repository.SetRolePermissions(ctx, roleID, keys)
}

// SetUserRoles replaces which roles a username holds. Users themselves are
// provisioned in Active Directory / SIGTools; this only decides what they may
// do inside SIG-DESK.
func (service *Service) SetUserRoles(
	ctx context.Context,
	username string,
	roleIDs []string,
	grantedBy *string,
) error {
	username = strings.ToLower(strings.TrimSpace(username))
	if username == "" {
		return fmt.Errorf("%w: username is required", domain.ErrUnknownRole)
	}
	unique := make(map[string]bool, len(roleIDs))
	cleaned := make([]string, 0, len(roleIDs))
	for _, roleID := range roleIDs {
		roleID = strings.TrimSpace(roleID)
		if roleID == "" || unique[roleID] {
			continue
		}
		if _, err := service.repository.GetRoleByID(ctx, roleID); err != nil {
			return err
		}
		unique[roleID] = true
		cleaned = append(cleaned, roleID)
	}
	return service.repository.SetUserRoles(ctx, username, cleaned, grantedBy)
}

func (service *Service) ListKnownUsers(ctx context.Context) ([]domain.KnownUser, error) {
	users, err := service.repository.ListKnownUsers(ctx)
	if err != nil {
		return nil, err
	}
	// Surface the bootstrap admins even if they have never signed in, so an
	// operator can see that the env var took effect.
	existing := make(map[string]bool, len(users))
	for _, user := range users {
		existing[user.Username] = true
	}
	for username := range service.bootstrapAdmins {
		if existing[username] {
			continue
		}
		users = append(users, domain.KnownUser{
			Username:    username,
			DisplayName: username,
			Roles:       []string{domain.AdminRoleName},
		})
	}
	return users, nil
}

var _ identityPorts.Authorizer = (*Service)(nil)
