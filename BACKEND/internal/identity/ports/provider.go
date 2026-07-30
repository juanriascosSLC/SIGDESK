package ports

import (
	"context"

	"sig-desk/backend/internal/identity/domain"
)

// Credential is what the caller presented. Exactly one of the two fields is
// normally set: BearerToken for cross-origin callers (SIG-DESK's SPA talks to
// this Go API on a different origin than SIGTools, so the sig_token cookie
// cannot reach us and the SPA forwards the token it received at login), and
// CookieToken when the API happens to be same-site with the auth service.
type Credential struct {
	BearerToken string
	CookieToken string
}

func (credential Credential) IsEmpty() bool {
	return credential.BearerToken == "" && credential.CookieToken == ""
}

// Provider resolves a Credential into an Identity by asking the company-wide
// auth service. Kept as a port so the HTTP adapter can be swapped for a fake
// in tests and so no other layer learns how SIGTools is reached.
type Provider interface {
	Resolve(ctx context.Context, credential Credential) (domain.Identity, error)
}

// Authorizer decides what an authenticated caller may do *in SIG-DESK*.
//
// This is deliberately separate from Provider: authentication is shared with
// SIGInstallations and SIGInventory (the whole company authenticates against
// SIGTools/Active Directory), but authorization is not. SIG-DESK's roles and
// permissions live in SIG-DESK's own database, so the roles SIGTools reports
// for its other apps — designer, field_tech, inventory_op — never leak in
// here. Implemented by the rbac module.
type Authorizer interface {
	AuthorizeUser(ctx context.Context, identity domain.Identity) (roles []string, permissions []string, err error)
}
