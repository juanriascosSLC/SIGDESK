package integration_test

import (
	"context"
	"errors"
	"testing"

	catalogModules "sig-desk/backend/internal/catalog/adapters/modules"
	catalogPostgres "sig-desk/backend/internal/catalog/adapters/postgres"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/platform/testsupport/pgtest"
	slaPostgres "sig-desk/backend/internal/sla/adapters/postgres"
	slaApplication "sig-desk/backend/internal/sla/application"
	ticketEvents "sig-desk/backend/internal/tickets/adapters/catalogevents"
	"sig-desk/backend/internal/tickets/adapters/catalogintake"
	ticketPostgres "sig-desk/backend/internal/tickets/adapters/postgres"
	ticketApplication "sig-desk/backend/internal/tickets/application"
	ticketDomain "sig-desk/backend/internal/tickets/domain"

	platformEvents "sig-desk/backend/internal/platform/events"

	"sig-desk/backend/migrations"
)

// incidentLifecycleWithClosed is the same shape seedIncidentDefinitionV3
// publishes (cmd/api/seed.go), duplicated here rather than imported: it lives
// in package main and cannot be imported from a test in another module path,
// the same reason incident_golden_path_test.go already duplicates a similar
// definition instead of sharing one with cmd/api.
func incidentLifecycleWithClosed() catalogDomain.LifecycleDefinition {
	return catalogDomain.LifecycleDefinition{
		States: []catalogDomain.StateDefinition{
			{Key: "open", Label: "Open", Initial: true},
			{Key: "in_progress", Label: "In progress"},
			{Key: "pending_review", Label: "Pending review"},
			{Key: "resolved", Label: "Resolved"},
			{Key: "closed", Label: "Closed"},
		},
		Transitions: []catalogDomain.TransitionDefinition{
			{Key: "start", Label: "Start", From: "open", To: "in_progress"},
			{Key: "request_review", Label: "Request review", From: "in_progress", To: "pending_review"},
			{Key: "resolve", Label: "Resolve", From: "in_progress", To: "resolved"},
			{Key: "resolve_from_review", Label: "Resolve", From: "pending_review", To: "resolved"},
			{Key: "reopen", Label: "Reopen", From: "resolved", To: "open"},
			{Key: "close", Label: "Close", From: "resolved", To: "closed"},
			{Key: "reopen_from_closed", Label: "Reopen", From: "closed", To: "open"},
		},
	}
}

func incidentDefinitionDraft(lifecycle catalogDomain.LifecycleDefinition) catalogDomain.Definition {
	return catalogDomain.Definition{
		EntityKey: "INC",
		Name:      "Incident",
		Specification: catalogDomain.Specification{
			Identity: catalogDomain.IdentityDefinition{Prefix: "INC"},
			Fields: []catalogDomain.FieldDefinition{
				{Key: "title", Label: "Title", Type: "text", Required: true},
				{Key: "description", Label: "Description", Type: "textarea", Required: true},
				{
					Key: "priority", Label: "Priority", Type: "select", Required: true,
					Options: []catalogDomain.FieldOption{
						{Value: "critical", Label: "Critical"},
						{Value: "high", Label: "High"},
					},
				},
			},
			Lifecycle: lifecycle,
			Bindings: []catalogDomain.ResourceBinding{
				{Module: "sla", ResourceType: "policy", ResourceID: "sla:policy:incident-standard"},
			},
			Views: map[string][]string{
				"create": {"title", "description", "priority"},
			},
		},
	}
}

type postgresGoldenPathHarness struct {
	catalogService *catalogApplication.Service
	ticketService  *ticketApplication.Service
	slaService     *slaApplication.Service
	dispatcher     *catalogApplication.OutboxDispatcher
}

