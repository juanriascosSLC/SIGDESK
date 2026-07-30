// Package modules provides the in-process contract registry used by the
// modular monolith. Each specialized module registers only its own resources
// and dispatcher. Catalog depends on the ModuleGateway port, not this adapter.
package modules

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"

	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type Handler func(context.Context, ports.CapabilityCommand) error
type Resolver func(context.Context, domain.ResourceReference) (domain.ResourceReference, error)
type Provider func(context.Context) ([]domain.AvailableResource, error)

type Registry struct {
	mutex     sync.RWMutex
	resources map[string]domain.ResourceReference
	handlers  map[string]Handler
	resolvers map[string]Resolver
	providers map[string]Provider
}

func NewRegistry() *Registry {
	return &Registry{
		resources: make(map[string]domain.ResourceReference),
		handlers:  make(map[string]Handler),
		resolvers: make(map[string]Resolver),
		providers: make(map[string]Provider),
	}
}

// NewDevelopmentRegistry contains only the demo resources owned by the
// development module adapters. Production modules register their resources
// during composition instead.
func NewDevelopmentRegistry() *Registry {
	registry := NewRegistry()
	registry.Register(domain.ResourceReference{
		Module:          "iam",
		ResourceType:    "policy",
		ResourceID:      "iam:policy:incident-default",
		ResourceVersion: "1",
		ContractVersion: "1",
		Required:        true,
	}, nil)
	registry.Register(domain.ResourceReference{
		Module:          "sla",
		ResourceType:    "policy",
		ResourceID:      "sla:policy:incident-standard",
		ResourceVersion: "1",
		ContractVersion: "1",
		Required:        false,
	}, nil)
	return registry
}

func (registry *Registry) Register(resource domain.ResourceReference, handler Handler) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	key := resourceKey(resource)
	registry.resources[key] = resource
	if handler != nil {
		registry.handlers[resource.Module] = handler
	}
}

func (registry *Registry) RegisterResolver(module string, resolver Resolver) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	registry.resolvers[module] = resolver
}

func (registry *Registry) RegisterProvider(module string, provider Provider) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	registry.providers[module] = provider
}

func (registry *Registry) ListAvailableResources(
	ctx context.Context,
) ([]domain.AvailableResource, error) {
	registry.mutex.RLock()
	resources := make([]domain.ResourceReference, 0, len(registry.resources))
	for _, resource := range registry.resources {
		resources = append(resources, resource)
	}
	providers := make([]Provider, 0, len(registry.providers))
	for _, provider := range registry.providers {
		providers = append(providers, provider)
	}
	registry.mutex.RUnlock()

	available := make(map[string]domain.AvailableResource)
	for _, resource := range resources {
		available[resourceKey(resource)+":"+resource.ResourceVersion] = domain.AvailableResource{
			Reference:   resource,
			DisplayName: displayName(resource.ResourceID),
		}
	}
	for _, provider := range providers {
		provided, err := provider(ctx)
		if err != nil {
			return nil, err
		}
		for _, resource := range provided {
			key := resourceKey(resource.Reference) + ":" + resource.Reference.ResourceVersion
			available[key] = resource
		}
	}
	result := make([]domain.AvailableResource, 0, len(available))
	for _, resource := range available {
		result = append(result, resource)
	}
	sort.Slice(result, func(left, right int) bool {
		leftRef := result[left].Reference
		rightRef := result[right].Reference
		if leftRef.Module != rightRef.Module {
			return leftRef.Module < rightRef.Module
		}
		if leftRef.ResourceType != rightRef.ResourceType {
			return leftRef.ResourceType < rightRef.ResourceType
		}
		return result[left].DisplayName < result[right].DisplayName
	})
	return result, nil
}

func (registry *Registry) ResolveResource(
	ctx context.Context,
	requested domain.ResourceReference,
) (domain.ResourceReference, error) {
	registry.mutex.RLock()
	resolver := registry.resolvers[requested.Module]
	if resolver != nil {
		registry.mutex.RUnlock()
		return resolver(ctx, requested)
	}
	defer registry.mutex.RUnlock()
	owned, exists := registry.resources[resourceKey(requested)]
	if !exists {
		return domain.ResourceReference{}, fmt.Errorf(
			"module %s does not expose %s %q",
			requested.Module,
			requested.ResourceType,
			requested.ResourceID,
		)
	}
	if requested.ResourceVersion != "" && requested.ResourceVersion != owned.ResourceVersion {
		return domain.ResourceReference{}, fmt.Errorf(
			"resource %s requested version %s, available version is %s",
			requested.ResourceID,
			requested.ResourceVersion,
			owned.ResourceVersion,
		)
	}
	if requested.ContractVersion != "" && requested.ContractVersion != owned.ContractVersion {
		return domain.ResourceReference{}, fmt.Errorf(
			"resource %s requested contract %s, available contract is %s",
			requested.ResourceID,
			requested.ContractVersion,
			owned.ContractVersion,
		)
	}
	owned.Required = requested.Required || owned.Required
	return owned, nil
}

func (registry *Registry) Dispatch(ctx context.Context, command ports.CapabilityCommand) error {
	registry.mutex.RLock()
	handler := registry.handlers[command.Module]
	registry.mutex.RUnlock()
	if handler == nil {
		return nil
	}
	return handler(ctx, command)
}

func resourceKey(resource domain.ResourceReference) string {
	return resource.Module + ":" + resource.ResourceType + ":" + resource.ResourceID
}

func displayName(resourceID string) string {
	parts := strings.Split(resourceID, ":")
	name := parts[len(parts)-1]
	name = strings.ReplaceAll(name, "-", " ")
	if name == "" {
		return resourceID
	}
	return strings.ToUpper(name[:1]) + name[1:]
}

var _ ports.ModuleGateway = (*Registry)(nil)
var _ ports.ResourceCatalog = (*Registry)(nil)
