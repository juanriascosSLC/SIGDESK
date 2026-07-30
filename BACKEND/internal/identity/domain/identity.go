// Package domain models the authenticated caller. Identity is resolved by an
// external authority (SIGTools, the company-wide auth service shared with
// SIGInstallations and SIGInventory) — SIG-DESK never stores credentials and
// never owns the user record. See ADR-0007.
package domain

import (
	"errors"
	"strings"
)

var (
	// ErrNoCredential means the request carried nothing to authenticate with.
	ErrNoCredential = errors.New("no session credential was provided")
	// ErrInvalidCredential means the authority rejected the credential.
	ErrInvalidCredential = errors.New("invalid or expired session")
	// ErrAuthorityUnavailable means the authority could not be reached, so we
	// cannot tell whether the credential is valid. It must never be treated
	// as "authenticated"; it is a 503, not a 401.
	ErrAuthorityUnavailable = errors.New("authentication authority unavailable")
	// ErrForbidden means the caller is authenticated but lacks a permission.
	ErrForbidden = errors.New("caller lacks the required permission")
)

// Identity is the authenticated caller as reported by SIGTools. Roles and
// permissions are mirrored verbatim: SIG-DESK does not invent, cache
// long-term, or reinterpret them, because the shared platform is the single
// source of truth for who a person is and what they may do.
type Identity struct {
	ID          int      `json:"id"`
	Username    string   `json:"username"`
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
}

// DisplayName is what gets written into ticket activity, comments and
// assignments. It prefers the human name and degrades to username, so an
// audit trail never ends up with an empty actor.
func (identity Identity) DisplayName() string {
	if name := strings.TrimSpace(identity.Name); name != "" {
		return name
	}
	if username := strings.TrimSpace(identity.Username); username != "" {
		return username
	}
	return "Unknown user"
}

// IsAdmin mirrors the rule the other two SIG apps use. Deliberately does NOT
// treat access_level == 1 as admin: the shared backend assigns level 1 to any
// user that has a role at all, so doing so would hand everyone full access
// (a real bug the other apps hit and documented).
func (identity Identity) IsAdmin() bool {
	for _, role := range identity.Roles {
		switch strings.ToLower(strings.TrimSpace(role)) {
		case "admin", "administrator":
			return true
		}
	}
	for _, permission := range identity.Permissions {
		if permission == "*" || permission == "admin.*" {
			return true
		}
	}
	return false
}

// Can reports whether the identity holds a permission key. Admins pass
// everything; otherwise the key must be granted explicitly, plus support for
// a module wildcard ("sigdesk.*") since the shared permission registry uses
// dotted "<module>.<resource>.<action>" keys.
func (identity Identity) Can(key string) bool {
	if identity.IsAdmin() {
		return true
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return false
	}
	module := key
	if index := strings.Index(key, "."); index > 0 {
		module = key[:index]
	}
	moduleWildcard := module + ".*"
	for _, permission := range identity.Permissions {
		if permission == key || permission == moduleWildcard {
			return true
		}
	}
	return false
}
