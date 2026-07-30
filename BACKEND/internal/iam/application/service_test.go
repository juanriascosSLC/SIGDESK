package application

import (
	"context"
	"errors"
	"testing"

	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

func TestPolicyAuthorizesByOperationAndRole(t *testing.T) {
	service := NewService(false)
	var resource = service.Resources()[0]
	for _, candidate := range service.Resources() {
		if candidate.ResourceID == "iam:policy:incident-default" {
			resource = candidate
			break
		}
	}
	create := catalogPorts.CapabilityCommand{
		Operation: "entity.create",
		Resource:  resource,
		Principal: catalogPorts.Principal{ID: "user-1", Roles: []string{"end_user"}},
	}
	if err := service.HandleCommand(context.Background(), create); err != nil {
		t.Fatalf("end user create denied: %v", err)
	}
	transition := create
	transition.Operation = "entity.transition"
	if err := service.HandleCommand(context.Background(), transition); !errors.Is(err, ErrForbidden) {
		t.Fatalf("end user transition error = %v, want ErrForbidden", err)
	}
	transition.Principal.Roles = []string{"agent"}
	if err := service.HandleCommand(context.Background(), transition); err != nil {
		t.Fatalf("agent transition denied: %v", err)
	}
}
