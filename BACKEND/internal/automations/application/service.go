package application

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

type Execution struct {
	EventID    string   `json:"eventId"`
	EntityID   string   `json:"entityId"`
	WorkflowID string   `json:"workflowId"`
	Actions    []string `json:"actions"`
}

type Service struct {
	mutex      sync.RWMutex
	reference  catalogDomain.ResourceReference
	executions map[string]Execution
}

func NewService() *Service {
	return &Service{
		reference: catalogDomain.ResourceReference{
			Module:          "automations",
			ResourceType:    "workflow",
			ResourceID:      "automations:workflow:incident-critical",
			ResourceVersion: "1",
			ContractVersion: "1",
		},
		executions: make(map[string]Execution),
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
		return fmt.Errorf("automation workflow %q does not exist", command.Resource.ResourceID)
	}
	return nil
}

func (service *Service) HandleEvent(
	_ context.Context,
	event catalogDomain.EventEnvelope,
) error {
	service.mutex.Lock()
	defer service.mutex.Unlock()
	if _, exists := service.executions[event.EventID]; exists {
		return nil
	}
	var payload catalogDomain.EntityCreatedPayload
	if event.EventType != catalogDomain.EventEntityCreatedV1 {
		return nil
	}
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return err
	}
	if !hasResource(payload.Resources, service.reference) {
		return nil
	}
	actions := []string{"record_incident_created"}
	if priority, _ := payload.Data["priority"].(string); priority == "critical" {
		actions = append(actions, "escalate_on_call")
	}
	service.executions[event.EventID] = Execution{
		EventID:    event.EventID,
		EntityID:   payload.EntityID,
		WorkflowID: service.reference.ResourceID,
		Actions:    actions,
	}
	return nil
}

func hasResource(
	resources []catalogDomain.ResourceReference,
	expected catalogDomain.ResourceReference,
) bool {
	for _, resource := range resources {
		if resource.Module == expected.Module &&
			resource.ResourceType == expected.ResourceType &&
			resource.ResourceID == expected.ResourceID &&
			resource.ResourceVersion == expected.ResourceVersion {
			return true
		}
	}
	return false
}
