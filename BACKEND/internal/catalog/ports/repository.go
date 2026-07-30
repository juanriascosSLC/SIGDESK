package ports

import (
	"context"
	"errors"
	"time"

	"sig-desk/backend/internal/catalog/domain"
)

var ErrNotFound = errors.New("catalog resource not found")
var ErrVersionConflict = errors.New("catalog version conflict")
var ErrCapabilityDenied = errors.New("module capability denied")
var ErrIdempotencyConflict = errors.New("idempotency key was already used with a different request")
var ErrInvalidIdempotencyKey = errors.New("idempotency key is invalid")

type IdempotencyRequest struct {
	Scope       string
	Key         string
	RequestHash string
}

type Repository interface {
	ListDefinitions(context.Context, bool) ([]domain.Definition, error)
	GetPublishedDefinition(context.Context, string) (domain.Definition, error)
	GetDefinition(context.Context, string, int) (domain.Definition, error)
	CreateDraft(context.Context, domain.Definition) (domain.Definition, error)
	Publish(context.Context, domain.Definition, domain.ExecutableDefinitionManifest) (domain.Definition, error)
	CreateEntity(
		context.Context,
		domain.Definition,
		map[string]any,
		IdempotencyRequest,
	) (domain.EntityRecord, bool, error)
	LookupEntityByIdempotency(
		context.Context,
		IdempotencyRequest,
	) (domain.EntityRecord, bool, error)
	GetEntity(context.Context, string, string) (domain.EntityRecord, error)
	UpdateEntity(
		context.Context,
		domain.EntityRecord,
		map[string]any,
		domain.ExecutableDefinitionManifest,
		Principal,
	) (domain.EntityRecord, error)
	TransitionEntity(
		context.Context,
		domain.EntityRecord,
		string,
		string,
		domain.ExecutableDefinitionManifest,
	) (domain.EntityRecord, error)
	ListEntities(context.Context, string) ([]domain.EntityRecord, error)
	ListEntityRelations(context.Context, string) ([]domain.EntityRelation, error)
	CreateEntityRelation(context.Context, domain.EntityRelation) (domain.EntityRelation, bool, error)
	DeleteEntityRelation(context.Context, string, string) error
}

type OutboxStore interface {
	ClaimOutbox(context.Context, string, int, time.Time, time.Duration) ([]domain.OutboxMessage, error)
	MarkOutboxPublished(context.Context, string, string, time.Time) error
	MarkOutboxFailed(context.Context, string, string, string, time.Time) error
	OutboxStatus(context.Context, time.Time) (domain.OutboxStatus, error)
}

type EventPublisher interface {
	Publish(context.Context, domain.EventEnvelope) error
}

// ModuleGateway is implemented by the specialized modules. Catalog only
// resolves stable references and delegates lifecycle signals through this
// contract; it never stores credentials or executes the capability itself.
type ModuleGateway interface {
	ResolveResource(context.Context, domain.ResourceReference) (domain.ResourceReference, error)
	Dispatch(context.Context, CapabilityCommand) error
}

type ResourceCatalog interface {
	ListAvailableResources(context.Context) ([]domain.AvailableResource, error)
}

type CapabilityCommand struct {
	Module        string                              `json:"module"`
	Operation     string                              `json:"operation"`
	Resource      domain.ResourceReference            `json:"resource"`
	Entity        domain.EntityRecord                 `json:"entity"`
	Definition    domain.ExecutableDefinitionManifest `json:"definition"`
	TransitionKey string                              `json:"transitionKey,omitempty"`
	Principal     Principal                           `json:"principal"`
}

type Principal struct {
	ID    string   `json:"id"`
	Roles []string `json:"roles"`
}

type principalContextKey struct{}

func ContextWithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, principal)
}

func PrincipalFromContext(ctx context.Context) Principal {
	principal, _ := ctx.Value(principalContextKey{}).(Principal)
	return principal
}
