package application

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

type Service struct {
	mutex     sync.RWMutex
	reference catalogDomain.ResourceReference
	processed map[string]bool
	counts    map[string]int
}

func NewService() *Service {
	return &Service{
		reference: catalogDomain.ResourceReference{
			Module:          "reports",
			ResourceType:    "metric",
			ResourceID:      "reports:metric:incident-lifecycle",
			ResourceVersion: "1",
			ContractVersion: "1",
		},
		processed: make(map[string]bool),
		counts:    make(map[string]int),
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
		return fmt.Errorf("report metric %q does not exist", command.Resource.ResourceID)
	}
	return nil
}

func (service *Service) HandleEvent(
	_ context.Context,
	event catalogDomain.EventEnvelope,
) error {
	var resources []catalogDomain.ResourceReference
	var metricKey string
	switch event.EventType {
	case catalogDomain.EventEntityCreatedV1:
		var payload catalogDomain.EntityCreatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return err
		}
		resources = payload.Resources
		metricKey = "created"
	case catalogDomain.EventEntityTransitionedV1:
		var payload catalogDomain.EntityTransitionedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return err
		}
		resources = payload.Resources
		metricKey = "state." + payload.CurrentState
	case catalogDomain.EventEntityUpdatedV1:
		var payload catalogDomain.EntityUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return err
		}
		resources = payload.Resources
		metricKey = "updated"
	default:
		return nil
	}
	if !references(resources, service.reference) {
		return nil
	}
	service.mutex.Lock()
	defer service.mutex.Unlock()
	if service.processed[event.EventID] {
		return nil
	}
	service.processed[event.EventID] = true
	service.counts[metricKey]++
	return nil
}

func (service *Service) Count(metricKey string) int {
	service.mutex.RLock()
	defer service.mutex.RUnlock()
	return service.counts[metricKey]
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
