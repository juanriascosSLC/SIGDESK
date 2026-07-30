package memory

import (
	"time"

	"sig-desk/backend/internal/catalog/domain"
)

func DemoDefinitions() []domain.Definition {
	minimumTitle := 3
	maximumTitle := 160
	minimumDescription := 10
	maximumDescription := 10000
	publishedAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	return []domain.Definition{{
		ID:               "00000000-0000-0000-0000-000000000001",
		EntityKey:        "INC",
		Name:             "Incidente",
		Version:          1,
		MetamodelVersion: domain.CurrentMetamodelVersion,
		Status:           domain.StatusPublished,
		CreatedAt:        publishedAt,
		PublishedAt:      &publishedAt,
		Specification: domain.Specification{
			Description: "Registra y gestiona una interrupción o degradación de un servicio.",
			Identity:    domain.IdentityDefinition{Prefix: "INC"},
			Fields: []domain.FieldDefinition{
				{
					Key: "title", Label: "Título", Type: "text", Required: true,
					MinLength: &minimumTitle, MaxLength: &maximumTitle,
					Placeholder: "Describe brevemente el incidente",
				},
				{
					Key: "description", Label: "Descripción", Type: "textarea", Required: true,
					MinLength: &minimumDescription, MaxLength: &maximumDescription,
					Placeholder: "Incluye el impacto y los síntomas observados",
				},
				{
					Key: "priority", Label: "Prioridad", Type: "select", Required: true,
					DefaultValue: "medium",
					Options: []domain.FieldOption{
						{Value: "low", Label: "Baja"},
						{Value: "medium", Label: "Media"},
						{Value: "high", Label: "Alta"},
						{Value: "critical", Label: "Crítica"},
					},
				},
			},
			Lifecycle: domain.LifecycleDefinition{
				States: []domain.StateDefinition{
					{Key: "open", Label: "Abierto", Initial: true},
					{Key: "in_progress", Label: "En progreso"},
					{Key: "resolved", Label: "Resuelto"},
				},
				Transitions: []domain.TransitionDefinition{
					{Key: "start", Label: "Iniciar atención", From: "open", To: "in_progress"},
					{Key: "resolve", Label: "Resolver", From: "in_progress", To: "resolved"},
					{Key: "reopen", Label: "Reabrir", From: "resolved", To: "open"},
				},
			},
			Bindings: []domain.ResourceBinding{
				{
					Module: "iam", ResourceType: "policy",
					ResourceID: "iam:policy:incident-default", Required: true,
				},
				{
					Module: "sla", ResourceType: "policy",
					ResourceID: "sla:policy:incident-standard",
				},
			},
			Views: map[string][]string{
				"create":  {"title", "description", "priority"},
				"summary": {"title", "priority"},
			},
		},
	}}
}
