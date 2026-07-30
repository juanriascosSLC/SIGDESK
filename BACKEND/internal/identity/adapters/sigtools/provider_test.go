package sigtools

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"sig-desk/backend/internal/identity/domain"
	"sig-desk/backend/internal/identity/ports"
)

func TestResolveForwardsBearerAndMapsProfile(t *testing.T) {
	var seenAuthorization string
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls++
		seenAuthorization = request.Header.Get("Authorization")
		if request.URL.Path != mePath {
			t.Errorf("path = %q, want %q", request.URL.Path, mePath)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"id": 42,
			"name": "Héctor Cruz",
			"email": "hcruz@sig.com",
			"username": "hcruz",
			"roles": ["agent"],
			"permissions": ["sigdesk.tickets.view", "sigdesk.tickets.comment"]
		}`))
	}))
	defer server.Close()

	provider := NewProvider(server.URL)
	identity, err := provider.Resolve(context.Background(), ports.Credential{BearerToken: "42|abc"})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if seenAuthorization != "Bearer 42|abc" {
		t.Errorf("Authorization = %q, want the bearer token forwarded", seenAuthorization)
	}
	if identity.ID != 42 || identity.Username != "hcruz" || identity.DisplayName() != "Héctor Cruz" {
		t.Errorf("identity not mapped from the profile: %#v", identity)
	}
	if !identity.Can("sigdesk.tickets.view") {
		t.Error("granted permission should be allowed")
	}
	if identity.Can("sigdesk.tickets.merge") {
		t.Error("permission that was not granted must be denied")
	}
	if identity.IsAdmin() {
		t.Error("a plain agent must not be admin")
	}

	// Second call within the TTL must be served from cache, so the auth
	// service is not hit once per request.
	if _, err := provider.Resolve(context.Background(), ports.Credential{BearerToken: "42|abc"}); err != nil {
		t.Fatalf("second Resolve: %v", err)
	}
	if calls != 1 {
		t.Errorf("auth service calls = %d, want 1 (second resolve should hit the cache)", calls)
	}
}

func TestResolveRejectsAndDistinguishesFailures(t *testing.T) {
	t.Run("no credential", func(t *testing.T) {
		provider := NewProvider("http://example.invalid")
		_, err := provider.Resolve(context.Background(), ports.Credential{})
		if !errors.Is(err, domain.ErrNoCredential) {
			t.Fatalf("err = %v, want ErrNoCredential", err)
		}
	})

	t.Run("rejected credential", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusUnauthorized)
			_, _ = writer.Write([]byte(`{"detail":"Invalid or expired session cookie."}`))
		}))
		defer server.Close()
		_, err := NewProvider(server.URL).Resolve(
			context.Background(), ports.Credential{BearerToken: "stale"},
		)
		if !errors.Is(err, domain.ErrInvalidCredential) {
			t.Fatalf("err = %v, want ErrInvalidCredential", err)
		}
	})

	// A 500 from the auth service must NOT look like a valid session, and must
	// also not look like an invalid one: we genuinely do not know, so the
	// caller has to surface 503 rather than silently logging the user out.
	t.Run("authority down is not the same as invalid", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()
		_, err := NewProvider(server.URL).Resolve(
			context.Background(), ports.Credential{BearerToken: "whatever"},
		)
		if !errors.Is(err, domain.ErrAuthorityUnavailable) {
			t.Fatalf("err = %v, want ErrAuthorityUnavailable", err)
		}
		if errors.Is(err, domain.ErrInvalidCredential) {
			t.Fatal("an unreachable authority must not be reported as an invalid credential")
		}
	})

	t.Run("unconfigured base url", func(t *testing.T) {
		_, err := NewProvider("").Resolve(
			context.Background(), ports.Credential{BearerToken: "x"},
		)
		if !errors.Is(err, domain.ErrAuthorityUnavailable) {
			t.Fatalf("err = %v, want ErrAuthorityUnavailable", err)
		}
	})
}

func TestResolveRevalidatesAfterTTLAndInvalidate(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		calls++
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"id":1,"name":"A","email":"a@sig.com","username":"a"}`))
	}))
	defer server.Close()

	current := time.Unix(0, 0).UTC()
	provider := NewProvider(server.URL,
		WithCacheTTL(30*time.Second),
		WithClock(func() time.Time { return current }),
	)
	credential := ports.Credential{BearerToken: "tok"}

	if _, err := provider.Resolve(context.Background(), credential); err != nil {
		t.Fatal(err)
	}
	current = current.Add(31 * time.Second) // TTL elapsed
	if _, err := provider.Resolve(context.Background(), credential); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Errorf("calls = %d, want 2 (cache must expire)", calls)
	}

	// An explicit logout must not keep working until the TTL runs out.
	provider.Invalidate(credential)
	if _, err := provider.Resolve(context.Background(), credential); err != nil {
		t.Fatal(err)
	}
	if calls != 3 {
		t.Errorf("calls = %d, want 3 (Invalidate must drop the cached identity)", calls)
	}
}

func TestIdentityAdminAndWildcards(t *testing.T) {
	t.Run("admin role bypasses checks", func(t *testing.T) {
		identity := domain.Identity{Roles: []string{"Admin"}}
		if !identity.IsAdmin() || !identity.Can("sigdesk.anything.at.all") {
			t.Error("admin role should grant everything")
		}
	})

	t.Run("module wildcard", func(t *testing.T) {
		identity := domain.Identity{Permissions: []string{"sigdesk.*"}}
		if !identity.Can("sigdesk.tickets.merge") {
			t.Error("sigdesk.* should cover sigdesk.tickets.merge")
		}
		if identity.Can("inventory.view") {
			t.Error("sigdesk.* must not leak into another module")
		}
	})

	// Regression guard for the bug the other two apps documented: level 1 is
	// handed to any user with a role, so it must never imply admin. Identity
	// does not even carry access_level, which makes the mistake unavailable.
	t.Run("no access level shortcut", func(t *testing.T) {
		identity := domain.Identity{Roles: []string{"viewer"}, Permissions: []string{"sigdesk.tickets.view"}}
		if identity.IsAdmin() {
			t.Error("a viewer must never be admin")
		}
		if identity.Can("sigdesk.tickets.resolve") {
			t.Error("viewer must not inherit unrelated permissions")
		}
	})
}
