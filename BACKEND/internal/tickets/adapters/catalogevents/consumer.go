// Package catalogevents translates the catalog runtime's versioned event
// envelope into Tickets' inbound projection port. It is the only place where
// the two modules' event DTOs are coupled.
package catalogevents

import (
	"context"
	"encoding/json"
	"fmt"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	ticketDomain "sig-desk/backend/internal/tickets/domain"
	ticketPorts "sig-desk/backend/internal/tickets/ports"
)

type Consumer struct {
	projection ticketPorts.CatalogProjectionPort
}

func NewConsumer(projection ticketPorts.CatalogProjectionPort) *Consumer {
	return &Consumer{projection: projection}
}

func (consumer *Consumer) Handle(
	ctx context.Context,
	event catalogDomain.EventEnvelope,
) error {
	switch event.EventType {
	case catalogDomain.EventEntityCreatedV1:
		var payload catalogDomain.EntityCreatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return fmt.Errorf("decode catalog entity created event: %w", err)
		}
		return consumer.projection.ApplyEntityCreated(ctx, ticketDomain.CatalogEntityCreatedEvent{
			EventID:             event.EventID,
			OccurredAt:          event.OccurredAt,
			EntityID:            payload.EntityID,
			HumanID:             payload.HumanID,
			EntityKey:           payload.EntityKey,
			DefinitionVersionID: payload.DefinitionVersionID,
			DefinitionVersion:   payload.DefinitionVersion,
			ManifestChecksum:    payload.ManifestChecksum,
			State:               payload.State,
			Data:                payload.Data,
		})
	case catalogDomain.EventEntityTransitionedV1:
		var payload catalogDomain.EntityTransitionedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return fmt.Errorf("decode catalog entity transitioned event: %w", err)
		}
		return consumer.projection.ApplyEntityTransitioned(
			ctx,
			ticketDomain.CatalogEntityTransitionedEvent{
				EventID:             event.EventID,
				OccurredAt:          event.OccurredAt,
				EntityID:            payload.EntityID,
				HumanID:             payload.HumanID,
				EntityKey:           payload.EntityKey,
				DefinitionVersionID: payload.DefinitionVersionID,
				DefinitionVersion:   payload.DefinitionVersion,
				ManifestChecksum:    payload.ManifestChecksum,
				TransitionKey:       payload.TransitionKey,
				PreviousState:       payload.PreviousState,
				CurrentState:        payload.CurrentState,
				Data:                payload.Data,
			},
		)
	case catalogDomain.EventEntityUpdatedV1:
		var payload catalogDomain.EntityUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return fmt.Errorf("decode catalog entity updated event: %w", err)
		}
		return consumer.projection.ApplyEntityUpdated(
			ctx,
			ticketDomain.CatalogEntityUpdatedEvent{
				EventID:             event.EventID,
				OccurredAt:          event.OccurredAt,
				EntityID:            payload.EntityID,
				HumanID:             payload.HumanID,
				EntityKey:           payload.EntityKey,
				DefinitionVersionID: payload.DefinitionVersionID,
				DefinitionVersion:   payload.DefinitionVersion,
				ManifestChecksum:    payload.ManifestChecksum,
				State:               payload.State,
				Data:                payload.Data,
				ChangedFields:       payload.ChangedFields,
				ActorID:             payload.ActorID,
			},
		)
	default:
		return nil
	}
}
