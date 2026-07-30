package catalogintake_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	catalogMemory "sig-desk/backend/internal/catalog/adapters/memory"
	catalogModules "sig-desk/backend/internal/catalog/adapters/modules"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	"sig-desk/backend/internal/tickets/adapters/catalogintake"
	ticketDomain "sig-desk/backend/internal/tickets/domain"
)

func TestCreateEntityReturnsProjectionSafeIdempotencyKey(t *testing.T) {
	catalogService := catalogApplication.NewService(
		catalogMemory.NewRepository(catalogMemory.DemoDefinitions()...),
		catalogModules.NewDevelopmentRegistry(),
	)
	adapter := catalogintake.NewAdapter(catalogService)

	event, err := adapter.CreateEntity(context.Background(), "INC", map[string]any{
		"title":       "Camera offline",
		"description": "The entrance camera stopped responding.",
		"priority":    "critical",
		"category":    "legacy-only",
	}, "create-camera-1")
	if err != nil {
		t.Fatalf("CreateEntity() error = %v", err)
	}
	if len(event.EventID) > 64 {
		t.Fatalf("event id length = %d, database limit is 64", len(event.EventID))
	}
	if !strings.HasPrefix(event.EventID, "compat:") {
		t.Fatalf("event id = %q, want compat prefix", event.EventID)
	}
	if event.EntityID == "" || event.HumanID == "" {
		t.Fatalf("event lacks entity identity: %#v", event)
	}
	if _, exists := event.Data["category"]; exists {
		t.Fatalf("legacy-only field leaked into published schema: %#v", event.Data)
	}

	replayed, err := adapter.CreateEntity(context.Background(), "INC", map[string]any{
		"title":       "Camera offline",
		"description": "The entrance camera stopped responding.",
		"priority":    "critical",
	}, "create-camera-1")
	if err != nil {
		t.Fatalf("replayed CreateEntity() error = %v", err)
	}
	if !replayed.Replayed || replayed.EntityID != event.EntityID {
		t.Fatalf("idempotent replay created a different entity: %#v", replayed)
	}

	_, err = adapter.CreateEntity(context.Background(), "INC", map[string]any{
		"title":       "Different incident",
		"description": "This payload must conflict with the reused key.",
		"priority":    "high",
	}, "create-camera-1")
	if !errors.Is(err, ticketDomain.ErrIdempotencyConflict) {
		t.Fatalf("reused key error = %v, want ErrIdempotencyConflict", err)
	}
}
