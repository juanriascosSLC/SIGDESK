// Package domain models SIG-DESK's own roles and permission grants.
//
// Authentication is delegated to SIGTools (ADR-0007) — it answers who the
// caller is, for all three company apps. Authorization is NOT delegated: what
// a person may do inside SIG-DESK is decided here, from this app's own
// database. Sharing the company registry would have meant inheriting
// SIGInstallations' roles (designer, field_tech, inventory_op) and writing
// service-desk permissions into another module's tables.
package domain

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	ErrRoleNotFound      = errors.New("role not found")
	ErrRoleNameTaken     = errors.New("a role with that name already exists")
	ErrInvalidRoleName   = errors.New("role name must be lowercase letters, digits or underscores")
	ErrInvalidRoleLabel  = errors.New("role label is required")
	ErrSystemRoleLocked  = errors.New("system roles cannot be renamed or deleted")
	ErrUnknownPermission = errors.New("unknown permission key")
	ErrUnknownRole       = errors.New("unknown role")
)

// AdminRoleName is the role that bypasses every permission check. The code
// reasons about it by name, which is why it is flagged is_system and cannot be
// renamed or deleted.
const AdminRoleName = "admin"

var roleNamePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{1,31}$`)

type Role struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
	IsSystem    bool      `json:"isSystem"`
	Permissions []string  `json:"permissions"`
	UserCount   int       `json:"userCount"`
	CreatedAt   time.Time `json:"createdAt"`
}

// NewRole is the payload for creating or renaming a role.
type NewRole struct {
	Name        string
	Label       string
	Description string
}

func (role NewRole) Normalized() NewRole {
	return NewRole{
		Name:        strings.ToLower(strings.TrimSpace(role.Name)),
		Label:       strings.TrimSpace(role.Label),
		Description: strings.TrimSpace(role.Description),
	}
}

func (role NewRole) Validate() error {
	if !roleNamePattern.MatchString(role.Name) {
		return fmt.Errorf("%w: got %q", ErrInvalidRoleName, role.Name)
	}
	if role.Label == "" {
		return ErrInvalidRoleLabel
	}
	return nil
}

// Assignment links a SIGTools username to a SIG-DESK role. Keyed by username
// rather than numeric id because that is the stable handle the identity
// carries, and it allows granting a role before the person first signs in.
type Assignment struct {
	Username  string    `json:"username"`
	RoleID    string    `json:"roleId"`
	RoleName  string    `json:"roleName"`
	GrantedAt time.Time `json:"grantedAt"`
	GrantedBy *string   `json:"grantedBy"`
}

// KnownUser is someone who has signed in to SIG-DESK. The account itself lives
// in Active Directory / SIGTools; this is only so the admin screen can offer a
// picker and so a user who was denied for lacking a role can be found.
type KnownUser struct {
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	Email       string    `json:"email"`
	LastSeenAt  time.Time `json:"lastSeenAt"`
	Roles       []string  `json:"roles"`
}

// Grants is the resolved authorization of one user: the union of every
// permission across the roles they hold.
type Grants struct {
	Roles       []string
	Permissions []string
}

func (grants Grants) IsAdmin() bool {
	for _, role := range grants.Roles {
		if strings.EqualFold(role, AdminRoleName) {
			return true
		}
	}
	return false
}

// ValidatePermissionKeys rejects keys the application does not define. Grants
// are stored as plain strings, so without this a typo would sit in the database
// looking granted while never matching anything the routes check.
func ValidatePermissionKeys(keys []string, known map[string]bool) ([]string, error) {
	unique := make(map[string]bool, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if !known[key] {
			return nil, fmt.Errorf("%w: %q", ErrUnknownPermission, key)
		}
		unique[key] = true
	}
	cleaned := make([]string, 0, len(unique))
	for key := range unique {
		cleaned = append(cleaned, key)
	}
	sort.Strings(cleaned)
	return cleaned, nil
}
