// Package catalogintake bridges the Tickets module to the Catalog Builder
// runtime. Catalog owns the versioned entity definition, validation and
// lifecycle; Tickets keeps a query projection and delegates lifecycle
// commands for projected entities back to Catalog.
//
// Because SIG-DESK is a Go modular monolith today (see ADR-0006), commands
// cross the module boundary through an in-process port. Projection updates
// travel in the opposite direction through versioned outbox events.
package catalogintake

import (
	"context"
	"errors"
	"fmt"

	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
	"sig-desk/backend/internal/tickets/domain"
)

type Adapter struct {
	catalog *catalogApplication.Service
}

func NewAdapter(catalog *catalogApplication.Service) *Adapter {
	return &Adapter{catalog: catalog}
}

func (adapter *Adapter) CreateEntity(
	ctx context.Context,
	entityKey string,
	data map[string]any,
	idempotencyKey string,
) (domain.CatalogEntityCreatedEvent, error) {
	definition, err := adapter.catalog.GetPublishedDefinition(ctx, entityKey)
	if err != nil {
		if errors.Is(err, catalogPorts.ErrNotFound) {
			return domain.CatalogEntityCreatedEvent{}, fmt.Errorf(
				"%w: %s",
				domain.ErrCatalogDefinitionNotFound,
				entityKey,
			)
		}
		return domain.CatalogEntityCreatedEvent{}, err
	}

	// The legacy POST /tickets contract may contain properties that are not
	// part of the currently published definition. Select fields from metadata
	// instead of copying a hard-coded ticket schema into Catalog.
	entityData := make(map[string]any, len(definition.Specification.Fields))
	for _, field := range definition.Specification.Fields {
		if value, exists := data[field.Key]; exists && value != nil {
			entityData[field.Key] = value
			continue
		}
		if field.DefaultValue != nil {
			entityData[field.Key] = field.DefaultValue
		}
	}

	entity, replayed, err := adapter.catalog.CreateEntityIdempotent(
		ctx,
		entityKey,
		entityData,
		idempotencyKey,
	)
	if err != nil {
		if errors.Is(err, catalogDomain.ErrInvalidEntityData) {
			return domain.CatalogEntityCreatedEvent{}, fmt.Errorf(
				"%w: %s",
				domain.ErrCatalogValidation,
				err.Error(),
			)
		}
		if errors.Is(err, catalogPorts.ErrIdempotencyConflict) {
			return domain.CatalogEntityCreatedEvent{}, domain.ErrIdempotencyConflict
		}
		if errors.Is(err, catalogPorts.ErrInvalidIdempotencyKey) {
			return domain.CatalogEntityCreatedEvent{}, domain.ErrInvalidIdempotencyKey
		}
		return domain.CatalogEntityCreatedEvent{}, err
	}
	return domain.CatalogEntityCreatedEvent{
		EventID:             "compat:" + entity.ID,
		OccurredAt:          entity.CreatedAt,
		EntityID:            entity.ID,
		HumanID:             entity.HumanID,
		EntityKey:           entity.EntityKey,
		DefinitionVersionID: entity.DefinitionVersionID,
		DefinitionVersion:   entity.DefinitionVersion,
		ManifestChecksum:    entity.ManifestChecksum,
		State:               entity.State,
		Data:                entity.Data,
		Replayed:            replayed,
	}, nil
}

func (adapter *Adapter) TransitionEntity(
	ctx context.Context,
	entityKey string,
	entityID string,
	targetState string,
) error {
	_, err := adapter.catalog.TransitionEntityToState(ctx, entityKey, entityID, targetState)
	if errors.Is(err, catalogDomain.ErrInvalidTransition) {
		return fmt.Errorf("%w: %s", domain.ErrInvalidTransition, err.Error())
	}
	return err
}
