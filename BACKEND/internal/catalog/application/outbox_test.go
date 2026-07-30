package application

import (
	"context"
	"testing"
	"time"

	"sig-desk/backend/internal/catalog/adapters/memory"
	"sig-desk/backend/internal/catalog/domain"
)

type eventPublisherStub struct {
	events []domain.EventEnvelope
}

func (publisher *eventPublisherStub) Publish(
	_ context.Context,
	event domain.EventEnvelope,
) error {
	publisher.events = append(publisher.events, event)
	return nil
}

func TestTransactionalOutboxPublishesCreatedAndTransitionedEventsOnce(t *testing.T) {
	ctx := context.Background()
	repository := memory.NewRepository()
	service := NewService(repository)
	definition := domain.Definition{
		EntityKey: "RFC",
		Name:      "Cambio",
		Specification: domain.Specification{
			Identity: domain.IdentityDefinition{Prefix: "RFC"},
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Título", Type: "text", Required: true},
			},
			Lifecycle: domain.LifecycleDefinition{
				States: []domain.StateDefinition{
					{Key: "requested", Label: "Solicitado", Initial: true},
					{Key: "approved", Label: "Aprobado"},
				},
				Transitions: []domain.TransitionDefinition{
					{Key: "approve", Label: "Aprobar", From: "requested", To: "approved"},
				},
			},
		},
	}
	draft, err := service.CreateDraft(ctx, definition)
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}
	if _, err := service.Publish(ctx, draft.EntityKey, draft.Version); err != nil {
		t.Fatalf("Publish() error = %v", err)
	}
	entity, err := service.CreateEntity(ctx, "RFC", map[string]any{"title": "Upgrade"})
	if err != nil {
		t.Fatalf("CreateEntity() error = %v", err)
	}

	publisher := &eventPublisherStub{}
	dispatcher, err := NewOutboxDispatcher(repository, publisher)
	if err != nil {
		t.Fatalf("NewOutboxDispatcher() error = %v", err)
	}
	fixedNow := time.Now().UTC().Add(time.Minute)
	dispatcher.now = func() time.Time { return fixedNow }
	published, err := dispatcher.DispatchOnce(ctx)
	if err != nil {
		t.Fatalf("DispatchOnce() error = %v", err)
	}
	if published != 1 || len(publisher.events) != 1 ||
		publisher.events[0].EventType != domain.EventEntityCreatedV1 {
		t.Fatalf("created event was not published once: %#v", publisher.events)
	}
	if published, err := dispatcher.DispatchOnce(ctx); err != nil || published != 0 {
		t.Fatalf("second DispatchOnce() = %d, %v; want 0, nil", published, err)
	}

	entity, err = service.UpdateEntity(
		ctx,
		"RFC",
		entity.ID,
		map[string]any{"title": "Upgrade firewall"},
		entity.UpdatedAt,
	)
	if err != nil {
		t.Fatalf("UpdateEntity() error = %v", err)
	}
	fixedNow = fixedNow.Add(time.Second)
	published, err = dispatcher.DispatchOnce(ctx)
	if err != nil {
		t.Fatalf("update DispatchOnce() error = %v", err)
	}
	if published != 1 || len(publisher.events) != 2 ||
		publisher.events[1].EventType != domain.EventEntityUpdatedV1 {
		t.Fatalf("updated event was not published once: %#v", publisher.events)
	}

	if _, err := service.TransitionEntity(ctx, "RFC", entity.ID, "approve"); err != nil {
		t.Fatalf("TransitionEntity() error = %v", err)
	}
	fixedNow = fixedNow.Add(time.Second)
	published, err = dispatcher.DispatchOnce(ctx)
	if err != nil {
		t.Fatalf("transition DispatchOnce() error = %v", err)
	}
	if published != 1 || len(publisher.events) != 3 ||
		publisher.events[2].EventType != domain.EventEntityTransitionedV1 {
		t.Fatalf("transition event was not published once: %#v", publisher.events)
	}
}
