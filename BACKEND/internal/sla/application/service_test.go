package application

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	slaDomain "sig-desk/backend/internal/sla/domain"
)

func TestSLAProjectionIsIdempotentAndStopsOnResolution(t *testing.T) {
	service := NewService()
	createdAt := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	createdPayload, _ := json.Marshal(catalogDomain.EntityCreatedPayload{
		EntityID:            "entity-1",
		HumanID:             "INC-000001",
		EntityKey:           "INC",
		DefinitionVersionID: "definition-v7",
		DefinitionVersion:   7,
		ManifestChecksum:    "checksum-v7",
		State:               "open",
		Data:                map[string]any{"priority": "critical"},
	})
	created := catalogDomain.EventEnvelope{
		EventID:       "event-created",
		EventType:     catalogDomain.EventEntityCreatedV1,
		OccurredAt:    createdAt,
		AggregateID:   "entity-1",
		EntityKey:     "INC",
		SchemaVersion: "1",
		Payload:       createdPayload,
	}
	if err := service.HandleEvent(context.Background(), created); err != nil {
		t.Fatalf("HandleEvent(created) error = %v", err)
	}
	if err := service.HandleEvent(context.Background(), created); err != nil {
		t.Fatalf("HandleEvent(created duplicate) error = %v", err)
	}
	assessment, err := service.GetAssessment(context.Background(), "entity-1")
	if err != nil || !assessment.ResolutionDueAt.Equal(createdAt.Add(4*time.Hour)) {
		t.Fatalf("unexpected SLA assessment: %#v", assessment)
	}
	if assessment.DefinitionVersionID != "definition-v7" ||
		assessment.DefinitionVersion != 7 ||
		assessment.ManifestChecksum != "checksum-v7" ||
		assessment.PolicyContractVersion != "1" {
		t.Fatalf("assessment did not retain executable versions: %#v", assessment)
	}

	resolvedAt := createdAt.Add(45 * time.Minute)
	transitionedPayload, _ := json.Marshal(catalogDomain.EntityTransitionedPayload{
		EntityID:      "entity-1",
		HumanID:       "INC-000001",
		EntityKey:     "INC",
		TransitionKey: "resolve",
		PreviousState: "in_progress",
		CurrentState:  "resolved",
	})
	transitioned := catalogDomain.EventEnvelope{
		EventID:       "event-resolved",
		EventType:     catalogDomain.EventEntityTransitionedV1,
		OccurredAt:    resolvedAt,
		AggregateID:   "entity-1",
		EntityKey:     "INC",
		SchemaVersion: "1",
		Payload:       transitionedPayload,
	}
	if err := service.HandleEvent(context.Background(), transitioned); err != nil {
		t.Fatalf("HandleEvent(transitioned) error = %v", err)
	}
	assessment, _ = service.GetAssessment(context.Background(), "entity-1")
	if assessment.ResolvedAt == nil || assessment.ResolutionBreached {
		t.Fatalf("resolved SLA was not stopped as breached: %#v", assessment)
	}
}

func TestSLAPausesAndResumesUsingPolicyMetadata(t *testing.T) {
	service := NewService()
	createdAt := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	createdPayload, _ := json.Marshal(catalogDomain.EntityCreatedPayload{
		EntityID:  "entity-paused",
		HumanID:   "INC-000002",
		EntityKey: "INC",
		State:     "open",
		Data:      map[string]any{"priority": "medium"},
	})
	if err := service.HandleEvent(context.Background(), catalogDomain.EventEnvelope{
		EventID: "event-paused-created", EventType: catalogDomain.EventEntityCreatedV1,
		OccurredAt: createdAt, Payload: createdPayload,
	}); err != nil {
		t.Fatalf("HandleEvent(created) error = %v", err)
	}

	transition := func(eventID, current string, occurredAt time.Time) {
		t.Helper()
		payload, _ := json.Marshal(catalogDomain.EntityTransitionedPayload{
			EntityID: "entity-paused", HumanID: "INC-000002", EntityKey: "INC",
			CurrentState: current,
		})
		if err := service.HandleEvent(context.Background(), catalogDomain.EventEnvelope{
			EventID: eventID, EventType: catalogDomain.EventEntityTransitionedV1,
			OccurredAt: occurredAt, Payload: payload,
		}); err != nil {
			t.Fatalf("HandleEvent(%s) error = %v", current, err)
		}
	}

	transition("event-paused-hold", "on_hold", createdAt.Add(30*time.Minute))
	transition("event-paused-resume", "in_progress", createdAt.Add(90*time.Minute))
	assessment, err := service.GetAssessment(context.Background(), "entity-paused")
	if err != nil {
		t.Fatalf("GetAssessment() error = %v", err)
	}
	if assessment.PausedAt != nil ||
		!assessment.ResponseDueAt.Equal(createdAt.Add(3*time.Hour)) ||
		!assessment.ResolutionDueAt.Equal(createdAt.Add(17*time.Hour)) {
		t.Fatalf("SLA deadlines were not shifted by the pause: %#v", assessment)
	}
}

