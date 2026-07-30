package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type Repository struct {
	mutex       sync.RWMutex
	definitions []domain.Definition
	entities    []domain.EntityRecord
	relations   []domain.EntityRelation
	outbox      []storedOutboxMessage
	sequence    int
	idempotency map[string]storedIdempotency
}

type storedIdempotency struct {
	requestHash string
	entityID    string
}

type storedOutboxMessage struct {
	message     domain.OutboxMessage
	lockID      string
	lockedUntil time.Time
	publishedAt *time.Time
	lastError   string
}

func NewRepository(definitions ...domain.Definition) *Repository {
	repository := &Repository{idempotency: make(map[string]storedIdempotency)}
	for _, definition := range definitions {
		repository.definitions = append(repository.definitions, cloneDefinition(definition))
	}
	return repository
}

func (repository *Repository) ListDefinitions(_ context.Context, publishedOnly bool) ([]domain.Definition, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	result := make([]domain.Definition, 0, len(repository.definitions))
	for _, definition := range repository.definitions {
		if !publishedOnly || definition.Status == domain.StatusPublished {
			result = append(result, cloneDefinition(definition))
		}
	}
	return result, nil
}

func (repository *Repository) GetPublishedDefinition(_ context.Context, entityKey string) (domain.Definition, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	for _, definition := range repository.definitions {
		if definition.EntityKey == entityKey && definition.Status == domain.StatusPublished {
			return cloneDefinition(definition), nil
		}
	}
	return domain.Definition{}, ports.ErrNotFound
}

func (repository *Repository) GetDefinition(
	_ context.Context,
	entityKey string,
	version int,
) (domain.Definition, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	for _, definition := range repository.definitions {
		if definition.EntityKey == entityKey && definition.Version == version {
			return cloneDefinition(definition), nil
		}
	}
	return domain.Definition{}, ports.ErrNotFound
}

func (repository *Repository) CreateDraft(_ context.Context, definition domain.Definition) (domain.Definition, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for index := range repository.definitions {
		current := &repository.definitions[index]
		if current.EntityKey != definition.EntityKey || current.Status != domain.StatusDraft {
			continue
		}
		current.Name = definition.Name
		current.MetamodelVersion = definition.MetamodelVersion
		current.Specification = cloneDefinition(definition).Specification
		current.Manifest = nil
		current.Checksum = ""
		current.PublishedAt = nil
		return cloneDefinition(*current), nil
	}
	maxVersion := 0
	for _, current := range repository.definitions {
		if current.EntityKey == definition.EntityKey && current.Version > maxVersion {
			maxVersion = current.Version
		}
	}
	definition.ID = fmt.Sprintf("definition-%d", len(repository.definitions)+1)
	definition.Version = maxVersion + 1
	definition.Status = domain.StatusDraft
	definition.CreatedAt = time.Now().UTC()
	stored := cloneDefinition(definition)
	repository.definitions = append(repository.definitions, stored)
	return cloneDefinition(stored), nil
}

func (repository *Repository) Publish(
	_ context.Context,
	requested domain.Definition,
	manifest domain.ExecutableDefinitionManifest,
) (domain.Definition, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	index := -1
	for position := range repository.definitions {
		definition := &repository.definitions[position]
		if definition.ID == requested.ID &&
			definition.EntityKey == requested.EntityKey &&
			definition.Version == requested.Version &&
			definition.Status == domain.StatusDraft {
			index = position
		}
	}
	if index < 0 {
		return domain.Definition{}, ports.ErrNotFound
	}
	for position := range repository.definitions {
		definition := &repository.definitions[position]
		if definition.EntityKey == requested.EntityKey && definition.Status == domain.StatusPublished {
			definition.Status = domain.StatusDeprecated
		}
	}
	now := time.Now().UTC()
	repository.definitions[index].Status = domain.StatusPublished
	repository.definitions[index].PublishedAt = &now
	repository.definitions[index].Manifest = &manifest
	repository.definitions[index].Checksum = manifest.Checksum
	repository.definitions[index].MetamodelVersion = manifest.MetamodelVersion
	return cloneDefinition(repository.definitions[index]), nil
}

