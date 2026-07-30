package application

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

type Delivery struct {
	EventID    string `json:"eventId"`
	EntityID   string `json:"entityId"`
	TemplateID string `json:"templateId"`
	Subject    string `json:"subject"`
	Status     string `json:"status"`
}

type Service struct {
	mutex      sync.RWMutex
	reference  catalogDomain.ResourceReference
	deliveries map[string]Delivery
}

func NewService() *Service {
	return &Service{
		reference: catalogDomain.ResourceReference{
			Module:          "notifications",
			ResourceType:    "template",
			ResourceID:      "notifications:template:incident-created",
			ResourceVersion: "1",
			ContractVersion: "1",
		},
		deliveries: make(map[string]Delivery),
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
		return fmt.Errorf("notification template %q does not exist", command.Resource.ResourceID)
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
	title, _ := payload.Data["title"].(string)
	service.mutex.Lock()
	defer service.mutex.Unlock()
	if _, exists := service.deliveries[event.EventID]; exists {
		return nil
	}
	service.deliveries[event.EventID] = Delivery{
		EventID:    event.EventID,
		EntityID:   payload.EntityID,
		TemplateID: service.reference.ResourceID,
		Subject:    payload.HumanID + " · " + title,
		Status:     "queued",
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