func newPostgresGoldenPathHarness(t *testing.T) postgresGoldenPathHarness {
	t.Helper()
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	catalogRepository := catalogPostgres.NewRepository(pool)
	catalogService := catalogApplication.NewService(catalogRepository, catalogModules.NewDevelopmentRegistry())

	slaService := slaApplication.NewService(slaPostgres.NewRepository(pool))
	ticketService := ticketApplication.NewService(
		ticketPostgres.NewRepository(pool),
		nil,
		catalogintake.NewAdapter(catalogService),
	)

	eventBus := platformEvents.NewBus()
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "sla",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1:      true,
			catalogDomain.EventEntityUpdatedV1:      true,
			catalogDomain.EventEntityTransitionedV1: true,
		},
		Handler: slaService.HandleEvent,
	})
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "tickets",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1:      true,
			catalogDomain.EventEntityUpdatedV1:      true,
			catalogDomain.EventEntityTransitionedV1: true,
		},
		Handler: ticketEvents.NewConsumer(ticketService).Handle,
	})
	dispatcher, err := catalogApplication.NewOutboxDispatcher(catalogRepository, eventBus)
	if err != nil {
		t.Fatalf("NewOutboxDispatcher() error = %v", err)
	}

	return postgresGoldenPathHarness{
		catalogService: catalogService,
		ticketService:  ticketService,
		slaService:     slaService,
		dispatcher:     dispatcher,
	}
}

func publishIncidentDefinition(
	t *testing.T,
	catalogService *catalogApplication.Service,
	lifecycle catalogDomain.LifecycleDefinition,
) catalogDomain.Definition {
	t.Helper()
	ctx := context.Background()
	draft, err := catalogService.CreateDraft(ctx, incidentDefinitionDraft(lifecycle))
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}
	published, err := catalogService.Publish(ctx, "INC", draft.Version)
	if err != nil {
		t.Fatalf("Publish() error = %v", err)
	}
	return published
}

// actorName is a fixed, non-nil actor used throughout so every recorded
// activity entry can be asserted against a known value instead of "whatever
// was passed."
func actorName() *string {
	name := "playwright-golden-path-actor"
	return &name
}

