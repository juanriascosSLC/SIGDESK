package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

const EntityKey = "RFC"

var riskReference = catalogDomain.ResourceReference{
	Module:          "changes",
	ResourceType:    "risk-matrix",
	ResourceID:      "changes:risk-matrix:standard",
	ResourceVersion: "1",
	ContractVersion: "1",
	Required:        true,
}

type Service struct {
	catalog *catalogApplication.Service
}

func NewService(catalog *catalogApplication.Service) *Service {
	return &Service{catalog: catalog}
}

func (service *Service) Resources() []catalogDomain.ResourceReference {
	return []catalogDomain.ResourceReference{riskReference}
}

func (service *Service) HandleCommand(
	_ context.Context,
	command catalogPorts.CapabilityCommand,
) error {
	if command.Resource.ResourceID != riskReference.ResourceID {
		return fmt.Errorf("change risk matrix %q does not exist", command.Resource.ResourceID)
	}
	if command.Operation != "entity.create" && command.Operation != "entity.update" {
		return nil
	}
	calculated, err := CalculateRisk(command.Entity.Data)
	if err != nil {
		return fmt.Errorf("%w: %v", catalogPorts.ErrCapabilityDenied, err)
	}
	supplied, _ := command.Entity.Data["riskLevel"].(string)
	if supplied != calculated {
		return fmt.Errorf(
			"%w: riskLevel must be %q for the selected impact, urgency and likelihood",
			catalogPorts.ErrCapabilityDenied,
			calculated,
		)
	}
	return nil
}

func CalculateRisk(data map[string]any) (string, error) {
	impact, err := scoredValue(data, "impact", map[string]int{
		"low": 1, "medium": 2, "high": 3, "critical": 4,
	})
	if err != nil {
		return "", err
	}
	urgency, err := scoredValue(data, "urgency", map[string]int{
		"low": 1, "medium": 2, "high": 3,
	})
	if err != nil {
		return "", err
	}
	likelihood, err := scoredValue(data, "likelihood", map[string]int{
		"low": 1, "medium": 2, "high": 3,
	})
	if err != nil {
		return "", err
	}
	score := impact*urgency + likelihood
	switch {
	case score <= 4:
		return "low", nil
	case score <= 7:
		return "medium", nil
	case score <= 10:
		return "high", nil
	default:
		return "critical", nil
	}
}

func scoredValue(data map[string]any, field string, allowed map[string]int) (int, error) {
	value, _ := data[field].(string)
	value = strings.ToLower(strings.TrimSpace(value))
	score, exists := allowed[value]
	if !exists {
		return 0, fmt.Errorf("field %q has an invalid value", field)
	}
	return score, nil
}

func (service *Service) Definition(ctx context.Context) (catalogDomain.Definition, error) {
	return service.catalog.GetPublishedDefinition(ctx, EntityKey)
}

func (service *Service) List(ctx context.Context) ([]catalogDomain.EntityRecord, error) {
	return service.catalog.ListEntities(ctx, EntityKey)
}

func (service *Service) Get(
	ctx context.Context,
	entityID string,
) (catalogDomain.EntityRecord, error) {
	return service.catalog.GetEntity(ctx, EntityKey, entityID)
}

func (service *Service) Manifest(
	ctx context.Context,
	entityID string,
) (catalogDomain.ExecutableDefinitionManifest, error) {
	return service.catalog.GetEntityManifest(ctx, EntityKey, entityID)
}

func (service *Service) Create(
	ctx context.Context,
	data map[string]any,
	idempotencyKey string,
) (catalogDomain.EntityRecord, bool, error) {
	normalized, err := withCalculatedRisk(data)
	if err != nil {
		return catalogDomain.EntityRecord{}, false, err
	}
	return service.catalog.CreateEntityIdempotent(
		ctx,
		EntityKey,
		normalized,
		idempotencyKey,
	)
}

func (service *Service) Update(
	ctx context.Context,
	entityID string,
	data map[string]any,
	expectedUpdatedAt time.Time,
) (catalogDomain.EntityRecord, error) {
	normalized, err := withCalculatedRisk(data)
	if err != nil {
		return catalogDomain.EntityRecord{}, err
	}
	return service.catalog.UpdateEntity(
		ctx,
		EntityKey,
		entityID,
		normalized,
		expectedUpdatedAt,
	)
}

func withCalculatedRisk(data map[string]any) (map[string]any, error) {
	risk, err := CalculateRisk(data)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", catalogDomain.ErrInvalidEntityData, err)
	}
	normalized := make(map[string]any, len(data)+1)
	for key, value := range data {
		normalized[key] = value
	}
	normalized["riskLevel"] = risk
	return normalized, nil
}

func (service *Service) Transition(
	ctx context.Context,
	entityID string,
	transitionKey string,
) (catalogDomain.EntityRecord, error) {
	entity, err := service.Get(ctx, entityID)
	if err != nil {
		return catalogDomain.EntityRecord{}, err
	}
	if err := validateTransitionData(transitionKey, entity.Data); err != nil {
		return catalogDomain.EntityRecord{}, err
	}
	return service.catalog.TransitionEntity(ctx, EntityKey, entityID, transitionKey)
}

func validateTransitionData(transitionKey string, data map[string]any) error {
	required := map[string][]string{
		"request_approval": {"implementationPlan", "rollbackPlan", "testPlan"},
		"schedule":         {"plannedStart", "plannedEnd"},
		"reject":           {"approvalNotes"},
		"complete":         {"implementationResult"},
		"fail":             {"implementationResult"},
	}
	for _, field := range required[transitionKey] {
		if strings.TrimSpace(fmt.Sprint(data[field])) == "" || data[field] == nil {
			return fmt.Errorf(
				"%w: transition %q requires field %q",
				catalogDomain.ErrInvalidTransition,
				transitionKey,
				field,
			)
		}
	}
	if transitionKey == "schedule" {
		start, startErr := time.Parse(time.RFC3339, fmt.Sprint(data["plannedStart"]))
		end, endErr := time.Parse(time.RFC3339, fmt.Sprint(data["plannedEnd"]))
		if startErr != nil || endErr != nil || !end.After(start) {
			return fmt.Errorf(
				"%w: plannedEnd must be after plannedStart",
				catalogDomain.ErrInvalidTransition,
			)
		}
	}
	return nil
}
