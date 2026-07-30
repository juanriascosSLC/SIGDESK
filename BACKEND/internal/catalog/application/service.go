package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type Service struct {
	repository ports.Repository
	gateway    ports.ModuleGateway
	now        func() time.Time
}

func NewService(repository ports.Repository, gateways ...ports.ModuleGateway) *Service {
	var gateway ports.ModuleGateway
	if len(gateways) > 0 {
		gateway = gateways[0]
	}
	return &Service{
		repository: repository,
		gateway:    gateway,
		now:        func() time.Time { return time.Now().UTC() },
	}
}

func (service *Service) ListDefinitions(ctx context.Context, publishedOnly bool) ([]domain.Definition, error) {
	return service.repository.ListDefinitions(ctx, publishedOnly)
}

func (service *Service) OutboxStatus(ctx context.Context) (domain.OutboxStatus, error) {
	store, ok := service.repository.(ports.OutboxStore)
	if !ok {
		return domain.OutboxStatus{}, fmt.Errorf("catalog repository does not expose outbox status")
	}
	return store.OutboxStatus(ctx, service.now())
}

func (service *Service) ListAvailableResources(
	ctx context.Context,
	module string,
	resourceType string,
) ([]domain.AvailableResource, error) {
	catalog, ok := service.gateway.(ports.ResourceCatalog)
	if !ok {
		return []domain.AvailableResource{}, nil
	}
	resources, err := catalog.ListAvailableResources(ctx)
	if err != nil {
		return nil, err
	}
	filtered := make([]domain.AvailableResource, 0, len(resources))
	for _, resource := range resources {
		if module != "" && resource.Reference.Module != module {
			continue
		}
		if resourceType != "" && resource.Reference.ResourceType != resourceType {
			continue
		}
		filtered = append(filtered, resource)
	}
	return filtered, nil
}

func (service *Service) GetPublishedDefinition(ctx context.Context, entityKey string) (domain.Definition, error) {
	definition, err := service.repository.GetPublishedDefinition(ctx, domain.NormalizeEntityKey(entityKey))
	if err != nil {
		return domain.Definition{}, err
	}
	return service.withExecutableManifest(ctx, definition)
}

func (service *Service) GetDefinition(
	ctx context.Context,
	entityKey string,
	version int,
) (domain.Definition, error) {
	return service.repository.GetDefinition(ctx, domain.NormalizeEntityKey(entityKey), version)
}

func (service *Service) CreateDraft(ctx context.Context, definition domain.Definition) (domain.Definition, error) {
	definition.EntityKey = domain.NormalizeEntityKey(definition.EntityKey)
	definition.Name = strings.TrimSpace(definition.Name)
	definition.Specification.Identity.Prefix = domain.NormalizeEntityKey(definition.Specification.Identity.Prefix)
	definition.MetamodelVersion = domain.CurrentMetamodelVersion
	definition.Status = domain.StatusDraft
	definition.Manifest = nil
	definition.Checksum = ""
	if err := definition.Validate(); err != nil {
		return domain.Definition{}, err
	}
	return service.repository.CreateDraft(ctx, definition)
}

func (service *Service) ValidatePublication(
	ctx context.Context,
	entityKey string,
	version int,
) (domain.PublicationValidation, error) {
	definition, err := service.GetDefinition(ctx, entityKey, version)
	if err != nil {
		return domain.PublicationValidation{}, err
	}
	manifest, issues := service.compile(ctx, definition)
	result := domain.PublicationValidation{
		Valid:  len(issues) == 0,
		Issues: issues,
	}
	if result.Valid {
		result.Manifest = &manifest
	}
	return result, nil
}

