package main

import (
	"context"
	"errors"
	"log/slog"

	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

// seedChangeDefinition publishes the initial RFC contract through Catalog
// Builder's real draft/publish workflow. It is only bootstrap configuration:
// subsequent RFC versions remain fully editable and publishable in Catalog.
func seedChangeDefinition(
	ctx context.Context,
	logger *slog.Logger,
	catalogService *catalogApplication.Service,
) {
	const targetVersion = 1
	if existing, err := catalogService.GetDefinition(ctx, "RFC", targetVersion); err == nil {
		if existing.Status == catalogDomain.StatusPublished {
			return
		}
		if _, publishErr := catalogService.Publish(ctx, "RFC", targetVersion); publishErr != nil {
			logger.Error("could not resume publication of RFC definition", "error", publishErr)
		}
		return
	} else if !errors.Is(err, catalogPorts.ErrNotFound) {
		logger.Error("could not check for existing RFC definition", "error", err)
		return
	}

	minTitle, maxTitle := 5, 180
	minDescription, maxDescription := 20, 10000
	maxShort, maxPlan := 240, 12000
	showFalse := false
	emergencyOnly := &catalogDomain.ConditionExpression{
		Field: "changeType", Operator: "equals", Value: "emergency",
	}
	standardOnly := &catalogDomain.ConditionExpression{
		Field: "changeType", Operator: "equals", Value: "standard",
	}
	fields := []catalogDomain.FieldDefinition{
		{
			Key: "title", Label: "Título del cambio", Type: "text", Required: true,
			MinLength: &minTitle, MaxLength: &maxTitle,
			Placeholder: "Describe el cambio propuesto",
		},
		{
			Key: "description", Label: "Descripción", Type: "textarea", Required: true,
			MinLength: &minDescription, MaxLength: &maxDescription,
			Placeholder: "Explica qué se modificará y su alcance",
		},
		{
			Key: "changeType", Label: "Tipo de cambio", Type: "select", Required: true,
			DefaultValue: "normal",
			Options: []catalogDomain.FieldOption{
				{Value: "standard", Label: "Estándar"},
				{Value: "normal", Label: "Normal"},
				{Value: "emergency", Label: "Emergencia"},
			},
		},
		{
			Key: "requester", Label: "Solicitante", Type: "text", Required: true,
			MaxLength: &maxShort,
		},
		{
			Key: "changeOwner", Label: "Responsable del cambio", Type: "text",
			MaxLength: &maxShort, Placeholder: "Área de Services o responsable técnico",
		},
		{
			Key: "serviceAffected", Label: "Servicio afectado", Type: "text", Required: true,
			MaxLength: &maxShort,
		},
		{
			Key: "reason", Label: "Justificación", Type: "textarea", Required: true,
			MinLength: &minDescription, MaxLength: &maxPlan,
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
			Key: "urgency", Label: "Urgencia", Type: "select", Required: true,
			DefaultValue: "medium",
			Options: []catalogDomain.FieldOption{
				{Value: "low", Label: "Baja"},
				{Value: "medium", Label: "Media"},
				{Value: "high", Label: "Alta"},
			},
		},
		{
			Key: "likelihood", Label: "Probabilidad de falla", Type: "select", Required: true,
			DefaultValue: "medium",
			Options: []catalogDomain.FieldOption{
				{Value: "low", Label: "Baja"},
				{Value: "medium", Label: "Media"},
				{Value: "high", Label: "Alta"},
			},
		},
		{
			Key: "riskLevel", Label: "Riesgo calculado", Type: "select", Required: true,
			Options: []catalogDomain.FieldOption{
				{Value: "low", Label: "Bajo"},
				{Value: "medium", Label: "Medio"},
				{Value: "high", Label: "Alto"},
				{Value: "critical", Label: "Crítico"},
			},
		},
		{
			Key: "emergencyJustification", Label: "Justificación de emergencia",
			Type: "textarea", VisibleWhen: emergencyOnly, RequiredWhen: emergencyOnly,
			MinLength: &minDescription, MaxLength: &maxPlan,
		},
		{
			Key: "standardTemplate", Label: "Plantilla de cambio estándar",
			Type: "text", VisibleWhen: standardOnly, RequiredWhen: standardOnly,
			MaxLength: &maxShort, Placeholder: "Identificador de la plantilla preaprobada",
		},
		{
			Key: "implementationPlan", Label: "Plan de implementación",
			Type: "textarea", MaxLength: &maxPlan,
		},
		{
			Key: "rollbackPlan", Label: "Plan de reversa",
			Type: "textarea", MaxLength: &maxPlan,
		},
		{
			Key: "testPlan", Label: "Plan de pruebas",
			Type: "textarea", MaxLength: &maxPlan,
		},
		{
			Key: "plannedStart", Label: "Inicio de ventana",
			Type: "datetime",
		},
		{
			Key: "plannedEnd", Label: "Fin de ventana",
			Type: "datetime",
		},
		{
			Key: "approvalNotes", Label: "Notas de aprobación o rechazo",
			Type: "textarea", MaxLength: &maxPlan,
		},
		{
			Key: "implementationResult", Label: "Resultado de implementación",
			Type: "textarea", MaxLength: &maxPlan,
		},
		{
			Key: "relatedProblemId", Label: "Problema relacionado (PRB)",
			Type: "text", MaxLength: &maxShort, Placeholder: "Ej. PRB-000123",
		},
		{
			Key: "relatedIncidentIds", Label: "Incidentes relacionados (INC)",
			Type: "textarea", MaxLength: &maxPlan,
			Placeholder: "Un identificador INC por línea",
		},
	}
	lifecycle := catalogDomain.LifecycleDefinition{
		States: []catalogDomain.StateDefinition{
			{Key: "draft", Label: "Borrador", Initial: true},
			{Key: "assessment", Label: "Evaluación"},
			{Key: "pending_approval", Label: "Pendiente de CAB"},
			{Key: "approved", Label: "Aprobado"},
			{Key: "rejected", Label: "Rechazado"},
			{Key: "scheduled", Label: "Programado"},
			{Key: "implementing", Label: "En implementación"},
			{Key: "completed", Label: "Implementado"},
			{Key: "failed", Label: "Fallido"},
			{Key: "rolled_back", Label: "Revertido"},
			{Key: "closed", Label: "Cerrado"},
		},
		Transitions: []catalogDomain.TransitionDefinition{
			{Key: "submit", Label: "Enviar a evaluación", From: "draft", To: "assessment"},
			{Key: "request_approval", Label: "Solicitar aprobación CAB", From: "assessment", To: "pending_approval"},
			{Key: "approve", Label: "Aprobar cambio", From: "pending_approval", To: "approved"},
			{Key: "reject", Label: "Rechazar cambio", From: "pending_approval", To: "rejected"},
			{Key: "revise", Label: "Devolver a borrador", From: "rejected", To: "draft"},
			{Key: "schedule", Label: "Programar cambio", From: "approved", To: "scheduled"},
			{Key: "start", Label: "Iniciar implementación", From: "scheduled", To: "implementing"},
			{Key: "complete", Label: "Marcar implementado", From: "implementing", To: "completed"},
			{Key: "fail", Label: "Marcar fallido", From: "implementing", To: "failed"},
			{Key: "rollback", Label: "Confirmar reversa", From: "failed", To: "rolled_back"},
			{Key: "close", Label: "Cerrar cambio", From: "completed", To: "closed"},
			{Key: "close_after_rollback", Label: "Cerrar tras reversa", From: "rolled_back", To: "closed"},
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
	definition := catalogDomain.Definition{
		EntityKey:        "RFC",
		Name:             "Solicitud de cambio",
		MetamodelVersion: catalogDomain.CurrentMetamodelVersion,
		Specification: catalogDomain.Specification{
			Description: "Planifica, aprueba, implementa y audita cambios controlados sin mezclarlos con incidentes ni problemas.",
			Identity:    catalogDomain.IdentityDefinition{Prefix: "RFC"},
			Fields:      fields,
			Lifecycle:   lifecycle,
			Bindings: []catalogDomain.ResourceBinding{
				{
					Module: "iam", ResourceType: "policy",
					ResourceID: "iam:policy:change-default", Required: true,
				},
				{
					Module: "changes", ResourceType: "risk-matrix",
					ResourceID: "changes:risk-matrix:standard", Required: true,
				},
			},
			Views: map[string][]string{
				"create": {
					"title", "description", "changeType", "requester",
					"changeOwner", "serviceAffected", "reason", "impact",
					"urgency", "likelihood", "emergencyJustification",
					"standardTemplate", "relatedProblemId", "relatedIncidentIds",
				},
				"edit": {
					"title", "description", "changeType", "requester",
					"changeOwner", "serviceAffected", "reason", "impact",
					"urgency", "likelihood", "emergencyJustification",
					"standardTemplate", "implementationPlan", "rollbackPlan",
					"testPlan", "plannedStart", "plannedEnd", "approvalNotes",
					"implementationResult", "relatedProblemId", "relatedIncidentIds",
				},
				"summary": {"title", "changeType", "riskLevel", "serviceAffected", "plannedStart"},
			},
			DetailLayout: &catalogDomain.DetailLayoutDefinition{
				Fields: layoutFields, ShowSLA: &showFalse,
				ShowAttachments: &showFalse, ShowActivity: &showFalse,
			},
			Events: []catalogDomain.EventDefinition{
				{Key: "rfc_created", Trigger: "entity.created"},
				{Key: "rfc_updated", Trigger: "entity.updated"},
				{Key: "rfc_transitioned", Trigger: "entity.transitioned"},
			},
		},
	}

	created, err := catalogService.CreateDraft(ctx, definition)
	if err != nil {
		logger.Error("could not create RFC definition", "error", err)
		return
	}
	if _, err := catalogService.Publish(ctx, created.EntityKey, created.Version); err != nil {
		logger.Error("could not publish RFC definition", "error", err)
		return
	}
	logger.Info("published RFC v1 definition for Change Management")
}