func (repository *Repository) CreateEntity(
	_ context.Context,
	definition domain.Definition,
	data map[string]any,
	idempotency ports.IdempotencyRequest,
) (domain.EntityRecord, bool, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	idempotencyMapKey := idempotency.Scope + ":" + idempotency.Key
	if idempotency.Key != "" {
		if stored, exists := repository.idempotency[idempotencyMapKey]; exists {
			if stored.requestHash != idempotency.RequestHash {
				return domain.EntityRecord{}, false, ports.ErrIdempotencyConflict
			}
			for _, entity := range repository.entities {
				if entity.ID == stored.entityID {
					return cloneEntity(entity), true, nil
				}
			}
			return domain.EntityRecord{}, false, ports.ErrNotFound
		}
	}
	repository.sequence++
	now := time.Now().UTC()
	entity := domain.EntityRecord{
		ID:                  fmt.Sprintf("entity-%d", repository.sequence),
		HumanID:             fmt.Sprintf("%s-%06d", definition.Specification.Identity.Prefix, repository.sequence),
		EntityKey:           definition.EntityKey,
		DefinitionID:        definition.ID,
		DefinitionVersionID: definition.ID,
		DefinitionVersion:   definition.Version,
		SchemaVersion:       definition.MetamodelVersion,
		ManifestChecksum:    definition.Checksum,
		State:               definition.InitialState(),
		Data:                cloneData(data),
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	resources := []domain.ResourceReference(nil)
	if definition.Manifest != nil {
		resources = definition.Manifest.Resources
	}
	event, err := domain.NewEntityCreatedEvent(entity, resources)
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	repository.entities = append(repository.entities, entity)
	repository.outbox = append(repository.outbox, storedOutboxMessage{
		message: domain.OutboxMessage{
			ID:          event.EventID,
			Event:       event,
			AvailableAt: now,
			CreatedAt:   now,
		},
	})
	if idempotency.Key != "" {
		repository.idempotency[idempotencyMapKey] = storedIdempotency{
			requestHash: idempotency.RequestHash,
			entityID:    entity.ID,
		}
	}
	return cloneEntity(entity), false, nil
}

func (repository *Repository) LookupEntityByIdempotency(
	_ context.Context,
	idempotency ports.IdempotencyRequest,
) (domain.EntityRecord, bool, error) {
	if idempotency.Key == "" {
		return domain.EntityRecord{}, false, nil
	}
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	stored, exists := repository.idempotency[idempotency.Scope+":"+idempotency.Key]
	if !exists {
		return domain.EntityRecord{}, false, nil
	}
	if stored.requestHash != idempotency.RequestHash {
		return domain.EntityRecord{}, false, ports.ErrIdempotencyConflict
	}
	for _, entity := range repository.entities {
		if entity.ID == stored.entityID {
			return cloneEntity(entity), true, nil
		}
	}
	return domain.EntityRecord{}, false, ports.ErrNotFound
}

func (repository *Repository) GetEntity(
	_ context.Context,
	entityKey string,
	entityID string,
) (domain.EntityRecord, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	for _, entity := range repository.entities {
		if entity.EntityKey == entityKey && (entity.ID == entityID || entity.HumanID == entityID) {
			return cloneEntity(entity), nil
		}
	}
	return domain.EntityRecord{}, ports.ErrNotFound
}

func (repository *Repository) UpdateEntity(
	_ context.Context,
	current domain.EntityRecord,
	data map[string]any,
	manifest domain.ExecutableDefinitionManifest,
	principal ports.Principal,
) (domain.EntityRecord, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for index := range repository.entities {
		entity := &repository.entities[index]
		if entity.ID != current.ID || !entity.UpdatedAt.Equal(current.UpdatedAt) {
			continue
		}
		updated := cloneEntity(*entity)
		updated.Data = cloneData(data)
		updated.UpdatedAt = time.Now().UTC()
		if !updated.UpdatedAt.After(entity.UpdatedAt) {
			updated.UpdatedAt = entity.UpdatedAt.Add(time.Nanosecond)
		}
		event, err := domain.NewEntityUpdatedEvent(
			*entity,
			updated,
			manifest.Resources,
			principal.ID,
		)
		if err != nil {
			return domain.EntityRecord{}, err
		}
		*entity = updated
		repository.outbox = append(repository.outbox, storedOutboxMessage{
			message: domain.OutboxMessage{
				ID:          event.EventID,
				Event:       event,
				AvailableAt: updated.UpdatedAt,
				CreatedAt:   updated.UpdatedAt,
			},
		})
		return cloneEntity(updated), nil
	}
	return domain.EntityRecord{}, ports.ErrVersionConflict
}

func (repository *Repository) TransitionEntity(
	_ context.Context,
	current domain.EntityRecord,
	nextState string,
	transitionKey string,
	manifest domain.ExecutableDefinitionManifest,
) (domain.EntityRecord, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for index := range repository.entities {
		entity := &repository.entities[index]
		if entity.ID != current.ID || entity.State != current.State {
			continue
		}
		updated := cloneEntity(*entity)
		updated.State = nextState
		updated.UpdatedAt = time.Now().UTC()
		event, err := domain.NewEntityTransitionedEvent(
			*entity,
			updated,
			transitionKey,
			manifest.Resources,
		)
		if err != nil {
			return domain.EntityRecord{}, err
		}
		*entity = updated
		repository.outbox = append(repository.outbox, storedOutboxMessage{
			message: domain.OutboxMessage{
				ID:          event.EventID,
				Event:       event,
				AvailableAt: updated.UpdatedAt,
				CreatedAt:   updated.UpdatedAt,
			},
		})
		return cloneEntity(updated), nil
	}
	return domain.EntityRecord{}, ports.ErrVersionConflict
}

func (repository *Repository) ClaimOutbox(
	_ context.Context,
	lockID string,
	limit int,
	now time.Time,
	lease time.Duration,
) ([]domain.OutboxMessage, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	messages := make([]domain.OutboxMessage, 0, limit)
	for index := range repository.outbox {
		stored := &repository.outbox[index]
		if len(messages) >= limit {
			break
		}
		if stored.publishedAt != nil ||
			stored.message.AvailableAt.After(now) ||
			stored.lockedUntil.After(now) {
			continue
		}
		stored.lockID = lockID
		stored.lockedUntil = now.Add(lease)
		stored.message.Attempts++
		messages = append(messages, stored.message)
	}
	return messages, nil
}

func (repository *Repository) MarkOutboxPublished(
	_ context.Context,
	messageID string,
	lockID string,
	publishedAt time.Time,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for index := range repository.outbox {
		stored := &repository.outbox[index]
		if stored.message.ID == messageID && stored.lockID == lockID {
			when := publishedAt.UTC()
			stored.publishedAt = &when
			stored.lockID = ""
			stored.lockedUntil = time.Time{}
			return nil
		}
	}
	return ports.ErrVersionConflict
}

func (repository *Repository) MarkOutboxFailed(
	_ context.Context,
	messageID string,
	lockID string,
	lastError string,
	nextAttempt time.Time,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for index := range repository.outbox {
		stored := &repository.outbox[index]
		if stored.message.ID == messageID && stored.lockID == lockID {
			stored.lastError = lastError
			stored.message.AvailableAt = nextAttempt.UTC()
			stored.lockID = ""
			stored.lockedUntil = time.Time{}
			return nil
		}
	}
	return ports.ErrVersionConflict
}

func (repository *Repository) OutboxStatus(
	_ context.Context,
	now time.Time,
) (domain.OutboxStatus, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	status := domain.OutboxStatus{Healthy: true, CheckedAt: now.UTC()}
	for _, stored := range repository.outbox {
		if stored.publishedAt != nil {
			if !stored.publishedAt.Before(now.Add(-time.Hour)) {
				status.PublishedLastHour++
			}
			continue
		}
		status.Pending++
		if stored.lastError != "" && stored.message.Attempts > 0 {
			status.Retrying++
		}
		if stored.message.Attempts > status.MaxAttempts {
			status.MaxAttempts = stored.message.Attempts
		}
		createdAt := stored.message.CreatedAt
		if status.OldestPendingAt == nil || createdAt.Before(*status.OldestPendingAt) {
			status.OldestPendingAt = &createdAt
		}
	}
	status.Healthy = status.Retrying == 0 && status.MaxAttempts < 5
	return status, nil
}

func (repository *Repository) ListEntities(_ context.Context, entityKey string) ([]domain.EntityRecord, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	result := make([]domain.EntityRecord, 0)
	for _, entity := range repository.entities {
		if entity.EntityKey == entityKey {
			result = append(result, cloneEntity(entity))
		}
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left].CreatedAt.After(result[right].CreatedAt)
	})
	return result, nil
}