func (service *Service) Publish(ctx context.Context, entityKey string, version int) (domain.Definition, error) {
	definition, err := service.GetDefinition(ctx, entityKey, version)
	if err != nil {
		return domain.Definition{}, err
	}
	if definition.Status != domain.StatusDraft {
		return domain.Definition{}, fmt.Errorf(
			"%w: only draft definitions can be published",
			domain.ErrInvalidDefinition,
		)
	}
	manifest, issues := service.compile(ctx, definition)
	if len(issues) > 0 {
		return domain.Definition{}, fmt.Errorf(
			"%w: publication blocked: %s",
			domain.ErrInvalidDefinition,
			issues[0].Message,
		)
	}
	return service.repository.Publish(ctx, definition, manifest)
}

func (service *Service) GetManifest(
	ctx context.Context,
	entityKey string,
	version int,
) (domain.ExecutableDefinitionManifest, error) {
	definition, err := service.GetDefinition(ctx, entityKey, version)
	if err != nil {
		return domain.ExecutableDefinitionManifest{}, err
	}
	executable, err := service.withExecutableManifest(ctx, definition)
	if err != nil {
		return domain.ExecutableDefinitionManifest{}, err
	}
	if executable.Manifest == nil {
		return domain.ExecutableDefinitionManifest{}, ports.ErrNotFound
	}
	return *executable.Manifest, nil
}

func (service *Service) CreateEntity(
	ctx context.Context,
	entityKey string,
	data map[string]any,
) (domain.EntityRecord, error) {
	entity, _, err := service.CreateEntityIdempotent(ctx, entityKey, data, "")
	return entity, err
}

func (service *Service) CreateEntityIdempotent(
	ctx context.Context,
	entityKey string,
	data map[string]any,
	idempotencyKey string,
) (domain.EntityRecord, bool, error) {
	normalizedKey := domain.NormalizeEntityKey(entityKey)
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if len(idempotencyKey) > 128 {
		return domain.EntityRecord{}, false, ports.ErrInvalidIdempotencyKey
	}
	request := ports.IdempotencyRequest{}
	if idempotencyKey != "" {
		encoded, err := json.Marshal(data)
		if err != nil {
			return domain.EntityRecord{}, false, err
		}
		digest := sha256.Sum256(encoded)
		request = ports.IdempotencyRequest{
			Scope:       "entity.create:" + normalizedKey,
			Key:         idempotencyKey,
			RequestHash: hex.EncodeToString(digest[:]),
		}
		existing, found, err := service.repository.LookupEntityByIdempotency(ctx, request)
		if err != nil {
			return domain.EntityRecord{}, false, err
		}
		if found {
			return existing, true, nil
		}
	}
	definition, err := service.GetPublishedDefinition(ctx, entityKey)
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	if err := definition.ValidateData(data); err != nil {
		return domain.EntityRecord{}, false, err
	}
	candidate := domain.EntityRecord{
		EntityKey:           definition.EntityKey,
		DefinitionID:        definition.ID,
		DefinitionVersionID: definition.ID,
		DefinitionVersion:   definition.Version,
		SchemaVersion:       definition.MetamodelVersion,
		ManifestChecksum:    definition.Checksum,
		State:               definition.InitialState(),
		Data:                data,
	}
	if err := service.dispatch(ctx, "entity.create", "", candidate, *definition.Manifest); err != nil {
		return domain.EntityRecord{}, false, err
	}
	return service.repository.CreateEntity(ctx, definition, data, request)
}

func (service *Service) TransitionEntity(
	ctx context.Context,
	entityKey string,
	entityID string,
	transitionKey string,
) (domain.EntityRecord, error) {
	normalizedKey := domain.NormalizeEntityKey(entityKey)
	entity, err := service.repository.GetEntity(ctx, normalizedKey, entityID)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	definition, err := service.repository.GetDefinition(ctx, normalizedKey, entity.DefinitionVersion)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	definition, err = service.withExecutableManifest(ctx, definition)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	nextState, err := definition.Transition(entity.State, transitionKey)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	candidate := entity
	candidate.State = nextState
	if err := service.dispatch(ctx, "entity.transition", transitionKey, candidate, *definition.Manifest); err != nil {
		return domain.EntityRecord{}, err
	}
	return service.repository.TransitionEntity(
		ctx,
		entity,
		nextState,
		transitionKey,
		*definition.Manifest,
	)
}

