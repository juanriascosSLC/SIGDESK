// Package httpmw carries the authenticated caller from the HTTP edge into the
// request context, and guards routes by permission.
//
// It replaces the earlier X-Actor-ID / X-Actor-Roles headers, which any client
// could set freely — the authorization layer was enforcing policies against an
// identity the caller had simply asserted. Credentials are now validated
// against SIGTools, the company-wide auth service.
package httpmw

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	catalogPorts "sig-desk/backend/internal/catalog/ports"
	"sig-desk/backend/internal/identity/domain"
	"sig-desk/backend/internal/identity/ports"
)

// Authenticator resolves credentials and knows whether authentication is
// switched off for a local development run.
type Authenticator struct {
	provider     ports.Provider
	authorizer   ports.Authorizer
	authDisabled bool
}

func NewAuthenticator(provider ports.Provider, options ...Option) *Authenticator {
	authenticator := &Authenticator{provider: provider}
	for _, option := range options {
		option(authenticator)
	}
	return authenticator
}

type Option func(*Authenticator)

// WithAuthorizer makes SIG-DESK's own roles and permissions the authority for
// what a caller may do. Without it, whatever roles/permissions the auth service
// happened to report are used — which is only appropriate in tests that stub
// the provider directly.
func WithAuthorizer(authorizer ports.Authorizer) Option {
	return func(authenticator *Authenticator) { authenticator.authorizer = authorizer }
}

// NewDisabledAuthenticator is for local development without an auth service.
// Every request is treated as permitted but anonymous, so audit trails show no
// actor rather than a fabricated one. main refuses to build this in production.
func NewDisabledAuthenticator() *Authenticator {
	return &Authenticator{authDisabled: true}
}

// Resolve attaches the authentication outcome to the request context. It never
// rejects on its own: an anonymous request may still be legitimate (health
// checks, and the login flow itself lives in SIGTools, not here). Enforcement
// belongs to RequireAuth / RequirePermission on the specific route.
func (authenticator *Authenticator) Resolve(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if authenticator.authDisabled {
			next.ServeHTTP(writer, request.WithContext(
				ports.ContextWithResolution(request.Context(), ports.Resolution{AuthDisabled: true}),
			))
			return
		}

		credential := credentialFrom(request)
		if credential.IsEmpty() {
			next.ServeHTTP(writer, request.WithContext(
				ports.ContextWithResolution(request.Context(), ports.Resolution{
					Err: domain.ErrNoCredential,
				}),
			))
			return
		}

		identity, err := authenticator.provider.Resolve(request.Context(), credential)
		if err != nil {
			next.ServeHTTP(writer, request.WithContext(
				ports.ContextWithResolution(request.Context(), ports.Resolution{Err: err}),
			))
			return
		}

		// SIGTools said who this is. What they may do is SIG-DESK's decision,
		// so its own roles and permissions replace whatever the shared auth
		// service reported for its other applications.
		if authenticator.authorizer != nil {
			roles, permissions, authorizeErr := authenticator.authorizer.AuthorizeUser(
				request.Context(), identity,
			)
			if authorizeErr != nil {
				// Failing open would hand out whatever SIGTools reported, and
				// failing silently closed would look like "you have no
				// permissions" — which reads as a misconfigured account rather
				// than an outage. Report it as an authority problem (503).
				next.ServeHTTP(writer, request.WithContext(
					ports.ContextWithResolution(request.Context(), ports.Resolution{
						Err: fmt.Errorf("%w: %v", domain.ErrAuthorityUnavailable, authorizeErr),
					}),
				))
				return
			}
			identity.Roles = roles
			identity.Permissions = permissions
		}

		ctx := ports.ContextWithResolution(request.Context(), ports.Resolution{
			Identity:      identity,
			Authenticated: true,
		})
		// Mirror the identity into the Catalog module's Principal so its IAM
		// policy checks keep working against a real, verified caller.
		ctx = catalogPorts.ContextWithPrincipal(ctx, catalogPorts.Principal{
			ID:    identity.Username,
			Roles: identity.Roles,
		})
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

// credentialFrom prefers the bearer token because SIG-DESK's SPA is served
// from a different origin than the auth service, so the sig_token cookie
// cannot reach this API; the SPA forwards the token it received at login. The
// cookie is still honoured for same-site callers and server-to-server calls.
func credentialFrom(request *http.Request) ports.Credential {
	credential := ports.Credential{}
	if header := request.Header.Get("Authorization"); header != "" {
		if fields := strings.Fields(header); len(fields) == 2 && strings.EqualFold(fields[0], "Bearer") {
			credential.BearerToken = fields[1]
		}
	}
	if cookie, err := request.Cookie("sig_token"); err == nil {
		credential.CookieToken = cookie.Value
	}
	return credential
}

// RequireAuth rejects anonymous callers. Use for routes that need a known user
// but no specific permission.
func (authenticator *Authenticator) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return authenticator.RequirePermission("", next)
}

// RequirePermission rejects anonymous callers and those lacking the permission
// key. An empty key checks authentication only.
func (authenticator *Authenticator) RequirePermission(
	permission string,
	next http.HandlerFunc,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		resolution := ports.ResolutionFromContext(request.Context())

		if resolution.AuthDisabled {
			next(writer, request)
			return
		}
		if !resolution.Authenticated {
			writeAuthError(writer, resolution.Err)
			return
		}
		if permission != "" && !resolution.Identity.Can(permission) {
			writeJSON(writer, http.StatusForbidden, map[string]string{
				"error": "you do not have the " + permission + " permission",
			})
			return
		}
		next(writer, request)
	}
}

// RequireAnyPermission is used by cross-domain runtime resources such as
// typed relations. It still requires a verified identity, but accepts any one
// of the explicitly listed domain permissions.
func (authenticator *Authenticator) RequireAnyPermission(
	permissions []string,
	next http.HandlerFunc,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		resolution := ports.ResolutionFromContext(request.Context())
		if resolution.AuthDisabled {
			next(writer, request)
			return
		}
		if !resolution.Authenticated {
			writeAuthError(writer, resolution.Err)
			return
		}
		for _, permission := range permissions {
			if resolution.Identity.Can(permission) {
				next(writer, request)
				return
			}
		}
		writeJSON(writer, http.StatusForbidden, map[string]string{
			"error": "you do not have permission to access this entity domain",
		})
	}
}

func writeAuthError(writer http.ResponseWriter, err error) {
	switch {
	// An unreachable authority is not a rejected session. Answering 401 here
	// would make every client wipe its session during an outage of a service
	// SIG-DESK does not control.
	case errors.Is(err, domain.ErrAuthorityUnavailable):
		writer.Header().Set("Retry-After", "5")
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{
			"error": "authentication service is unavailable, please retry",
		})
	case errors.Is(err, domain.ErrInvalidCredential):
		writeJSON(writer, http.StatusUnauthorized, map[string]string{
			"error": "your session expired, please sign in again",
		})
	default:
		writeJSON(writer, http.StatusUnauthorized, map[string]string{
			"error": "authentication is required",
		})
	}
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
