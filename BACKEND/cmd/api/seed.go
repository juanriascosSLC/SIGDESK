package main

import (
	"context"
	"errors"
	"log/slog"

	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

// seedIncidentDefinitionV2 publishes INC v2 (adding category, assetId and
// site to the intake form) through the catalog's real
// CreateDraft -> Publish workflow, so it gets a compiled manifest and
// checksum like any other definition. INC v1 is never touched: it stays
// exactly as 000003_create_catalog_metamodel.up.sql inserted it.
//
// This only calls catalogApplication.Service's public API — it does not
// reach into the catalog module's internals.
func seedIncidentDefinitionV2(ctx context.Context, logger *slog.Logger, catalogService *catalogApplication.Service) {
	const targetVersion = 2

	if _, err := catalogService.GetDefinition(ctx, "INC", targetVersion); err == nil {
		return // already seeded
	} else if !errors.Is(err, catalogPorts.ErrNotFound) {
		logger.Error("could not check for existing INC v2 definition", "error", err)
		return
	}

	minTitle, maxTitle := 3, 160
	minDescription, maxDescription := 10, 10000
	maxAssetID := 120
	maxSite := 160

	draft := catalogDomain.Definition{
		EntityKey: "INC",
		Name:      "Incidente",
		Specification: catalogDomain.Specification{
			Description: "Registra y gestiona una interrupción o degradación de un servicio.",
			Identity:    catalogDomain.IdentityDefinition{Prefix: "INC"},
			Fields: []catalogDomain.FieldDefinition{
				{
					Key: "title", Label: "Título", Type: "text", Required: true,
					MinLength: &minTitle, MaxLength: &maxTitle,
					Placeholder: "Describe brevemente el incidente",
				},
				{
					Key: "description", Label: "Descripción", Type: "textarea", Required: true,
					MinLength: &minDescription, MaxLength: &maxDescription,
					Placeholder: "Incluye el impacto y los síntomas observados",
				},
				{
					Key: "category", Label: "Categoría", Type: "select", Required: true,
					DefaultValue: "hardware",
					Options: []catalogDomain.FieldOption{
						{Value: "hardware", Label: "Hardware"},
						{Value: "software", Label: "Software"},
						{Value: "network", Label: "Red"},
						{Value: "general", Label: "General"},
					},
				},
				{
					Key: "priority", Label: "Prioridad", Type: "select", Required: true,
					DefaultValue: "medium",
					Options: []catalogDomain.FieldOption{
						{Value: "low", Label: "Baja"},
						{Value: "medium", Label: "Media"},
						{Value: "high", Label: "Alta"},
						{Value: "critical", Label: "Crítica"},
					},
				},
				{
					Key: "assetId", Label: "Activo relacionado", Type: "text", Required: false,
					MaxLength: &maxAssetID, Placeholder: "Ej. CAM-12345",
				},
				{
					Key: "site", Label: "Site", Type: "text", Required: false,
					MaxLength: &maxSite, Placeholder: "Ej. Site #401",
				},
			},
			Lifecycle: catalogDomain.LifecycleDefinition{
				States: []catalogDomain.StateDefinition{
					{Key: "open", Label: "Abierto", Initial: true},
					{Key: "in_progress", Label: "En progreso"},
					{Key: "pending_review", Label: "En revisión"},
					{Key: "resolved", Label: "Resuelto"},
				},
				Transitions: []catalogDomain.TransitionDefinition{
					{Key: "start", Label: "Iniciar atención", From: "open", To: "in_progress"},
					{Key: "request_review", Label: "Solicitar revisión", From: "in_progress", To: "pending_review"},
					{Key: "resolve", Label: "Resolver", From: "in_progress", To: "resolved"},
					{Key: "reopen", Label: "Reabrir", From: "resolved", To: "open"},
				},
			},
			Bindings: []catalogDomain.ResourceBinding{
				{Module: "iam", ResourceType: "policy", ResourceID: "iam:policy:incident-default", Required: true},
				{Module: "sla", ResourceType: "policy", ResourceID: "sla:policy:incident-standard"},
				{
					Module: "automations", ResourceType: "workflow",
					ResourceID: "automations:workflow:incident-critical",
				},
				{
					Module: "notifications", ResourceType: "template",
					ResourceID: "notifications:template:incident-created",
				},
				{
					Module: "reports", ResourceType: "metric",
					ResourceID: "reports:metric:incident-lifecycle",
				},
			},
			Views: map[string][]string{
				"create":  {"title", "description", "category", "priority", "assetId", "site"},
				"summary": {"title", "priority"},
			},
		},
	}

	created, err := catalogService.CreateDraft(ctx, draft)
	if err != nil {
		logger.Error("could not create INC v2 draft", "error", err)
		return
	}
	if _, err := catalogService.Publish(ctx, created.EntityKey, created.Version); err != nil {
		logger.Error("could not publish INC v2", "error", err)
		return
	}
	logger.Info("published INC v2 with category/site/assetId fields")
}

// seedIncidentDefinitionV3 publishes INC v3 (adds the "closed" state and the
// resolved->closed / closed->open transitions) through the same
// CreateDraft -> Publish workflow as v2. INC v1 and v2 are never touched:
// tickets already bound to them keep following their own historical
// lifecycle forever (see TransitionEntityToState, which always resolves
// against entity.DefinitionVersion, never the currently published version) —
// this is the same "workflow follows history" principle PR 4 established for
// layouts, applied here to the lifecycle itself.
func seedIncidentDefinitionV3(ctx context.Context, logger *slog.Logger, catalogService *catalogApplication.Service) {
	const targetVersion = 3

	if existing, err := catalogService.GetDefinition(ctx, "INC", targetVersion); err == nil {
		if !incidentLifecycleHasClosedState(existing.Specification.Lifecycle) {
			logger.Error(
				"INC v3 already exists but its lifecycle is missing the required closed state/transitions " +
					"(closed, resolved->closed, closed->open) — an incompatible INC v3 was published previously; " +
					"refusing to proceed automatically, this needs manual review",
			)
		}
		return // already seeded (and, if compatible, nothing more to do)
	} else if !errors.Is(err, catalogPorts.ErrNotFound) {
		logger.Error("could not check for existing INC v3 definition", "error", err)
		return
	}

	minTitle, maxTitle := 3, 160
	minDescription, maxDescription := 10, 10000
	maxAssetID := 120
	maxSite := 160

	draft := catalogDomain.Definition{
		EntityKey: "INC",
		Name:      "Incidente",
		Specification: catalogDomain.Specification{
			Description: "Registra y gestiona una interrupción o degradación de un servicio.",
			Identity:    catalogDomain.IdentityDefinition{Prefix: "INC"},
			Fields: []catalogDomain.FieldDefinition{
				{
					Key: "title", Label: "Título", Type: "text", Required: true,
					MinLength: &minTitle, MaxLength: &maxTitle,
					Placeholder: "Describe brevemente el incidente",
				},
				{
					Key: "description", Label: "Descripción", Type: "textarea", Required: true,
					MinLength: &minDescription, MaxLength: &maxDescription,
					Placeholder: "Incluye el impacto y los síntomas observados",
				},
				{
					Key: "category", Label: "Categoría", Type: "select", Required: true,
					DefaultValue: "hardware",
					Options: []catalogDomain.FieldOption{
						{Value: "hardware", Label: "Hardware"},
						{Value: "software", Label: "Software"},
						{Value: "network", Label: "Red"},
						{Value: "general", Label: "General"},
					},
				},
				{
					Key: "priority", Label: "Prioridad", Type: "select", Required: true,
					DefaultValue: "medium",
					Options: []catalogDomain.FieldOption{
						{Value: "low", Label: "Baja"},
						{Value: "medium", Label: "Media"},
						{Value: "high", Label: "Alta"},
						{Value: "critical", Label: "Crítica"},
					},
				},
				{
					Key: "assetId", Label: "Activo relacionado", Type: "text", Required: false,
					MaxLength: &maxAssetID, Placeholder: "Ej. CAM-12345",
				},
				{
					Key: "site", Label: "Site", Type: "text", Required: false,
					MaxLength: &maxSite, Placeholder: "Ej. Site #401",
				},
			},
			Lifecycle: catalogDomain.LifecycleDefinition{
				States: []catalogDomain.StateDefinition{
					{Key: "open", Label: "Abierto", Initial: true},
					{Key: "in_progress", Label: "En progreso"},
					{Key: "pending_review", Label: "En revisión"},
					{Key: "resolved", Label: "Resuelto"},
					{Key: "closed", Label: "Cerrado"},
				},
				Transitions: []catalogDomain.TransitionDefinition{
					{Key: "start", Label: "Iniciar atención", From: "open", To: "in_progress"},
					{Key: "request_review", Label: "Solicitar revisión", From: "in_progress", To: "pending_review"},
					{Key: "resolve", Label: "Resolver", From: "in_progress", To: "resolved"},
					{Key: "resolve_from_review", Label: "Resolver", From: "pending_review", To: "resolved"},
					{Key: "reopen", Label: "Reabrir", From: "resolved", To: "open"},
					{Key: "close", Label: "Cerrar", From: "resolved", To: "closed"},
					{Key: "reopen_from_closed", Label: "Reabrir", From: "closed", To: "open"},
				},
			},
			Bindings: []catalogDomain.ResourceBinding{
				{Module: "iam", ResourceType: "policy", ResourceID: "iam:policy:incident-default", Required: true},
				{Module: "sla", ResourceType: "policy", ResourceID: "sla:policy:incident-standard"},
				{
					Module: "automations", ResourceType: "workflow",
					ResourceID: "automations:workflow:incident-critical",
				},
				{
					Module: "notifications", ResourceType: "template",
					ResourceID: "notifications:template:incident-created",
				},
				{
					Module: "reports", ResourceType: "metric",
					ResourceID: "reports:metric:incident-lifecycle",
				},
			},
			Views: map[string][]string{
				"create":  {"title", "description", "category", "priority", "assetId", "site"},
				"summary": {"title", "priority"},
			},
		},
	}

	if !incidentLifecycleHasClosedState(draft.Specification.Lifecycle) {
		// Guards against this function's own definition regressing silently.
		logger.Error("seedIncidentDefinitionV3's own draft is missing the required closed state/transitions")
		return
	}

	created, err := catalogService.CreateDraft(ctx, draft)
	if err != nil {
		logger.Error("could not create INC v3 draft", "error", err)
		return
	}
	if _, err := catalogService.Publish(ctx, created.EntityKey, created.Version); err != nil {
		logger.Error("could not publish INC v3", "error", err)
		return
	}
	logger.Info("published INC v3 with closed state and reopen-from-closed transition")
}

// incidentLifecycleHasClosedState reports whether a lifecycle already
// contains everything seedIncidentDefinitionV3 is meant to guarantee: the
// "closed" state, a resolved->closed transition, and a closed->open
// transition. Used both to validate a pre-existing INC v3 (guarding against
// an incompatible definition published by some other process) and to
// self-check this function's own draft before publishing it.
func incidentLifecycleHasClosedState(lifecycle catalogDomain.LifecycleDefinition) bool {
	hasClosedState := false
	for _, state := range lifecycle.States {
		if state.Key == "closed" {
			hasClosedState = true
			break
		}
	}
	if !hasClosedState {
		return false
	}
	hasResolvedToClosed := false
	hasClosedToOpen := false
	for _, transition := range lifecycle.Transitions {
		if transition.From == "resolved" && transition.To == "closed" {
			hasResolvedToClosed = true
		}
		if transition.From == "closed" && transition.To == "open" {
			hasClosedToOpen = true
		}
	}
	return hasResolvedToClosed && hasClosedToOpen
}