func (service *Service) UpdateEntity(
	ctx context.Context,
	entityKey string,
	entityID string,
	data map[string]any,
	expectedUpdatedAt time.Time,
) (domain.EntityRecord, error) {
	normalizedKey := domain.NormalizeEntityKey(entityKey)
	entity, err := service.repository.GetEntity(ctx, normalizedKey, entityID)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	if expectedUpdatedAt.IsZero() || !entity.UpdatedAt.Equal(expectedUpdatedAt) {
		return domain.EntityRecord{}, ports.ErrVersionConflict
	}
	definition, err := service.repository.GetDefinition(
		ctx,
		normalizedKey,
		entity.DefinitionVersion,
	)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	definition, err = service.withExecutableManifest(ctx, definition)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	if err := definition.ValidateData(data); err != nil {
		return domain.EntityRecord{}, err
	}
	if len(domain.ChangedDataFields(entity.Data, data)) == 0 {
		return entity, nil
	}
	candidate := entity
	candidate.Data = data
	if err := service.dispatch(ctx, "entity.update", "", candidate, *definition.Manifest); err != nil {
		return domain.EntityRecord{}, err
	}
	return service.repository.UpdateEntity(
		ctx,
		entity,
		data,
		*definition.Manifest,
		ports.PrincipalFromContext(ctx),
	)
}

func (service *Service) TransitionEntityToState(
	ctx context.Context,
	entityKey string,
	entityID string,
	targetState string,
) (domain.EntityRecord, error) {
	normalizedKey := domain.NormalizeEntityKey(entityKey)
	entity, err := service.repository.GetEntity(ctx, normalizedKey, entityID)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	if entity.State == targetState {
		return entity, nil
	}
	definition, err := service.repository.GetDefinition(
		ctx,
		normalizedKey,
		entity.DefinitionVersion,
	)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	for _, transition := range definition.Specification.Lifecycle.Transitions {
		if transition.From == entity.State && transition.To == targetState {
			return service.TransitionEntity(ctx, normalizedKey, entityID, transition.Key)
		}
	}
	return domain.EntityRecord{}, fmt.Errorf(
		"%w: no transition moves entity from %q to %q",
		domain.ErrInvalidTransition,
		entity.State,
		targetState,
	)
}

func (service *Service) ListEntities(ctx context.Context, entityKey string) ([]domain.EntityRecord, error) {
	return service.repository.ListEntities(ctx, domain.NormalizeEntityKey(entityKey))
}

func (service *Service) GetEntity(
	ctx context.Context,
	entityKey string,
	entityID string,
) (domain.EntityRecord, error) {
	return service.repository.GetEntity(
		ctx,
		domain.NormalizeEntityKey(entityKey),
		strings.TrimSpace(entityID),
	)
}

func (service *Service) GetEntityManifest(
	ctx context.Context,
	entityKey string,
	entityID string,
) (domain.ExecutableDefinitionManifest, error) {
	entity, err := service.GetEntity(ctx, entityKey, entityID)
	if err != nil {
		return domain.ExecutableDefinitionManifest{}, err
	}
	return service.GetManifest(ctx, entity.EntityKey, entity.DefinitionVersion)
}

func (service *Service) ListEntityRelations(
	ctx context.Context,
	entityKey string,
	entityID string,
) ([]domain.EntityRelation, error) {
	entity, err := service.GetEntity(ctx, entityKey, entityID)
	if err != nil {
		return nil, err
	}
	return service.repository.ListEntityRelations(ctx, entity.ID)
}

