package ports

import (
	"context"

	"sig-desk/backend/internal/rbac/domain"
)

// Repository persists SIG-DESK's roles, their permission grants and the
// role assignments per SIGTools username.
type Repository interface {
	ListRoles(ctx context.Context) ([]domain.Role, error)
	GetRoleByID(ctx context.Context, roleID string) (domain.Role, error)
	GetRoleByName(ctx context.Context, name string) (domain.Role, error)
	CreateRole(ctx context.Context, role domain.NewRole, permissionKeys []string) (domain.Role, error)
	UpdateRole(ctx context.Context, roleID string, role domain.NewRole) (domain.Role, error)
	DeleteRole(ctx context.Context, roleID string) error
	SetRolePermissions(ctx context.Context, roleID string, permissionKeys []string) (domain.Role, error)

	// GrantsFor resolves one user's authorization: the roles they hold and the
	// union of those roles' permissions.
	GrantsFor(ctx context.Context, username string) (domain.Grants, error)
	SetUserRoles(ctx context.Context, username string, roleIDs []string, grantedBy *string) error
	ListAssignments(ctx context.Context, username string) ([]domain.Assignment, error)

	ListKnownUsers(ctx context.Context) ([]domain.KnownUser, error)
	// RecordSeenUser upserts the convenience record of someone who signed in.
	RecordSeenUser(ctx context.Context, user domain.KnownUser) error
}
