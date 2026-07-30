// Package sigtools resolves an Identity against SIGTools, the company-wide
// auth service already used by SIGInstallations and SIGInventory.
//
// SIG-DESK does not re-implement authentication: it forwards whatever
// credential the caller presented to GET /api/v1/web-auth/me/ and trusts that
// answer. This keeps Active Directory, password policy, token revocation and
// the user record itself in exactly one place, and means a session created in
// any of the three apps is valid in all of them.
package sigtools

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"sig-desk/backend/internal/identity/domain"
	"sig-desk/backend/internal/identity/ports"
)

const (
	mePath            = "/api/v1/web-auth/me/"
	defaultTimeout    = 8 * time.Second
	defaultCacheTTL   = 60 * time.Second
	cacheJanitorEvery = 5 * time.Minute
)

type cacheEntry struct {
	identity  domain.Identity
	expiresAt time.Time
}

type Provider struct {
	baseURL    string
	httpClient *http.Client
	cacheTTL   time.Duration
	now        func() time.Time

	mutex       sync.RWMutex
	cache       map[string]cacheEntry
	lastCleanup time.Time
}

type Option func(*Provider)

func WithHTTPClient(client *http.Client) Option {
	return func(provider *Provider) { provider.httpClient = client }
}

func WithCacheTTL(ttl time.Duration) Option {
	return func(provider *Provider) { provider.cacheTTL = ttl }
}

func WithClock(now func() time.Time) Option {
	return func(provider *Provider) { provider.now = now }
}

func NewProvider(baseURL string, options ...Option) *Provider {
	provider := &Provider{
		baseURL:    strings.TrimSuffix(strings.TrimSpace(baseURL), "/"),
		httpClient: &http.Client{Timeout: defaultTimeout},
		cacheTTL:   defaultCacheTTL,
		now:        time.Now,
		cache:      make(map[string]cacheEntry),
	}
	for _, option := range options {
		option(provider)
	}
	provider.lastCleanup = provider.now()
	return provider
}

// meResponse mirrors GET /api/v1/web-auth/me/. Roles and permissions are
// optional in the payload: older deployments of the auth service return only
// the profile, in which case the caller ends up authenticated with no
// permissions, and every non-admin check denies. That is the safe default.
type meResponse struct {
	ID          int      `json:"id"`
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Username    *string  `json:"username"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
}

func (provider *Provider) Resolve(
	ctx context.Context,
	credential ports.Credential,
) (domain.Identity, error) {
	if credential.IsEmpty() {
		return domain.Identity{}, domain.ErrNoCredential
	}
	if provider.baseURL == "" {
		return domain.Identity{}, fmt.Errorf(
			"%w: SIGTOOLS_API_URL is not configured",
			domain.ErrAuthorityUnavailable,
		)
	}

	key := cacheKey(credential)
	if identity, ok := provider.fromCache(key); ok {
		return identity, nil
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.baseURL+mePath, nil)
	if err != nil {
		return domain.Identity{}, fmt.Errorf("%w: %v", domain.ErrAuthorityUnavailable, err)
	}
	request.Header.Set("Accept", "application/json")
	// Forward whichever credential arrived. The auth service accepts the
	// cookie first and the bearer token as a fallback, so presenting both is
	// safe and lets a same-site caller and a cross-origin SPA share this path.
	if credential.BearerToken != "" {
		request.Header.Set("Authorization", "Bearer "+credential.BearerToken)
	}
	if credential.CookieToken != "" {
		request.AddCookie(&http.Cookie{Name: "sig_token", Value: credential.CookieToken})
	}

	response, err := provider.httpClient.Do(request)
	if err != nil {
		return domain.Identity{}, fmt.Errorf("%w: %v", domain.ErrAuthorityUnavailable, err)
	}
	defer response.Body.Close()

	switch {
	case response.StatusCode == http.StatusOK:
		var payload meResponse
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			return domain.Identity{}, fmt.Errorf(
				"%w: could not decode profile: %v",
				domain.ErrAuthorityUnavailable, err,
			)
		}
		identity := domain.Identity{
			ID:          payload.ID,
			Name:        payload.Name,
			Email:       payload.Email,
			Roles:       payload.Roles,
			Permissions: payload.Permissions,
		}
		if payload.Username != nil {
			identity.Username = *payload.Username
		}
		provider.store(key, identity)
		return identity, nil

	case response.StatusCode == http.StatusUnauthorized,
		response.StatusCode == http.StatusForbidden:
		return domain.Identity{}, domain.ErrInvalidCredential

	default:
		return domain.Identity{}, fmt.Errorf(
			"%w: auth service responded %d",
			domain.ErrAuthorityUnavailable, response.StatusCode,
		)
	}
}

// cacheKey never stores the raw token: only a digest of it, so a memory dump
// of this process does not hand over usable session credentials.
func cacheKey(credential ports.Credential) string {
	sum := sha256.Sum256([]byte(credential.BearerToken + "|" + credential.CookieToken))
	return hex.EncodeToString(sum[:])
}

func (provider *Provider) fromCache(key string) (domain.Identity, bool) {
	provider.mutex.RLock()
	entry, ok := provider.cache[key]
	provider.mutex.RUnlock()
	if !ok || provider.now().After(entry.expiresAt) {
		return domain.Identity{}, false
	}
	return entry.identity, true
}

func (provider *Provider) store(key string, identity domain.Identity) {
	now := provider.now()
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	provider.cache[key] = cacheEntry{identity: identity, expiresAt: now.Add(provider.cacheTTL)}
	// Opportunistic sweep: without it, a long-running process accumulates one
	// entry per session token seen, forever.
	if now.Sub(provider.lastCleanup) < cacheJanitorEvery {
		return
	}
	for cached, entry := range provider.cache {
		if now.After(entry.expiresAt) {
			delete(provider.cache, cached)
		}
	}
	provider.lastCleanup = now
}

// Invalidate drops a cached identity so a logout takes effect immediately
// instead of lingering for the remainder of the TTL.
func (provider *Provider) Invalidate(credential ports.Credential) {
	key := cacheKey(credential)
	provider.mutex.Lock()
	delete(provider.cache, key)
	provider.mutex.Unlock()
}

var _ ports.Provider = (*Provider)(nil)