// TestMetadataDrivenIncidentGoldenPath_Postgres is
// TestMetadataDrivenIncidentGoldenPath (incident_golden_path_test.go) run
// against real Postgres instead of in-memory adapters, extended with the
// steps the stabilization plan asked for and that nothing exercises yet:
// Assign, and the full open->in_progress->pending_review->resolved->closed->open
// walk. Every transition goes through ticketService.UpdateStatus — the exact
// path the application uses (UpdateStatus -> catalogintake.Adapter ->
// CatalogService.TransitionEntityToState) — never CatalogService directly.
func TestMetadataDrivenIncidentGoldenPath_Postgres(t *testing.T) {
	ctx := context.Background()
	harness := newPostgresGoldenPathHarness(t)

	published := publishIncidentDefinition(t, harness.catalogService, incidentLifecycleWithClosed())

	entity, err := harness.catalogService.CreateEntity(ctx, "INC", map[string]any{
		"title":       "Camera offline",
		"description": "The entrance camera is not responding.",
		"priority":    "critical",
	})
	if err != nil {
		t.Fatalf("CreateEntity() error = %v", err)
	}
	if entity.DefinitionVersionID == "" || entity.DefinitionVersionID != published.ID {
		t.Fatalf("entity not pinned to the published definition: %#v", entity)
	}

	if published, err := harness.dispatcher.DispatchOnce(ctx); err != nil || published != 1 {
		t.Fatalf("dispatch created event = %d, %v; want 1, nil", published, err)
	}

	ticket, err := harness.ticketService.Get(ctx, entity.HumanID)
	if err != nil || ticket.EntityID == nil || *ticket.EntityID != entity.ID {
		t.Fatalf("ticket projection = %#v, %v", ticket, err)
	}
	if _, err := harness.slaService.GetAssessment(ctx, entity.ID); err != nil {
		t.Fatalf("SLA assessment: %v", err)
	}

	assignee := "Jane Agent"
	if _, err := harness.ticketService.Assign(ctx, entity.HumanID, &assignee, actorName()); err != nil {
		t.Fatalf("Assign() error = %v", err)
	}

	type step struct {
		to ticketDomain.Status
	}
	walk := []step{
		{to: ticketDomain.StatusInProgress},
		{to: ticketDomain.StatusPendingReview},
		{to: ticketDomain.StatusResolved},
		{to: ticketDomain.StatusClosed},
		{to: ticketDomain.StatusOpen},
	}
	for _, s := range walk {
		if _, err := harness.ticketService.UpdateStatus(ctx, entity.HumanID, s.to, actorName()); err != nil {
			t.Fatalf("UpdateStatus(%s) error = %v", s.to, err)
		}
		if _, err := harness.dispatcher.DispatchOnce(ctx); err != nil {
			t.Fatalf("dispatch after UpdateStatus(%s): %v", s.to, err)
		}
	}

	// Re-fetch activity with a fresh call — not the return value of any of
	// the calls above — to confirm the sequence was actually persisted to
	// Postgres, not just held in an in-process value.
	activity, err := harness.ticketService.ListActivity(ctx, entity.HumanID)
	if err != nil {
		t.Fatalf("ListActivity() error = %v", err)
	}

	wantSequence := []struct {
		kind ticketDomain.ActivityKind
		from string
		to   string
	}{
		{kind: ticketDomain.ActivityAssigned},
		{kind: ticketDomain.ActivityStatusChanged, from: "open", to: "in_progress"},
		{kind: ticketDomain.ActivityStatusChanged, from: "in_progress", to: "pending_review"},
		{kind: ticketDomain.ActivityStatusChanged, from: "pending_review", to: "resolved"},
		{kind: ticketDomain.ActivityStatusChanged, from: "resolved", to: "closed"},
		{kind: ticketDomain.ActivityStatusChanged, from: "closed", to: "open"},
	}

	relevant := make([]ticketDomain.ActivityEntry, 0, len(wantSequence))
	for _, entry := range activity {
		if entry.Kind == ticketDomain.ActivityAssigned || entry.Kind == ticketDomain.ActivityStatusChanged {
			relevant = append(relevant, entry)
		}
	}
	if len(relevant) != len(wantSequence) {
		t.Fatalf("expected %d assign/status-change activity entries, got %d: %#v", len(wantSequence), len(relevant), relevant)
	}

	for i, want := range wantSequence {
		got := relevant[i]
		if got.Kind != want.kind {
			t.Fatalf("activity[%d].Kind = %q, want %q (%#v)", i, got.Kind, want.kind, got)
		}
		if got.ContractVersion != ticketDomain.ActivityContractVersion {
			t.Fatalf("activity[%d].ContractVersion = %d, want %d", i, got.ContractVersion, ticketDomain.ActivityContractVersion)
		}
		if got.ActorName == nil || *got.ActorName != *actorName() {
			t.Fatalf("activity[%d].ActorName = %v, want %q", i, got.ActorName, *actorName())
		}
		if got.TicketID != entity.HumanID {
			t.Fatalf("activity[%d].TicketID = %q, want %q", i, got.TicketID, entity.HumanID)
		}
		if want.kind == ticketDomain.ActivityStatusChanged {
			if got.Payload["from"] != want.from || got.Payload["to"] != want.to {
				t.Fatalf("activity[%d] payload = %#v, want from=%q to=%q", i, got.Payload, want.from, want.to)
			}
		}
	}

	finalTicket, err := harness.ticketService.Get(ctx, entity.HumanID)
	if err != nil {
		t.Fatalf("final Get() error = %v", err)
	}
	if finalTicket.Status != ticketDomain.StatusOpen {
		t.Fatalf("final ticket status = %q, want %q", finalTicket.Status, ticketDomain.StatusOpen)
	}
}

