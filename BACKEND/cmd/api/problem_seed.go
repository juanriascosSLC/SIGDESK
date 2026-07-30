package main

import (
	"context"
	"errors"
	"log/slog"

	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

// seedProblemDefinition publishes the first executable PRB contract. Problem
// Management owns the investigation workflow; Catalog only versions its
// shape and the allowed cross-domain relation contracts.
func seedProblemDefinition(
	ctx context.Context,
	logger *slog.Logger,
	catalogService *catalogApplication.Service,
) {
	const targetVersion = 1
	if existing, err := catalogService.GetDefinition(ctx, "PRB", targetVersion); err == nil {
		if existing.Status == catalogDomain.StatusPublished {
			return
		}
		if _, publishErr := catalogService.Publish(ctx, "PRB", targetVersion); publishErr != nil {
			logger.Error("could not resume publication of PRB definition", "error", publishErr)
		}
		return
	} else if !errors.Is(err, catalogPorts.ErrNotFound) {
		logger.Error("could not check for existing PRB definition", "error", err)
		return
	}

	minTitle, maxTitle := 5, 180
	minDescription, maxDescription := 20, 12000
	maxShort := 240
	fields := []catalogDomain.FieldDefinition{
		{
			Key: "title", Label: "Título del problema", Type: "text", Required: true,
			MinLength: &minTitle, MaxLength: &maxTitle,
			Placeholder: "Describe el patrón recurrente que se investigará",
		},
		{
			Key: "description", Label: "Síntomas y alcance", Type: "textarea", Required: true,
			MinLength: &minDescription, MaxLength: &maxDescription,
			Placeholder: "Explica recurrencia, impacto y evidencia disponible",
		},
		{
			Key: "impact", Label: "Impacto", Type: "select", Required: true,
			DefaultValue: "medium",
			Options: []catalogDomain.FieldOption{
				{Value: "low", Label: "Bajo"},
				{Value: "medium", Label: "Medio"},
				{Value: "high", Label: "Alto"},
				{Value: "critical", Label: "Crítico"},
			},
		},
		{
			Key: "serviceAffected", Label: "Servicio afectado", Type: "text",
			Required: true, MaxLength: &maxShort,
		},
		{
			Key: "owner", Label: "Responsable de investigación", Type: "text",
			MaxLength: &maxShort,
		},
		{
			Key: "rootCause", Label: "Causa raíz", Type: "textarea",
			MaxLength: &maxDescription,
		},
		{
			Key: "workaround", Label: "Solución temporal", Type: "textarea",
			MaxLength: &maxDescription,
		},
		{
			Key: "knownErrorNotes", Label: "Notas de error conocido", Type: "textarea",
			MaxLength: &maxDescription,
		},
		{
			Key: "resolution", Label: "Resolución definitiva", Type: "textarea",
			MaxLength: &maxDescription,
		},
	}
	lifecycle := catalogDomain.LifecycleDefinition{
		States: []catalogDomain.StateDefinition{
			{Key: "under_investigation", Label: "En investigación", Initial: true},
			{Key: "known_error", Label: "Error conocido"},
			{Key: "resolved", Label: "Resuelto"},
		},
		Transitions: []catalogDomain.TransitionDefinition{
			{
				Key: "identify_known_error", Label: "Declarar error conocido",
				From: "under_investigation", To: "known_error",
			},
			{
				Key: "resolve_from_investigation", Label: "Resolver",
				From: "under_investigation", To: "resolved",
			},
			{Key: "resolve", Label: "Resolver", From: "known_error", To: "resolved"},
			{Key: "reopen", Label: "Reabrir investigación", From: "resolved", To: "under_investigation"},
		},
	}
	layoutFields := make([]catalogDomain.DetailFieldPlacement, 0, len(fields))
	for _, field := range fields {
		width := "half"
		if field.Type == "textarea" {
			width = "full"
		}
		layoutFields = append(layoutFields, catalogDomain.DetailFieldPlacement{
			Source: "catalog", FieldKey: field.Key, Width: width,
		})
	}
	showFalse := false
	definition := catalogDomain.Definition{
		EntityKey:        "PRB",
		Name:             "Problema",
		MetamodelVersion: catalogDomain.CurrentMetamodelVersion,
		Specification: catalogDomain.Specification{
			Description: "Investiga y elimina la causa raíz detrás de incidentes recurrentes.",
			Identity:    catalogDomain.IdentityDefinition{Prefix: "PRB"},
			Fields:      fields,
			Lifecycle:   lifecycle,
			Relations: []catalogDomain.RelationDefinition{
				{
					Key: "investigates", Label: "Incidentes investigados",
					TargetEntityKey: "INC", InverseKey: "investigatedBy",
					InverseLabel: "Investigado por problema", Cardinality: "many",
				},
				{
					Key: "resolvedBy", Label: "Cambios que resuelven el problema",
					TargetEntityKey: "RFC", InverseKey: "resolves",
					InverseLabel: "Resuelve el problema", Cardinality: "many",
				},
			},
			Views: map[string][]string{
				"create": {
					"title", "description", "impact", "serviceAffected", "owner",
				},
				"edit": {
					"title", "description", "impact", "serviceAffected", "owner",
					"rootCause", "workaround", "knownErrorNotes", "resolution",
				},
				"summary": {"title", "impact", "serviceAffected", "owner"},
			},
			DetailLayout: &catalogDomain.DetailLayoutDefinition{
				Fields: layoutFields, ShowSLA: &showFalse,
				ShowAttachments: &showFalse, ShowActivity: &showFalse,
			},
			Events: []catalogDomain.EventDefinition{
				{Key: "problem_created", Trigger: "entity.created"},
				{Key: "problem_updated", Trigger: "entity.updated"},
				{Key: "problem_transitioned", Trigger: "entity.transitioned"},
			},
		},
	}
	created, err := catalogService.CreateDraft(ctx, definition)
	if err != nil {
		logger.Error("could not create PRB definition", "error", err)
		return
	}
	if _, err := catalogService.Publish(ctx, created.EntityKey, created.Version); err != nil {
		logger.Error("could not publish PRB definition", "error", err)
		return
	}
	logger.Info("published PRB v1 definition for Problem Management")
}