func (service *Service) CreateEntityRelation(
	ctx context.Context,
	sourceEntityKey string,
	sourceEntityID string,
	relationKey string,
	targetEntityKey string,
	targetEntityID string,
) (domain.EntityRelation, bool, error) {
	source, err := service.GetEntity(ctx, sourceEntityKey, sourceEntityID)
	if err != nil {
		return domain.EntityRelation{}, false, err
	}
	definition, err := service.repository.GetDefinition(
		ctx,
		source.EntityKey,
		source.DefinitionVersion,
	)
	if err != nil {
		return domain.EntityRelation{}, false, err
	}
	definition, err = service.withExecutableManifest(ctx, definition)
	if err != nil {
		return domain.EntityRelation{}, false, err
	}
	var contract *domain.RelationDefinition
	for index := range definition.Manifest.Specification.Relations {
		candidate := &definition.Manifest.Specification.Relations[index]
		if candidate.Key == strings.TrimSpace(relationKey) {
			contract = candidate
			break
		}
	}
	if contract == nil {
		return domain.EntityRelation{}, false, fmt.Errorf(
			"%w: relation %q is not declared by %s definition v%d",
			domain.ErrInvalidRelation,
			relationKey,
			source.EntityKey,
			source.DefinitionVersion,
		)
	}
	normalizedTargetKey := domain.NormalizeEntityKey(targetEntityKey)
	if normalizedTargetKey != domain.NormalizeEntityKey(contract.TargetEntityKey) {
		return domain.EntityRelation{}, false, fmt.Errorf(
			"%w: relation %q targets %s, not %s",
			domain.ErrInvalidRelation,
			contract.Key,
			contract.TargetEntityKey,
			normalizedTargetKey,
		)
	}
	target, err := service.GetEntity(ctx, normalizedTargetKey, targetEntityID)
	if err != nil {
		return domain.EntityRelation{}, false, err
	}
	if source.ID == target.ID {
		return domain.EntityRelation{}, false, fmt.Errorf(
			"%w: an entity cannot relate to itself",
			domain.ErrInvalidRelation,
		)
	}
	if contract.Cardinality == "one" {
		existing, listErr := service.repository.ListEntityRelations(ctx, source.ID)
		if listErr != nil {
			return domain.EntityRelation{}, false, listErr
		}
		for _, relation := range existing {
			if relation.SourceEntityID == source.ID &&
				relation.RelationKey == contract.Key &&
				relation.TargetEntityID != target.ID {
				return domain.EntityRelation{}, false, fmt.Errorf(
					"%w: relation %q only accepts one target",
					domain.ErrInvalidRelation,
					contract.Key,
				)
			}
		}
	}
	inverseLabel := strings.TrimSpace(contract.InverseLabel)
	if inverseLabel == "" {
		inverseLabel = contract.Label
	}
	relation := domain.EntityRelation{
		ContractVersion:           domain.EntityRelationContractVersion,
		RelationKey:               contract.Key,
		RelationLabel:             contract.Label,
		InverseKey:                contract.InverseKey,
		InverseLabel:              inverseLabel,
		SourceEntityID:            source.ID,
		SourceEntityKey:           source.EntityKey,
		SourceHumanID:             source.HumanID,
		SourceDefinitionVersionID: source.DefinitionVersionID,
		TargetEntityID:            target.ID,
		TargetEntityKey:           target.EntityKey,
		TargetHumanID:             target.HumanID,
		TargetDefinitionVersionID: target.DefinitionVersionID,
		CreatedBy:                 ports.PrincipalFromContext(ctx).ID,
	}
	return service.repository.CreateEntityRelation(ctx, relation)
}

func (service *Service) DeleteEntityRelation(
	ctx context.Context,
	entityKey string,
	entityID string,
	relationID string,
) error {
	entity, err := service.GetEntity(ctx, entityKey, entityID)
	if err != nil {
		return err
	}
	return service.repository.DeleteEntityRelation(ctx, strings.TrimSpace(relationID), entity.ID)
}

