package application

import (
	"context"
	"errors"
	"testing"

	"sig-desk/backend/internal/catalog/adapters/memory"
	"sig-desk/backend/internal/catalog/domain"
)

func TestEntityRelationUsesPublishedSourceContractAndIsIdempotent(t *testing.T) {
	ctx := context.Background()
	service := NewService(memory.NewRepository())

	publishTestDefinition(t, ctx, service, domain.Definition{
		EntityKey:        "INC",
		Name:             "Incident",
		MetamodelVersion: domain.CurrentMetamodelVersion,
		Specification: domain.Specification{
			Identity: domain.IdentityDefinition{Prefix: "INC"},
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Title", Type: "text", Required: true},
			},
			Lifecycle: testLifecycle(),
		},
	})
	publishTestDefinition(t, ctx, service, domain.Definition{
		EntityKey:        "PRB",
		Name:             "Problem",
		MetamodelVersion: domain.CurrentMetamodelVersion,
		Specification: domain.Specification{
			Identity: domain.IdentityDefinition{Prefix: "PRB"},
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Title", Type: "text", Required: true},
			},
			Lifecycle: testLifecycle(),
			Relations: []domain.RelationDefinition{
				{
					Key: "investigates", Label: "Investigates",
					TargetEntityKey: "INC", InverseKey: "investigatedBy",
					InverseLabel: "Investigated by", Cardinality: "many",
				},
			},
		},
	})
	incident, err := service.CreateEntity(ctx, "INC", map[string]any{"title": "Camera down"})
	if err != nil {
		t.Fatal(err)
	}
	problem, err := service.CreateEntity(ctx, "PRB", map[string]any{"title": "Recurring outage"})
	if err != nil {
		t.Fatal(err)
	}

	created, replayed, err := service.CreateEntityRelation(
		ctx,
		"PRB",
		problem.ID,
		"investigates",
		"INC",
		incident.HumanID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if replayed {
		t.Fatal("first relation creation was reported as replayed")
	}
	if created.SourceDefinitionVersionID != problem.DefinitionVersionID ||
		created.TargetDefinitionVersionID != incident.DefinitionVersionID {
		t.Fatalf("relation did not pin both definition versions: %#v", created)
	}

	again, replayed, err := service.CreateEntityRelation(
		ctx,
		"PRB",
		problem.HumanID,
		"investigates",
		"INC",
		incident.ID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !replayed || again.ID != created.ID {
		t.Fatalf("duplicate relation was not idempotent: %#v %#v", created, again)
	}

	inbound, err := service.ListEntityRelations(ctx, "INC", incident.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(inbound) != 1 || inbound[0].InverseKey != "investigatedBy" {
		t.Fatalf("target did not expose inverse relation: %#v", inbound)
	}

	_, _, err = service.CreateEntityRelation(
		ctx,
		"PRB",
		problem.ID,
		"undeclared",
		"INC",
		incident.ID,
	)
	if !errors.Is(err, domain.ErrInvalidRelation) {
		t.Fatalf("undeclared relation should fail with ErrInvalidRelation, got %v", err)
	}
}

func publishTestDefinition(
	t *testing.T,
	ctx context.Context,
	service *Service,
	definition domain.Definition,
) {
	t.Helper()
	created, err := service.CreateDraft(ctx, definition)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Publish(ctx, created.EntityKey, created.Version); err != nil {
		t.Fatal(err)
	}
}

func testLifecycle() domain.LifecycleDefinition {
	return domain.LifecycleDefinition{
		States: []domain.StateDefinition{
			{Key: "open", Label: "Open", Initial: true},
		},
		Transitions: []domain.TransitionDefinition{},
	}
}