func (repository *Repository) ListEntityRelations(
	_ context.Context,
	entityID string,
) ([]domain.EntityRelation, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	result := make([]domain.EntityRelation, 0)
	for _, relation := range repository.relations {
		if relation.SourceEntityID == entityID || relation.TargetEntityID == entityID {
			result = append(result, relation)
		}
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left].CreatedAt.Before(result[right].CreatedAt)
	})
	return result, nil
}

func (repository *Repository) CreateEntityRelation(
	_ context.Context,
	relation domain.EntityRelation,
) (domain.EntityRelation, bool, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for _, stored := range repository.relations {
		if stored.SourceEntityID == relation.SourceEntityID &&
			stored.RelationKey == relation.RelationKey &&
			stored.TargetEntityID == relation.TargetEntityID {
			return stored, true, nil
		}
	}
	relation.ID = fmt.Sprintf("relation-%d", len(repository.relations)+1)
	relation.CreatedAt = time.Now().UTC()
	repository.relations = append(repository.relations, relation)
	return relation, false, nil
}

func (repository *Repository) DeleteEntityRelation(
	_ context.Context,
	relationID string,
	entityID string,
) error {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for index, relation := range repository.relations {
		if relation.ID == relationID &&
			(relation.SourceEntityID == entityID || relation.TargetEntityID == entityID) {
			repository.relations = append(repository.relations[:index], repository.relations[index+1:]...)
			return nil
		}
	}
	return ports.ErrNotFound
}

func cloneDefinition(definition domain.Definition) domain.Definition {
	encoded, _ := json.Marshal(definition)
	var cloned domain.Definition
	_ = json.Unmarshal(encoded, &cloned)
	return cloned
}

func cloneEntity(entity domain.EntityRecord) domain.EntityRecord {
	encoded, _ := json.Marshal(entity)
	var cloned domain.EntityRecord
	_ = json.Unmarshal(encoded, &cloned)
	return cloned
}

func cloneData(data map[string]any) map[string]any {
	encoded, _ := json.Marshal(data)
	var cloned map[string]any
	_ = json.Unmarshal(encoded, &cloned)
	return cloned
}
