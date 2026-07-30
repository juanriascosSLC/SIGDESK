package application

import (
	"context"
	"errors"
	"testing"

	"sig-desk/backend/internal/catalog/adapters/memory"
	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type gatewayStub struct {
	commands []ports.CapabilityCommand
}

func (gateway *gatewayStub) ResolveResource(
	_ context.Context,
	reference domain.ResourceReference,
) (domain.ResourceReference, error) {
	reference.ResourceVersion = "7"
	reference.ContractVersion = "1"
	return reference, nil
}

func (gateway *gatewayStub) Dispatch(
	_ context.Context,
	command ports.CapabilityCommand,
) error {
	gateway.commands = append(gateway.commands, command)
	return nil
}

func TestDraftPublishAndCreateEntityFlow(t *testing.T) {
	repository := memory.NewRepository()
	service := NewService(repository)
	definition := domain.Definition{
		EntityKey: "rfc",
		Name:      "Cambio",
		Specification: domain.Specification{
			Identity: domain.IdentityDefinition{Prefix: "rfc"},
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Título", Type: "text", Required: true},
			},
			Lifecycle: domain.LifecycleDefinition{
				States: []domain.StateDefinition{
					{Key: "requested", Label: "Solicitado", Initial: true},
				},
			},
		},
	}

	draft, err := service.CreateDraft(context.Background(), definition)
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}
	if draft.EntityKey != "RFC" || draft.Specification.Identity.Prefix != "RFC" {
		t.Fatalf("draft keys were not normalized: %#v", draft)
	}
	published, err := service.Publish(context.Background(), "rfc", draft.Version)
	if err != nil {
		t.Fatalf("Publish() error = %v", err)
	}
	entity, err := service.CreateEntity(context.Background(), "rfc", map[string]any{
		"title": "Actualizar firewall",
	})
	if err != nil {
		t.Fatalf("CreateEntity() error = %v", err)
	}
	if entity.DefinitionID != published.ID || entity.State != "requested" {
		t.Fatalf("entity did not preserve the interpreted definition: %#v", entity)
	}
	if entity.DefinitionVersionID != published.ID ||
		entity.SchemaVersion != domain.CurrentMetamodelVersion ||
		entity.ManifestChecksum == "" {
		t.Fatalf("entity did not preserve executable definition identity: %#v", entity)
	}
	updated, err := service.UpdateEntity(
		context.Background(),
		"RFC",
		entity.ID,
		map[string]any{"title": "Actualizar firewall perimetral"},
		entity.UpdatedAt,
	)
	if err != nil {
		t.Fatalf("UpdateEntity() error = %v", err)
	}
	if updated.Data["title"] != "Actualizar firewall perimetral" ||
		!updated.UpdatedAt.After(entity.UpdatedAt) {
		t.Fatalf("entity data was not updated: %#v", updated)
	}
	if _, err := service.UpdateEntity(
		context.Background(),
		"RFC",
		entity.ID,
		map[string]any{"title": "Stale overwrite"},
		entity.UpdatedAt,
	); !errors.Is(err, ports.ErrVersionConflict) {
		t.Fatalf("stale UpdateEntity() error = %v, want ErrVersionConflict", err)
	}
}

