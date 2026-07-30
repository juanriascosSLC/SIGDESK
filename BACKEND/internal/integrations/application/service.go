package application

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

type OutboundCall struct {
	EventID     string `json:"eventId"`
	EntityID    string `json:"entityId"`
	ConnectorID string `json:"connectorId"`
	Status      string `json:"status"`
}

type Service struct {
	mutex         sync.RWMutex
	reference     catalogDomain.ResourceReference
	credentialRef string
	calls         map[string]OutboundCall
}

func NewService(credentialRef string) *Service {
	return &Service{
		reference: catalogDomain.ResourceReference{
			Module:          "integrations",
			ResourceType:    "connector",
			ResourceID:      "integrations:connector:incident-webhook",
			ResourceVersion: "1",
			ContractVersion: "1",
		},
		credentialRef: credentialRef,
		calls:         make(map[string]OutboundCall),
	}
}

func (service *Service) Resources() []catalogDomain.ResourceReference {
	return []catalogDomain.ResourceReference{service.reference}
}

func (service *Service) HandleCommand(
	_ context.Context,
	command catalogPorts.CapabilityCommand,
) error {
	if command.Resource.ResourceID != service.reference.ResourceID {
		return fmt.Errorf("integration connector %q does not exist", command.Resource.ResourceID)
	}
	if service.credentialRef == "" {
		return fmt.Errorf("connector %s has no module-owned credential reference", service.reference.ResourceID)
	}
	return nil
}

func (service *Service) HandleEvent(
	_ context.Context,
	event catalogDomain.EventEnvelope,
) error {
	if event.EventType != catalogDomain.EventEntityCreatedV1 {
		return nil
	}
	var payload catalogDomain.EntityCreatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return err
	}
	if !references(payload.Resources, service.reference) {
		return nil
	}
	service.mutex.Lock()
	defer service.mutex.Unlock()
	if _, exists := service.calls[event.EventID]; exists {
		return nil
	}
	service.calls[event.EventID] = OutboundCall{
		EventID:     event.EventID,
		EntityID:    payload.EntityID,
		ConnectorID: service.reference.ResourceID,
		Status:      "queued",
	}
	return nil
}

func references(resources []catalogDomain.ResourceReference, expected catalogDomain.ResourceReference) bool {
	for _, resource := range resources {
		if resource.Module == expected.Module &&
			resource.ResourceID == expected.ResourceID &&
			resource.ResourceVersion == expected.ResourceVersion {
			return true
		}
	}
	return false
}
