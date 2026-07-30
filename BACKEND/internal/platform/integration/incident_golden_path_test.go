package integration_test

import (
	"context"
	"errors"
	"testing"

	catalogMemory "sig-desk/backend/internal/catalog/adapters/memory"
	catalogModules "sig-desk/backend/internal/catalog/adapters/modules"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	platformEvents "sig-desk/backend/internal/platform/events"
	slaMemory "sig-desk/backend/internal/sla/adapters/memory"
	slaApplication "sig-desk/backend/internal/sla/application"
	ticketEvents "sig-desk/backend/internal/tickets/adapters/catalogevents"
	"sig-desk/backend/internal/tickets/adapters/catalogintake"
	ticketMemory "sig-desk/backend/internal/tickets/adapters/memory"
	ticketApplication "sig-desk/backend/internal/tickets/application"
	ticketDomain "sig-desk/backend/internal/tickets/domain"
)

func TestMetadataDrivenIncidentGoldenPath(t *testing.T) {
	ctx := context.Background()
	moduleRegistry := catalogModules.NewDevelopmentRegistry()
	catalogRepository := catalogMemory.NewRepository()
	catalogService := catalogApplication.NewService(catalogRepository, moduleRegistry)

	deviceIsCamera := catalogDomain.ConditionExpression{
		Field:    "deviceType",
		Operator: "equals",
		Value:    "camera",
	}
	draft, err := catalogService.CreateDraft(ctx, catalogDomain.Definition{
		EntityKey:        "INC",
		Name:             "Incident",
		MetamodelVersion: catalogDomain.CurrentMetamodelVersion,
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
				{
					Key: "deviceType", Label: "Device type", Type: "select", Required: true,
					Options: []catalogDomain.FieldOption{
						{Value: "camera", Label: "Camera"},
						{Value: "nvr", Label: "NVR"},
					},
				},
				{
					Key:          "cameraModel",
					Label:        "Camera model",
					Type:         "text",
					VisibleWhen:  &deviceIsCamera,
					RequiredWhen: &deviceIsCamera,
				},
			},
			Lifecycle: catalogDomain.LifecycleDefinition{
				States: []catalogDomain.StateDefinition{
					{Key: "open", Label: "Open", Initial: true},
					{Key: "in_progress", Label: "In progress"},
					{Key: "resolved", Label: "Resolved"},
				},
				Transitions: []catalogDomain.TransitionDefinition{
					{Key: "start", Label: "Start", From: "open", To: "in_progress"},
					{Key: "resolve", Label: "Resolve", From: "in_progress", To: "resolved"},
				},
			},
			Bindings: []catalogDomain.ResourceBinding{
				{
					Module:       "sla",
					ResourceType: "policy",
					ResourceID:   "sla:policy:incident-standard",
				},
			},
			Views: map[string][]string{
				"create": {"title", "description", "priority", "deviceType", "cameraModel"},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}
	if _, err := catalogService.Publish(ctx, "INC", draft.Version); err != nil {
		t.Fatalf("Publish() error = %v", err)
	}

	if _, err := catalogService.CreateEntity(ctx, "INC", map[string]any{
		"title":       "Camera offline",
		"description": "The entrance camera is not responding.",
		"priority":    "critical",
		"deviceType":  "camera",
	}); !errors.Is(err, catalogDomain.ErrInvalidEntityData) {
		t.Fatalf("camera without conditional model error = %v, want ErrInvalidEntityData", err)
	}

	slaService := slaApplication.NewService(
		slaMemory.NewRepository(slaApplication.DefaultPolicy()),
	)
	ticketRepository := ticketMemory.NewRepository(nil)
	ticketService := ticketApplication.NewService(
		ticketRepository,
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

	primary, err := catalogService.CreateEntity(ctx, "INC", map[string]any{
		"title":       "Camera offline",
		"description": "The entrance camera is not responding.",
		"priority":    "critical",
		"deviceType":  "camera",
		"cameraModel": "DS-2CD2043",
	})
	if err != nil {
		t.Fatalf("create primary INC: %v", err)
	}
	secondary, err := catalogService.CreateEntity(ctx, "INC", map[string]any{
		"title":       "NVR intermittently offline",
		"description": "The recorder loses connectivity intermittently.",
		"priority":    "high",
		"deviceType":  "nvr",
	})
	if err != nil {
		t.Fatalf("create secondary INC: %v", err)
	}
	if primary.DefinitionVersionID == "" || primary.ManifestChecksum == "" {
		t.Fatalf("primary INC is not pinned to an executable definition: %#v", primary)
	}
	if published, err := dispatcher.DispatchOnce(ctx); err != nil || published != 2 {
		t.Fatalf("dispatch created events = %d, %v; want 2, nil", published, err)
	}

	projected, err := ticketService.Get(ctx, primary.HumanID)
	if err != nil || projected.EntityID == nil || *projected.EntityID != primary.ID {
		t.Fatalf("primary ticket projection = %#v, %v", projected, err)
	}
	assessment, err := slaService.GetAssessment(ctx, primary.ID)
	if err != nil {
		t.Fatalf("primary SLA assessment: %v", err)
	}
	if assessment.DefinitionVersionID != primary.DefinitionVersionID ||
		assessment.ManifestChecksum != primary.ManifestChecksum {
		t.Fatalf("SLA did not preserve the incident definition identity: %#v", assessment)
	}

	if _, err := ticketService.UpdateStatus(
		ctx,
		primary.HumanID,
		ticketDomain.StatusInProgress,
		nil,
	); err != nil {
		t.Fatalf("start incident through Tickets adapter: %v", err)
	}
	if published, err := dispatcher.DispatchOnce(ctx); err != nil || published != 1 {
		t.Fatalf("dispatch started event = %d, %v; want 1, nil", published, err)
	}
	assessment, err = slaService.GetAssessment(ctx, primary.ID)
	if err != nil || assessment.CurrentState != string(ticketDomain.StatusInProgress) ||
		assessment.RespondedAt == nil {
		t.Fatalf("SLA did not react to start transition: %#v, %v", assessment, err)
	}

	if _, err := ticketService.Merge(
		ctx,
		primary.HumanID,
		[]string{secondary.HumanID},
		nil,
	); err != nil {
		t.Fatalf("merge related incident: %v", err)
	}
	if _, err := ticketService.Unmerge(
		ctx,
		primary.HumanID,
		secondary.HumanID,
		nil,
	); err != nil {
		t.Fatalf("unmerge related incident: %v", err)
	}
	activity, err := ticketService.ListActivity(ctx, primary.HumanID)
	if err != nil {
		t.Fatalf("list incident activity: %v", err)
	}
	assertActivityContract(t, activity, ticketDomain.ActivityMerged)
	assertActivityContract(t, activity, ticketDomain.ActivityUnmerged)

	if _, err := ticketService.UpdateStatus(
		ctx,
		primary.HumanID,
		ticketDomain.StatusResolved,
		nil,
	); err != nil {
		t.Fatalf("resolve incident through Tickets adapter: %v", err)
	}
	if published, err := dispatcher.DispatchOnce(ctx); err != nil || published != 1 {
		t.Fatalf("dispatch resolved event = %d, %v; want 1, nil", published, err)
	}
	assessment, err = slaService.GetAssessment(ctx, primary.ID)
	if err != nil || assessment.CurrentState != string(ticketDomain.StatusResolved) ||
		assessment.ResolvedAt == nil {
		t.Fatalf("SLA did not stop on resolution: %#v, %v", assessment, err)
	}
}

func assertActivityContract(
	t *testing.T,
	activity []ticketDomain.ActivityEntry,
	kind ticketDomain.ActivityKind,
) {
	t.Helper()
	for _, entry := range activity {
		if entry.Kind != kind {
			continue
		}
		if entry.ContractVersion != ticketDomain.ActivityContractVersion {
			t.Fatalf(
				"%s activity contractVersion = %d, want %d",
				kind,
				entry.ContractVersion,
				ticketDomain.ActivityContractVersion,
			)
		}
		return
	}
	t.Fatalf("%s activity was not recorded: %#v", kind, activity)
}