func TestSLARecalculatesDeadlinesWhenPriorityChanges(t *testing.T) {
	service := NewService()
	ctx := context.Background()
	createdAt := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	createdPayload, _ := json.Marshal(catalogDomain.EntityCreatedPayload{
		EntityID:  "entity-priority",
		HumanID:   "INC-000003",
		EntityKey: "INC",
		State:     "open",
		Data:      map[string]any{"priority": "low"},
	})
	if err := service.HandleEvent(ctx, catalogDomain.EventEnvelope{
		EventID:     "event-priority-created",
		EventType:   catalogDomain.EventEntityCreatedV1,
		OccurredAt:  createdAt,
		AggregateID: "entity-priority",
		EntityKey:   "INC",
		Payload:     createdPayload,
	}); err != nil {
		t.Fatalf("HandleEvent(created) error = %v", err)
	}

	updatedAt := createdAt.Add(10 * time.Minute)
	updatedPayload, _ := json.Marshal(catalogDomain.EntityUpdatedPayload{
		EntityID:      "entity-priority",
		HumanID:       "INC-000003",
		EntityKey:     "INC",
		Data:          map[string]any{"priority": "high"},
		ChangedFields: []string{"priority"},
	})
	if err := service.HandleEvent(ctx, catalogDomain.EventEnvelope{
		EventID:     "event-priority-updated",
		EventType:   catalogDomain.EventEntityUpdatedV1,
		OccurredAt:  updatedAt,
		AggregateID: "entity-priority",
		EntityKey:   "INC",
		Payload:     updatedPayload,
	}); err != nil {
		t.Fatalf("HandleEvent(updated) error = %v", err)
	}

	assessment, err := service.GetAssessment(ctx, "entity-priority")
	if err != nil {
		t.Fatalf("GetAssessment() error = %v", err)
	}
	if assessment.Priority != "high" ||
		assessment.ResponseTargetMinutes != 30 ||
		assessment.ResolutionTargetMinutes != 480 ||
		!assessment.ResponseDueAt.Equal(createdAt.Add(30*time.Minute)) ||
		!assessment.ResolutionDueAt.Equal(createdAt.Add(8*time.Hour)) ||
		assessment.LastEventID != "event-priority-updated" {
		t.Fatalf("SLA assessment was not recalculated: %#v", assessment)
	}
}

func TestSLADoesNotClaimRFCEntitiesWithoutAnSLABinding(t *testing.T) {
	service := NewService()
	payload, _ := json.Marshal(catalogDomain.EntityCreatedPayload{
		EntityID:  "change-1",
		HumanID:   "RFC-000001",
		EntityKey: "RFC",
		State:     "draft",
		Data:      map[string]any{"riskLevel": "high"},
	})
	if err := service.HandleEvent(context.Background(), catalogDomain.EventEnvelope{
		EventID:    "event-rfc-created",
		EventType:  catalogDomain.EventEntityCreatedV1,
		OccurredAt: time.Now().UTC(),
		Payload:    payload,
	}); err != nil {
		t.Fatalf("HandleEvent(RFC created) error = %v", err)
	}
	if _, err := service.GetAssessment(context.Background(), "change-1"); !errors.Is(err, slaDomain.ErrPolicyNotFound) {
		t.Fatalf("RFC unexpectedly received an SLA assessment: %v", err)
	}
}

func TestPolicyDraftCanBeEditedPublishedAndResolvedDynamically(t *testing.T) {
	service := NewService()
	ctx := context.Background()
	draft, err := service.CreateDraft(ctx, slaDomain.Policy{
		ResourceID:      "sla:policy:business-hours",
		Name:            "Horario laboral",
		ContractVersion: "1",
		Calendar: slaDomain.Calendar{
			Timezone: "America/Bogota",
			Windows: []slaDomain.BusinessWindow{
				{Weekday: 1, Start: "08:00", End: "18:00"},
			},
		},
		Targets: []slaDomain.Target{
			{Priority: "high", ResponseMinutes: 30, ResolutionMinutes: 240},
		},
	})
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}
	draft.Name = "Horario laboral actualizado"
	updated, err := service.UpdateDraft(ctx, draft)
	if err != nil || updated.Name != draft.Name {
		t.Fatalf("UpdateDraft() = %#v, %v", updated, err)
	}
	published, err := service.Publish(ctx, draft.ResourceID, draft.Version)
	if err != nil {
		t.Fatalf("Publish() error = %v", err)
	}
	resolved, err := service.ResolveResource(ctx, catalogDomain.ResourceReference{
		Module:       "sla",
		ResourceType: "policy",
		ResourceID:   draft.ResourceID,
	})
	if err != nil || resolved.ResourceVersion != "1" ||
		published.Status != slaDomain.StatusPublished {
		t.Fatalf("ResolveResource() = %#v, %v", resolved, err)
	}
}
