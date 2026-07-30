package application

import (
	"context"
	"errors"
	"fmt"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
)

var ErrForbidden = errors.New("iam policy denied the operation")

type Policy struct {
	Reference    catalogDomain.ResourceReference
	AllowedRoles map[string]map[string]bool
}

type Service struct {
	policies              map[string]Policy
	allowMissingPrincipal bool
}

func NewService(allowMissingPrincipal bool) *Service {
	incidentReference := catalogDomain.ResourceReference{
		Module:          "iam",
		ResourceType:    "policy",
		ResourceID:      "iam:policy:incident-default",
		ResourceVersion: "1",
		ContractVersion: "1",
		Required:        true,
	}
	changeReference := catalogDomain.ResourceReference{
		Module:          "iam",
		ResourceType:    "policy",
		ResourceID:      "iam:policy:change-default",
		ResourceVersion: "1",
		ContractVersion: "1",
		Required:        true,
	}
	return &Service{
		allowMissingPrincipal: allowMissingPrincipal,
		policies: map[string]Policy{
			incidentReference.ResourceID: {
				Reference: incidentReference,
				AllowedRoles: map[string]map[string]bool{
					"entity.create": {
						"end_user": true,
						"agent":    true,
						"manager":  true,
						"admin":    true,
						"system":   true,
					},
					"entity.transition": {
						"agent":   true,
						"manager": true,
						"admin":   true,
						"system":  true,
					},
					"entity.update": {
						"agent":   true,
						"manager": true,
						"admin":   true,
						"system":  true,
					},
				},
			},
			changeReference.ResourceID: {
				Reference: changeReference,
				AllowedRoles: map[string]map[string]bool{
					"entity.create": {
						"end_user":       true,
						"agent":          true,
						"services":       true,
						"change_manager": true,
						"manager":        true,
						"admin":          true,
						"system":         true,
					},
					"entity.update": {
						"agent":          true,
						"services":       true,
						"change_manager": true,
						"manager":        true,
						"admin":          true,
						"system":         true,
					},
					"entity.transition": {
						"services":       true,
						"change_manager": true,
						"manager":        true,
						"admin":          true,
						"system":         true,
					},
				},
			},
		},
	}
}

func (service *Service) Resources() []catalogDomain.ResourceReference {
	resources := make([]catalogDomain.ResourceReference, 0, len(service.policies))
	for _, policy := range service.policies {
		resources = append(resources, policy.Reference)
	}
	return resources
}

func (service *Service) HandleCommand(
	_ context.Context,
	command catalogPorts.CapabilityCommand,
) error {
	policy, exists := service.policies[command.Resource.ResourceID]
	if !exists {
		return fmt.Errorf("%w: policy %q does not exist", ErrForbidden, command.Resource.ResourceID)
	}
	if command.Principal.ID == "" && len(command.Principal.Roles) == 0 {
		if service.allowMissingPrincipal {
			return nil
		}
		return fmt.Errorf("%w: authenticated principal is required", ErrForbidden)
	}
	allowed := policy.AllowedRoles[command.Operation]
	for _, role := range command.Principal.Roles {
		if allowed[role] {
			return nil
		}
	}
	return fmt.Errorf(
		"%w: principal %q lacks a role allowed for %s",
		ErrForbidden,
		command.Principal.ID,
		command.Operation,
	)
}