func (service *Service) withExecutableManifest(
	ctx context.Context,
	definition domain.Definition,
) (domain.Definition, error) {
	if definition.Manifest != nil && definition.Manifest.Checksum != "" {
		definition.Checksum = definition.Manifest.Checksum
		if definition.MetamodelVersion == "" {
			definition.MetamodelVersion = definition.Manifest.MetamodelVersion
		}
		return definition, nil
	}
	manifest, issues := service.compile(ctx, definition)
	if len(issues) > 0 {
		return domain.Definition{}, fmt.Errorf(
			"%w: published definition is not executable: %s",
			domain.ErrInvalidDefinition,
			issues[0].Message,
		)
	}
	definition.Manifest = &manifest
	definition.Checksum = manifest.Checksum
	definition.MetamodelVersion = manifest.MetamodelVersion
	return definition, nil
}

func (service *Service) compile(
	ctx context.Context,
	definition domain.Definition,
) (domain.ExecutableDefinitionManifest, []domain.ValidationIssue) {
	if definition.MetamodelVersion == "" {
		definition.MetamodelVersion = domain.CurrentMetamodelVersion
	}
	if err := definition.Validate(); err != nil {
		return domain.ExecutableDefinitionManifest{}, []domain.ValidationIssue{{
			Path:     "definition",
			Code:     "invalid_definition",
			Message:  err.Error(),
			Severity: "error",
		}}
	}

	resources := make([]domain.ResourceReference, 0, len(definition.Specification.Bindings))
	issues := make([]domain.ValidationIssue, 0)
	for index, binding := range definition.Specification.Bindings {
		reference := binding.Reference()
		resolved, err := service.resolveResource(ctx, reference)
		if err != nil {
			issues = append(issues, domain.ValidationIssue{
				Path:     fmt.Sprintf("specification.bindings[%d]", index),
				Code:     "unresolved_resource",
				Message:  err.Error(),
				Severity: "error",
			})
			continue
		}
		resources = append(resources, resolved)
	}
	if len(issues) > 0 {
		return domain.ExecutableDefinitionManifest{}, issues
	}
	manifest, err := domain.CompileManifest(definition, resources, service.now())
	if err != nil {
		return domain.ExecutableDefinitionManifest{}, []domain.ValidationIssue{{
			Path:     "manifest",
			Code:     "manifest_compilation_failed",
			Message:  err.Error(),
			Severity: "error",
		}}
	}
	return manifest, nil
}

func (service *Service) resolveResource(
	ctx context.Context,
	reference domain.ResourceReference,
) (domain.ResourceReference, error) {
	if service.gateway != nil {
		return service.gateway.ResolveResource(ctx, reference)
	}
	if reference.ResourceVersion == "" || reference.ContractVersion == "" {
		return domain.ResourceReference{}, fmt.Errorf(
			"resource %s:%s:%s must pin resourceVersion and contractVersion",
			reference.Module,
			reference.ResourceType,
			reference.ResourceID,
		)
	}
	return reference, nil
}

func (service *Service) dispatch(
	ctx context.Context,
	operation string,
	transitionKey string,
	entity domain.EntityRecord,
	manifest domain.ExecutableDefinitionManifest,
) error {
	if service.gateway == nil {
		return nil
	}
	for _, resource := range manifest.Resources {
		err := service.gateway.Dispatch(ctx, ports.CapabilityCommand{
			Module:        resource.Module,
			Operation:     operation,
			Resource:      resource,
			Entity:        entity,
			Definition:    manifest,
			TransitionKey: transitionKey,
			Principal:     ports.PrincipalFromContext(ctx),
		})
		if err != nil && resource.Required {
			return fmt.Errorf(
				"%w: required module %s rejected %s: %v",
				ports.ErrCapabilityDenied,
				resource.Module,
				operation,
				err,
			)
		}
	}
	return nil
}
