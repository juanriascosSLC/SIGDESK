package httpserver

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	catalogMemory "sig-desk/backend/internal/catalog/adapters/memory"
	catalogModules "sig-desk/backend/internal/catalog/adapters/modules"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	changesApplication "sig-desk/backend/internal/changes/application"
	"sig-desk/backend/internal/identity/adapters/httpmw"
	identityDomain "sig-desk/backend/internal/identity/domain"
	identityPorts "sig-desk/backend/internal/identity/ports"
	"sig-desk/backend/internal/platform/config"
	"sig-desk/backend/internal/tickets/adapters/blobstore"
	"sig-desk/backend/internal/tickets/adapters/catalogintake"
	"sig-desk/backend/internal/tickets/adapters/memory"
	"sig-desk/backend/internal/tickets/application"
)

// stubProvider stands in for SIGTools so these tests exercise the guards
// without reaching the real auth service.
type stubProvider struct {
	identities map[string]identityDomain.Identity
	err        error
}

func (stub stubProvider) Resolve(
	_ context.Context,
	credential identityPorts.Credential,
) (identityDomain.Identity, error) {
	if stub.err != nil {
		return identityDomain.Identity{}, stub.err
	}
	identity, ok := stub.identities[credential.BearerToken]
	if !ok {
		return identityDomain.Identity{}, identityDomain.ErrInvalidCredential
	}
	return identity, nil
}

func newAuthenticatedHandler(t *testing.T, provider identityPorts.Provider) http.Handler {
	t.Helper()
	attachmentStore, err := blobstore.NewLocalDisk(t.TempDir())
	if err != nil {
		t.Fatalf("prepare attachment store: %v", err)
	}
	catalogService := catalogApplication.NewService(
		catalogMemory.NewRepository(catalogMemory.DemoDefinitions()...),
		catalogModules.NewDevelopmentRegistry(),
	)
	return New(Dependencies{
		Config: config.Config{
			Environment:    "test",
			FrontendOrigin: "http://localhost:3003,http://localhost:5173,http://localhost:5199",
			SigtoolsAPIURL: "http://auth.invalid",
		},
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		TicketService: application.NewService(
			memory.NewRepository(memory.DemoTickets()),
			attachmentStore,
			catalogintake.NewAdapter(catalogService),
		),
		CatalogService: catalogService,
		ChangeService:  changesApplication.NewService(catalogService),
		Authenticator:  httpmw.NewAuthenticator(provider),
		ReadyCheck:     func(context.Context) error { return nil },
	})
}

func TestProtectedRoutesRejectAnonymousAndUnprivileged(t *testing.T) {
	provider := stubProvider{identities: map[string]identityDomain.Identity{
		"viewer-token": {
			ID: 7, Username: "viewer", Name: "Read Only",
			Permissions: []string{identityDomain.PermTicketsView},
		},
		"change-viewer-token": {
			ID: 8, Username: "change-viewer", Name: "Change Viewer",
			Permissions: []string{identityDomain.PermChangesView},
		},
	}}
	handler := newAuthenticatedHandler(t, provider)

	t.Run("no credential is 401", func(t *testing.T) {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401; body=%s", response.Code, response.Body.String())
		}
	})

	// The old middleware believed these headers outright, so this request used
	// to be a full admin. It must now be worth nothing.
	t.Run("forged actor headers grant nothing", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil)
		request.Header.Set("X-Actor-ID", "attacker")
		request.Header.Set("X-Actor-Roles", "admin")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401 (headers must not authenticate)", response.Code)
		}
	})

	t.Run("invalid token is 401", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil)
		request.Header.Set("Authorization", "Bearer expired")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", response.Code)
		}
	})

	t.Run("valid token with the permission is allowed", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil)
		request.Header.Set("Authorization", "Bearer viewer-token")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body=%s", response.Code, response.Body.String())
		}
	})

	t.Run("valid token without the permission is 403", func(t *testing.T) {
		request := httptest.NewRequest(
			http.MethodPatch,
			"/api/v1/tickets/INC-900001/status",
			strings.NewReader(`{"status":"in_progress"}`),
		)
		request.Header.Set("Authorization", "Bearer viewer-token")
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403; body=%s", response.Code, response.Body.String())
		}
	})

	t.Run("ticket permission does not grant change access", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/changes", nil)
		request.Header.Set("Authorization", "Bearer viewer-token")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403; body=%s", response.Code, response.Body.String())
		}
	})

	t.Run("change permission grants the RFC board without ticket access", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/changes", nil)
		request.Header.Set("Authorization", "Bearer change-viewer-token")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body=%s", response.Code, response.Body.String())
		}
	})

	// Health checks must stay open or the container orchestrator cannot tell a
	// deploy apart from an outage.
	t.Run("health checks stay public", func(t *testing.T) {
		for _, path := range []string{"/health/live", "/health/ready"} {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
			if response.Code != http.StatusOK {
				t.Errorf("%s status = %d, want 200", path, response.Code)
			}
		}
	})
}