func TestRepeatedDraftSaveReusesTheSingleActiveDraft(t *testing.T) {
	repository := memory.NewRepository()
	service := NewService(repository)
	definition := domain.Definition{
		EntityKey: "INC",
		Name:      "Incidente",
		Specification: domain.Specification{
			Description: "Primera edición",
			Identity:    domain.IdentityDefinition{Prefix: "INC"},
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Título", Type: "text", Required: true},
			},
			Lifecycle: domain.LifecycleDefinition{
				States: []domain.StateDefinition{
					{Key: "open", Label: "Abierto", Initial: true},
				},
			},
		},
	}
	first, err := service.CreateDraft(context.Background(), definition)
	if err != nil {
		t.Fatalf("first CreateDraft() error = %v", err)
	}
	definition.Specification.Description = "Cambios todavía sin publicar"
	second, err := service.CreateDraft(context.Background(), definition)
	if err != nil {
		t.Fatalf("second CreateDraft() error = %v", err)
	}
	if second.ID != first.ID || second.Version != first.Version {
		t.Fatalf("draft save created another version: first=%#v second=%#v", first, second)
	}
	if second.Specification.Description != "Cambios todavía sin publicar" {
		t.Fatalf("active draft was not updated: %#v", second.Specification)
	}
	definitions, err := service.ListDefinitions(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if len(definitions) != 1 {
		t.Fatalf("got %d definitions, want one active draft", len(definitions))
	}
	published, err := service.Publish(context.Background(), "INC", second.Version)
	if err != nil {
		t.Fatal(err)
	}
	next, err := service.CreateDraft(context.Background(), published)
	if err != nil {
		t.Fatal(err)
	}
	if next.ID == published.ID || next.Version != published.Version+1 {
		t.Fatalf("save after publish did not open the next draft: %#v", next)
	}
}

func TestPublicationPinsResourcesAndRuntimeDelegates(t *testing.T) {
	repository := memory.NewRepository()
	gateway := &gatewayStub{}
	service := NewService(repository, gateway)
	definition := domain.Definition{
		EntityKey: "prb",
		Name:      "Problema",
		Specification: domain.Specification{
			Identity: domain.IdentityDefinition{Prefix: "prb"},
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Título", Type: "text", Required: true},
			},
			Lifecycle: domain.LifecycleDefinition{
				States: []domain.StateDefinition{
					{Key: "open", Label: "Abierto", Initial: true},
					{Key: "resolved", Label: "Resuelto"},
				},
				Transitions: []domain.TransitionDefinition{
					{Key: "resolve", Label: "Resolver", From: "open", To: "resolved"},
				},
			},
			Bindings: []domain.ResourceBinding{{
				Module:       "iam",
				ResourceType: "policy",
				ResourceID:   "iam:policy:problem-default",
				Required:     true,
			}},
		},
	}
	draft, err := service.CreateDraft(context.Background(), definition)
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}
	validation, err := service.ValidatePublication(context.Background(), "prb", draft.Version)
	if err != nil {
		t.Fatalf("ValidatePublication() error = %v", err)
	}
	if !validation.Valid || validation.Manifest.Resources[0].ResourceVersion != "7" {
		t.Fatalf("publication did not resolve stable resource versions: %#v", validation)
	}
	published, err := service.Publish(context.Background(), "prb", draft.Version)
	if err != nil {
		t.Fatalf("Publish() error = %v", err)
	}
	entity, err := service.CreateEntity(context.Background(), "prb", map[string]any{"title": "Root cause"})
	if err != nil {
		t.Fatalf("CreateEntity() error = %v", err)
	}
	transitioned, err := service.TransitionEntity(
		context.Background(),
		"prb",
		entity.ID,
		"resolve",
	)
	if err != nil {
		t.Fatalf("TransitionEntity() error = %v", err)
	}
	if transitioned.State != "resolved" {
		t.Fatalf("transitioned state = %q, want resolved", transitioned.State)
	}
	updated, err := service.UpdateEntity(
		context.Background(),
		"prb",
		entity.ID,
		map[string]any{"title": "Updated root cause"},
		transitioned.UpdatedAt,
	)
	if err != nil {
		t.Fatalf("UpdateEntity() with gateway error = %v", err)
	}
	if updated.Data["title"] != "Updated root cause" {
		t.Fatalf("updated entity = %#v", updated)
	}
	if len(gateway.commands) != 3 ||
		gateway.commands[0].Definition.Checksum != published.Checksum ||
		gateway.commands[1].TransitionKey != "resolve" ||
		gateway.commands[2].Operation != "entity.update" {
		t.Fatalf("runtime did not delegate through module contracts: %#v", gateway.commands)
	}
}
