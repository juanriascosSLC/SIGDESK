package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCorsAllowsCredentialedFrontendRequests(t *testing.T) {
	handler := cors("http://localhost:3003", http.HandlerFunc(
		func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusOK)
		},
	))
	request := httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil)
	request.Header.Set("Origin", "http://localhost:3003")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.Code)
	}
	if origin := response.Header().Get("Access-Control-Allow-Origin"); origin != "http://localhost:3003" {
		t.Fatalf("allow origin = %q", origin)
	}
	if credentials := response.Header().Get("Access-Control-Allow-Credentials"); credentials != "true" {
		t.Fatalf("allow credentials = %q, browser credentialed fetches require true", credentials)
	}
}

func TestCorsDoesNotGrantCredentialsToUnknownOrigin(t *testing.T) {
	handler := cors("http://localhost:3003", http.HandlerFunc(
		func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusOK)
		},
	))
	request := httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil)
	request.Header.Set("Origin", "http://attacker.invalid")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if origin := response.Header().Get("Access-Control-Allow-Origin"); origin != "" {
		t.Fatalf("unknown origin received CORS grant %q", origin)
	}
	if credentials := response.Header().Get("Access-Control-Allow-Credentials"); credentials != "" {
		t.Fatalf("unknown origin received credential grant %q", credentials)
	}
}