// A dead auth service must not read as "your session expired": clients would
// wipe a perfectly good session because a system SIG-DESK does not own is down.
func TestAuthorityOutageIsNotUnauthorized(t *testing.T) {
	handler := newAuthenticatedHandler(t, stubProvider{err: identityDomain.ErrAuthorityUnavailable})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil)
	request.Header.Set("Authorization", "Bearer anything")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", response.Code)
	}
	if response.Header().Get("Retry-After") == "" {
		t.Error("a 503 should tell the client when to retry")
	}
}

func TestActorComesFromSessionNotRequestBody(t *testing.T) {
	provider := stubProvider{identities: map[string]identityDomain.Identity{
		"agent-token": {
			ID: 42, Username: "hcruz", Name: "Héctor Cruz",
			Permissions: []string{
				identityDomain.PermTicketsView,
				identityDomain.PermTicketsComment,
			},
		},
	}}
	handler := newAuthenticatedHandler(t, provider)

	// The body claims someone else wrote this comment. The stored author must
	// be the authenticated caller regardless.
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/tickets/INC-900001/comments",
		strings.NewReader(`{"authorName":"Someone Else","body":"impersonation attempt","isInternal":false}`),
	)
	request.Header.Set("Authorization", "Bearer agent-token")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", response.Code, response.Body.String())
	}
	var comment struct {
		AuthorName string `json:"authorName"`
	}
	if err := json.NewDecoder(response.Body).Decode(&comment); err != nil {
		t.Fatalf("decode comment: %v", err)
	}
	if comment.AuthorName != "Héctor Cruz" {
		t.Fatalf("authorName = %q, want the authenticated user (body value must be ignored)", comment.AuthorName)
	}
}

func TestMeReportsIdentityAndPermissionCatalog(t *testing.T) {
	provider := stubProvider{identities: map[string]identityDomain.Identity{
		"tok": {ID: 1, Username: "u", Name: "U", Roles: []string{"agent"}},
	}}
	handler := newAuthenticatedHandler(t, provider)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	request.Header.Set("Authorization", "Bearer tok")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", response.Code, response.Body.String())
	}

	var payload struct {
		Identity struct {
			Username string `json:"username"`
		} `json:"identity"`
		IsAdmin           bool `json:"isAdmin"`
		PermissionCatalog []struct {
			Key string `json:"key"`
			App string `json:"app"`
		} `json:"permissionCatalog"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode /me: %v", err)
	}
	if payload.Identity.Username != "u" || payload.IsAdmin {
		t.Fatalf("unexpected identity payload: %#v", payload)
	}
	if len(payload.PermissionCatalog) == 0 {
		t.Fatal("/me must advertise the permission keys SIG-DESK defines")
	}
	for _, entry := range payload.PermissionCatalog {
		if entry.App != "sigdesk" {
			t.Errorf("permission %q has app %q, want sigdesk", entry.Key, entry.App)
		}
	}
}

// A single allowed origin used to silently block the other dev ports: the
// browser refuses the response and nothing reaches the API logs, so the symptom
// looks like "the frontend is not calling the backend at all".
func TestCORSAcceptsEveryConfiguredOrigin(t *testing.T) {
	handler := newAuthenticatedHandler(t, stubProvider{})

	for _, origin := range []string{
		"http://localhost:3003",
		"http://localhost:5173",
		"http://localhost:5199",
		"http://127.0.0.1:5199", // localhost/127.0.0.1 counterpart
	} {
		request := httptest.NewRequest(http.MethodOptions, "/api/v1/tickets", nil)
		request.Header.Set("Origin", origin)
		request.Header.Set("Access-Control-Request-Method", "GET")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)

		if allowed := response.Header().Get("Access-Control-Allow-Origin"); allowed != origin {
			t.Errorf("origin %q: Allow-Origin = %q, want it echoed back", origin, allowed)
		}
		// Credentials must be allowed or the bearer/cookie never travels.
		if response.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Errorf("origin %q: credentials not allowed", origin)
		}
	}

	// An origin that was never configured still has to be refused.
	request := httptest.NewRequest(http.MethodOptions, "/api/v1/tickets", nil)
	request.Header.Set("Origin", "http://evil.example")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("an unconfigured origin must not be allowed")
	}
}
