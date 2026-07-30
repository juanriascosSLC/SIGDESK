package catalogevents_test

import (
	"context"
	"errors"
	"testing"
	"time"

	catalogMemory "sig-desk/backend/internal/catalog/adapters/memory"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	platformEvents "sig-desk/backend/internal/platform/events"
	"sig-desk/backend/internal/tickets/adapters/catalogevents"
	"sig-desk/backend/internal/tickets/adapters/catalogintake"
	ticketMemory "sig-desk/backend/internal/tickets/adapters/memory"
	ticketApplication "sig-desk/backend/internal/tickets/application"
	ticketDomain "sig-desk/backend/internal/tickets/domain"
)

func TestOutboxProjectsGenericIncidentIntoTicketsReadModel(t *testing.T) {
	ctx := context.Background()
	catalogRepository := catalogMemory.NewRepository()
	catalogService := catalogApplication.NewService(catalogRepository)
	definition := catalogDomain.Definition{
		EntityKey: "INC",
		Name:      "Incidente",
		Specification: catalogDomain.Specification{
			Identity: catalogDomain.IdentityDefinition{Prefix: "INC"},
			Fields: []catalogDomain.FieldDefinition{
				{Key: "title", Label: "Título", Type: "text", Required: true},
				{Key: "description", Label: "Descripción", Type: "textarea", Required: true},
				{
					Key: "priority", Label: "Prioridad", Type: "select", Required: true,
					Options: []catalogDomain.FieldOption{
						{Value: "critical", Label: "Crítica"},
					},
				},
				{Key: "category", Label: "Categoría", Type: "text", Required: true},
			},
			Lifecycle: catalogDomain.LifecycleDefinition{
				States: []catalogDomain.StateDefinition{
					{Key: "open", Label: "Abierto", Initial: true},
					{Key: "in_progress", Label: "En progreso"},
				},
				Transitions: []catalogDomain.TransitionDefinition{
					{Key: "start", Label: "Iniciar", From: "open", To: "in_progress"},
				},
			},
		},
	}
	draft, err := catalogService.CreateDraft(ctx, definition)
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}
	if _, err := catalogService.Publish(ctx, "INC", draft.Version); err != nil {
		t.Fatalf("Publish() error = %v", err)
	}

	ticketRepository := ticketMemory.NewRepository(nil)
	ticketService := ticketApplication.NewService(
		ticketRepository,
		nil,
		catalogintake.NewAdapter(catalogService),
	)
	consumer := catalogevents.NewConsumer(ticketService)
	bus := platformEvents.NewBus()
	bus.Subscribe(platformEvents.Subscription{
		Name: "tickets",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1:      true,
			catalogDomain.EventEntityUpdatedV1:      true,
			catalogDomain.EventEntityTransitionedV1: true,
		},
		Handler: consumer.Handle,
	})
	dispatcher, err := catalogApplication.NewOutboxDispatcher(catalogRepository, bus)
	if err != nil {
		t.Fatalf("NewOutboxDispatcher() error = %v", err)
	}

	entity, err := catalogService.CreateEntity(ctx, "INC", map[string]any{
		"title":       "Camera offline",
		"description": "Entrance camera is not responding",
		"priority":    "critical",
		"category":    "hardware",
	})
	if err != nil {
		t.Fatalf("CreateEntity() error = %v", err)
	}
	time.Sleep(time.Millisecond)
	if _, err := dispatcher.DispatchOnce(ctx); err != nil {
		t.Fatalf("dispatch created event: %v", err)
	}
	ticket, err := ticketRepository.GetByID(ctx, entity.HumanID)
	if err != nil {
		t.Fatalf("projected ticket not found: %v", err)
	}
	if ticket.EntityID == nil || *ticket.EntityID != entity.ID || ticket.Status != ticketDomain.StatusOpen {
		t.Fatalf("invalid projected ticket: %#v", ticket)
	}

	entity, err = catalogService.UpdateEntity(
		ctx,
		"INC",
		entity.ID,
		map[string]any{
			"title":       "Camera offline at main gate",
			"description": "Entrance camera is not responding",
			"priority":    "critical",
			"category":    "hardware",
		},
		entity.UpdatedAt,
	)
	if err != nil {
		t.Fatalf("UpdateEntity() error = %v", err)
	}
	time.Sleep(time.Millisecond)
	if _, err := dispatcher.DispatchOnce(ctx); err != nil {
		t.Fatalf("dispatch updated event: %v", err)
	}
	ticket, err = ticketRepository.GetByID(ctx, entity.HumanID)
	if err != nil {
		t.Fatalf("projected ticket after update not found: %v", err)
	}
	if ticket.Title != "Camera offline at main gate" {
		t.Fatalf("projected ticket title = %q", ticket.Title)
	}
	activity, err := ticketRepository.ListActivity(ctx, entity.HumanID)
	if err != nil {
		t.Fatalf("ListActivity() error = %v", err)
	}
	if len(activity) == 0 || activity[len(activity)-1].Kind != ticketDomain.ActivityFieldsUpdated {
		t.Fatalf("field update activity missing: %#v", activity)
	}

	if _, err := ticketService.UpdateStatus(
		ctx,
		entity.HumanID,
		ticketDomain.StatusResolved,
		nil,
	); !errors.Is(err, ticketDomain.ErrInvalidTransition) {
		t.Fatalf("invalid Catalog transition error = %v, want ErrInvalidTransition", err)
	}

	updated, err := ticketService.UpdateStatus(
		ctx,
		entity.HumanID,
		ticketDomain.StatusInProgress,
		nil,
	)
	if err != nil {
		t.Fatalf("UpdateStatus() through Catalog runtime error = %v", err)
	}
	if updated.Status != ticketDomain.StatusInProgress {
		t.Fatalf("UpdateStatus() returned %q, want in_progress", updated.Status)
	}
	time.Sleep(time.Millisecond)
	if _, err := dispatcher.DispatchOnce(ctx); err != nil {
		t.Fatalf("dispatch transition event: %v", err)
	}
	ticket, err = ticketRepository.GetByID(ctx, entity.HumanID)
	if err != nil {
		t.Fatalf("projected ticket after transition not found: %v", err)
	}
	if ticket.Status != ticketDomain.StatusInProgress {
		t.Fatalf("projected ticket status = %q, want in_progress", ticket.Status)
	}
}
