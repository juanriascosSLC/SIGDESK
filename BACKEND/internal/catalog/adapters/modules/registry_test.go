package modules

import (
	"context"
	"testing"

	"sig-desk/backend/internal/catalog/domain"
)

func TestListAvailableResourcesUsesDynamicModuleMetadata(t *testing.T) {
	registry := NewRegistry()
	reference := domain.ResourceReference{
		Module:          "sla",
		ResourceType:    "policy",
		ResourceID:      "sla:policy:incident-standard",
		ResourceVersion: "1",
		ContractVersion: "1",
	}
	registry.Register(reference, nil)
	registry.RegisterProvider("sla", func(context.Context) ([]domain.AvailableResource, error) {
		return []domain.AvailableResource{{
			Reference:   reference,
			DisplayName: "Atención estándar de incidentes",
		}}, nil
	})

	resources, err := registry.ListAvailableResources(context.Background())
	if err != nil {
		t.Fatalf("ListAvailableResources() error = %v", err)
	}
	if len(resources) != 1 || resources[0].DisplayName != "Atención estándar de incidentes" {
		t.Fatalf("unexpected discovery result: %#v", resources)
	}
}
