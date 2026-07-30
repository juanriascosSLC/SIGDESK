package ports

import (
	"context"

	"sig-desk/backend/internal/identity/domain"
)

// Resolution is what the authentication middleware attaches to every request:
// either an Identity or the reason we do not have one. Both cases are carried
// explicitly so a handler can tell "nobody is logged in" (401) apart from
// "the auth service is down" (503) — collapsing those would log users out
// during an outage of a system SIG-DESK does not own.
type Resolution struct {
	Identity      domain.Identity
	Authenticated bool
	Err           error
	// AuthDisabled is true when the deployment runs without an auth authority
	// configured (local development only). Guards treat the caller as allowed
	// but nothing pretends an Identity exists.
	AuthDisabled bool
}

type resolutionContextKey struct{}

func ContextWithResolution(ctx context.Context, resolution Resolution) context.Context {
	return context.WithValue(ctx, resolutionContextKey{}, resolution)
}

func ResolutionFromContext(ctx context.Context) Resolution {
	resolution, _ := ctx.Value(resolutionContextKey{}).(Resolution)
	return resolution
}

// IdentityFromContext is the convenience accessor for handlers that only care
// about who the caller is. The boolean is false for anonymous requests and for
// auth-disabled development runs.
func IdentityFromContext(ctx context.Context) (domain.Identity, bool) {
	resolution := ResolutionFromContext(ctx)
	return resolution.Identity, resolution.Authenticated
}

// ActorFromContext returns a display name suitable for audit trails, or nil
// when the caller is anonymous. Tickets uses this instead of trusting an
// actorName supplied in the request body.
func ActorFromContext(ctx context.Context) *string {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return nil
	}
	name := identity.DisplayName()
	return &name
}
