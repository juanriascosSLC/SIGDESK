package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sig-desk/backend/internal/rbac/domain"
	"sig-desk/backend/internal/rbac/ports"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// roleColumns plus the aggregated grants and assignment count, so the admin
// screen renders in one round trip instead of N+1 queries per role.
const roleQuery = `
	SELECT
		r.id::text, r.name, r.label, r.description, r.is_system, r.created_at,
		COALESCE(
			ARRAY_REMOVE(ARRAY_AGG(DISTINCT rp.permission_key), NULL),
			'{}'
		) AS permissions,
		(SELECT count(*) FROM rbac_user_roles ur WHERE ur.role_id = r.id) AS user_count
	FROM rbac_roles r
	LEFT JOIN rbac_role_permissions rp ON rp.role_id = r.id
`

func scanRole(row interface{ Scan(...any) error }) (domain.Role, error) {
	var role domain.Role
	err := row.Scan(
		&role.ID, &role.Name, &role.Label, &role.Description,
		&role.IsSystem, &role.CreatedAt, &role.Permissions, &role.UserCount,
	)
	return role, err
}

func (repository *Repository) ListRoles(ctx context.Context) ([]domain.Role, error) {
	rows, err := repository.pool.Query(ctx, roleQuery+`
		GROUP BY r.id
		ORDER BY r.is_system DESC, r.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	roles := make([]domain.Role, 0)
	for rows.Next() {
		role, scanErr := scanRole(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func (repository *Repository) GetRoleByID(ctx context.Context, roleID string) (domain.Role, error) {
	row := repository.pool.QueryRow(ctx, roleQuery+`
		WHERE r.id = $1::uuid
		GROUP BY r.id
	`, roleID)
	role, err := scanRole(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	return role, err
}

func (repository *Repository) GetRoleByName(ctx context.Context, name string) (domain.Role, error) {
	row := repository.pool.QueryRow(ctx, roleQuery+`
		WHERE r.name = $1
		GROUP BY r.id
	`, name)
	role, err := scanRole(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	return role, err
}

func (repository *Repository) CreateRole(
	ctx context.Context,
	input domain.NewRole,
	permissionKeys []string,
) (domain.Role, error) {
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return domain.Role{}, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	var roleID string
	if err := transaction.QueryRow(ctx, `
		INSERT INTO rbac_roles (name, label, description)
		VALUES ($1, $2, $3)
		RETURNING id::text
	`, input.Name, input.Label, input.Description).Scan(&roleID); err != nil {
		return domain.Role{}, err
	}
	if err := replacePermissions(ctx, transaction, roleID, permissionKeys); err != nil {
		return domain.Role{}, err
	}
	if err := transaction.Commit(ctx); err != nil {
		return domain.Role{}, err
	}
	return repository.GetRoleByID(ctx, roleID)
}

func (repository *Repository) UpdateRole(
	ctx context.Context,
	roleID string,
	input domain.NewRole,
) (domain.Role, error) {
	commandTag, err := repository.pool.Exec(ctx, `
		UPDATE rbac_roles
		SET name = $2, label = $3, description = $4, updated_at = now()
		WHERE id = $1::uuid
	`, roleID, input.Name, input.Label, input.Description)
	if err != nil {
		return domain.Role{}, err
	}
	if commandTag.RowsAffected() == 0 {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	return repository.GetRoleByID(ctx, roleID)
}

func (repository *Repository) DeleteRole(ctx context.Context, roleID string) error {
	// Grants and assignments cascade, so deleting a role revokes it everywhere
	// rather than leaving orphan rows that would silently grant nothing.
	commandTag, err := repository.pool.Exec(ctx, `
		DELETE FROM rbac_roles WHERE id = $1::uuid AND is_system = false
	`, roleID)
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return domain.ErrRoleNotFound
	}
	return nil
}

func (repository *Repository) SetRolePermissions(
	ctx context.Context,
	roleID string,
	permissionKeys []string,
) (domain.Role, error) {
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return domain.Role{}, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	if err := replacePermissions(ctx, transaction, roleID, permissionKeys); err != nil {
		return domain.Role{}, err
	}
	if err := transaction.Commit(ctx); err != nil {
		return domain.Role{}, err
	}
	return repository.GetRoleByID(ctx, roleID)
}

// replacePermissions makes the stored grants exactly the given set, in one
// transaction, so a failure cannot leave a role with half its permissions.
func replacePermissions(
	ctx context.Context,
	transaction pgx.Tx,
	roleID string,
	permissionKeys []string,
) error {
	if _, err := transaction.Exec(ctx, `
		DELETE FROM rbac_role_permissions WHERE role_id = $1::uuid
	`, roleID); err != nil {
		return err
	}
	if len(permissionKeys) == 0 {
		return nil
	}
	_, err := transaction.Exec(ctx, `
		INSERT INTO rbac_role_permissions (role_id, permission_key)
		SELECT $1::uuid, key FROM unnest($2::text[]) AS key
		ON CONFLICT DO NOTHING
	`, roleID, permissionKeys)
	return err
}

func (repository *Repository) GrantsFor(
	ctx context.Context,
	username string,
) (domain.Grants, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT
			COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.name), NULL), '{}') AS roles,
			COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT rp.permission_key), NULL), '{}') AS permissions
		FROM rbac_user_roles ur
		JOIN rbac_roles r ON r.id = ur.role_id
		LEFT JOIN rbac_role_permissions rp ON rp.role_id = r.id
		WHERE ur.username = $1
	`, username)
	if err != nil {
		return domain.Grants{}, err
	}
	defer rows.Close()

	var grants domain.Grants
	if rows.Next() {
		if err := rows.Scan(&grants.Roles, &grants.Permissions); err != nil {
			return domain.Grants{}, err
		}
	}
	return grants, rows.Err()
}