// TestIncidentClosedReopenRespectsHistoricalDefinition proves that closing an
// incident is governed by the DEFINITION VERSION the entity was created
// under, not whatever is currently published — the same "workflow follows
// history" guarantee PR 4 established for layouts. An incident created under
// a lifecycle without "closed" must be rejected when asked to close, even
// after a newer definition version adds "closed"; an incident created under
// the newer version must succeed. Both go through ticketService.UpdateStatus,
// the real application path — never CatalogService.TransitionEntityToState
// directly.
func TestIncidentClosedReopenRespectsHistoricalDefinition(t *testing.T) {
	ctx := context.Background()
	harness := newPostgresGoldenPathHarness(t)

	oldLifecycle := catalogDomain.LifecycleDefinition{
		States: []catalogDomain.StateDefinition{
			{Key: "open", Label: "Open", Initial: true},
			{Key: "in_progress", Label: "In progress"},
			{Key: "resolved", Label: "Resolved"},
		},
		Transitions: []catalogDomain.TransitionDefinition{
			{Key: "start", Label: "Start", From: "open", To: "in_progress"},
			{Key: "resolve", Label: "Resolve", From: "in_progress", To: "resolved"},
		},
	}
	publishIncidentDefinition(t, harness.catalogService, oldLifecycle)

	oldEntity, err := harness.catalogService.CreateEntity(ctx, "INC", map[string]any{
		"title":       "Old-definition incident",
		"description": "Created before closed existed.",
		"priority":    "high",
	})
	if err != nil {
		t.Fatalf("create old-definition entity: %v", err)
	}

	// Definition evolves: a new version adds "closed". The entity above stays
	// pinned to the old one.
	publishIncidentDefinition(t, harness.catalogService, incidentLifecycleWithClosed())

	newEntity, err := harness.catalogService.CreateEntity(ctx, "INC", map[string]any{
		"title":       "New-definition incident",
		"description": "Created after closed was added.",
		"priority":    "high",
	})
	if err != nil {
		t.Fatalf("create new-definition entity: %v", err)
	}
	if newEntity.DefinitionVersion == oldEntity.DefinitionVersion {
		t.Fatalf("expected the two entities to be pinned to different definition versions, both got %d", oldEntity.DefinitionVersion)
	}

	if _, err := harness.dispatcher.DispatchOnce(ctx); err != nil {
		t.Fatalf("dispatch old entity created: %v", err)
	}
	if _, err := harness.dispatcher.DispatchOnce(ctx); err != nil {
		t.Fatalf("dispatch new entity created: %v", err)
	}

	for _, entity := range []catalogDomain.EntityRecord{oldEntity, newEntity} {
		if _, err := harness.ticketService.UpdateStatus(ctx, entity.HumanID, ticketDomain.StatusInProgress, actorName()); err != nil {
			t.Fatalf("start %s: %v", entity.HumanID, err)
		}
		if _, err := harness.dispatcher.DispatchOnce(ctx); err != nil {
			t.Fatalf("dispatch start %s: %v", entity.HumanID, err)
		}
		if _, err := harness.ticketService.UpdateStatus(ctx, entity.HumanID, ticketDomain.StatusResolved, actorName()); err != nil {
			t.Fatalf("resolve %s: %v", entity.HumanID, err)
		}
		if _, err := harness.dispatcher.DispatchOnce(ctx); err != nil {
			t.Fatalf("dispatch resolve %s: %v", entity.HumanID, err)
		}
	}

	// The old-version entity: its historical lifecycle has no
	// resolved->closed transition, so this must fail.
	if _, err := harness.ticketService.UpdateStatus(ctx, oldEntity.HumanID, ticketDomain.StatusClosed, actorName()); !errors.Is(err, ticketDomain.ErrInvalidTransition) {
		t.Fatalf("closing the old-definition incident: got %v, want ErrInvalidTransition", err)
	}

	// The new-version entity: its historical lifecycle has "closed" and
	// reopen_from_closed, so both must succeed.
	if _, err := harness.ticketService.UpdateStatus(ctx, newEntity.HumanID, ticketDomain.StatusClosed, actorName()); err != nil {
		t.Fatalf("closing the new-definition incident: %v", err)
	}
	if _, err := harness.dispatcher.DispatchOnce(ctx); err != nil {
		t.Fatalf("dispatch close new entity: %v", err)
	}
	if _, err := harness.ticketService.UpdateStatus(ctx, newEntity.HumanID, ticketDomain.StatusOpen, actorName()); err != nil {
		t.Fatalf("reopening the new-definition incident: %v", err)
	}
}