func (repository *Repository) SetUserRoles(
	ctx context.Context,
	username string,
	roleIDs []string,
	grantedBy *string,
) error {
	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	if _, err := transaction.Exec(ctx, `
		DELETE FROM rbac_user_roles WHERE username = $1
	`, username); err != nil {
		return err
	}
	if len(roleIDs) > 0 {
		if _, err := transaction.Exec(ctx, `
			INSERT INTO rbac_user_roles (username, role_id, granted_by)
			SELECT $1, id::uuid, $3 FROM unnest($2::text[]) AS id
			ON CONFLICT DO NOTHING
		`, username, roleIDs, grantedBy); err != nil {
			return err
		}
	}
	return transaction.Commit(ctx)
}

func (repository *Repository) ListAssignments(
	ctx context.Context,
	username string,
) ([]domain.Assignment, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT ur.username, ur.role_id::text, r.name, ur.granted_at, ur.granted_by
		FROM rbac_user_roles ur
		JOIN rbac_roles r ON r.id = ur.role_id
		WHERE ur.username = $1
		ORDER BY r.name
	`, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assignments := make([]domain.Assignment, 0)
	for rows.Next() {
		var assignment domain.Assignment
		if err := rows.Scan(
			&assignment.Username, &assignment.RoleID, &assignment.RoleName,
			&assignment.GrantedAt, &assignment.GrantedBy,
		); err != nil {
			return nil, err
		}
		assignments = append(assignments, assignment)
	}
	return assignments, rows.Err()
}

func (repository *Repository) ListKnownUsers(ctx context.Context) ([]domain.KnownUser, error) {
	// Left join so someone granted a role before ever signing in still shows
	// up, and someone who signed in with no roles is visible to be granted one.
	rows, err := repository.pool.Query(ctx, `
		SELECT
			u.username,
			MAX(u.display_name) AS display_name,
			MAX(u.email) AS email,
			MAX(u.last_seen_at) AS last_seen_at,
			COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.name), NULL), '{}') AS roles
		FROM (
			SELECT username, display_name, email, last_seen_at FROM rbac_known_users
			UNION
			SELECT DISTINCT username, '', '', to_timestamp(0) FROM rbac_user_roles
		) AS u
		LEFT JOIN rbac_user_roles ur ON ur.username = u.username
		LEFT JOIN rbac_roles r ON r.id = ur.role_id
		GROUP BY u.username
		ORDER BY u.username
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]domain.KnownUser, 0)
	for rows.Next() {
		var user domain.KnownUser
		if err := rows.Scan(
			&user.Username, &user.DisplayName, &user.Email, &user.LastSeenAt, &user.Roles,
		); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func (repository *Repository) RecordSeenUser(ctx context.Context, user domain.KnownUser) error {
	_, err := repository.pool.Exec(ctx, `
		INSERT INTO rbac_known_users (username, display_name, email, last_seen_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (username) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			email = EXCLUDED.email,
			last_seen_at = now()
	`, user.Username, user.DisplayName, user.Email)
	return err
}

var _ ports.Repository = (*Repository)(nil)
