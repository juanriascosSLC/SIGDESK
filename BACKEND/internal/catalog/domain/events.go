package domain

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"time"
)

const (
	EventEntityCreatedV1      = "catalog.entity.created.v1"
	EventEntityUpdatedV1      = "catalog.entity.updated.v1"
	EventEntityTransitionedV1 = "catalog.entity.transitioned.v1"
)

type EventEnvelope struct {
	EventID       string          `json:"eventId"`
	EventType     string          `json:"eventType"`
	OccurredAt    time.Time       `json:"occurredAt"`
	AggregateID   string          `json:"aggregateId"`
	EntityKey     string          `json:"entityKey"`
	SchemaVersion string          `json:"schemaVersion"`
	Payload       json.RawMessage `json:"payload"`
}

type EntityCreatedPayload struct {
	EntityID            string              `json:"entityId"`
	HumanID             string              `json:"humanId"`
	EntityKey           string              `json:"entityKey"`
	DefinitionVersionID string              `json:"definitionVersionId"`
	DefinitionVersion   int                 `json:"definitionVersion"`
	ManifestChecksum    string              `json:"manifestChecksum"`
	State               string              `json:"state"`
	Data                map[string]any      `json:"data"`
	Resources           []ResourceReference `json:"resources"`
}

type EntityTransitionedPayload struct {
	EntityID            string              `json:"entityId"`
	HumanID             string              `json:"humanId"`
	EntityKey           string              `json:"entityKey"`
	DefinitionVersionID string              `json:"definitionVersionId"`
	DefinitionVersion   int                 `json:"definitionVersion"`
	ManifestChecksum    string              `json:"manifestChecksum"`
	TransitionKey       string              `json:"transitionKey"`
	PreviousState       string              `json:"previousState"`
	CurrentState        string              `json:"currentState"`
	Data                map[string]any      `json:"data"`
	Resources           []ResourceReference `json:"resources"`
}

type EntityUpdatedPayload struct {
	EntityID            string              `json:"entityId"`
	HumanID             string              `json:"humanId"`
	EntityKey           string              `json:"entityKey"`
	DefinitionVersionID string              `json:"definitionVersionId"`
	DefinitionVersion   int                 `json:"definitionVersion"`
	ManifestChecksum    string              `json:"manifestChecksum"`
	State               string              `json:"state"`
	Data                map[string]any      `json:"data"`
	ChangedFields       []string            `json:"changedFields"`
	ActorID             string              `json:"actorId,omitempty"`
	Resources           []ResourceReference `json:"resources"`
}

type OutboxMessage struct {
	ID          string        `json:"id"`
	Event       EventEnvelope `json:"event"`
	Attempts    int           `json:"attempts"`
	AvailableAt time.Time     `json:"availableAt"`
	CreatedAt   time.Time     `json:"createdAt"`
}

func NewEntityCreatedEvent(
	entity EntityRecord,
	resources []ResourceReference,
) (EventEnvelope, error) {
	payload := EntityCreatedPayload{
		EntityID:            entity.ID,
		HumanID:             entity.HumanID,
		EntityKey:           entity.EntityKey,
		DefinitionVersionID: entity.DefinitionVersionID,
		DefinitionVersion:   entity.DefinitionVersion,
		ManifestChecksum:    entity.ManifestChecksum,
		State:               entity.State,
		Data:                entity.Data,
		Resources:           resources,
	}
	return newEvent(EventEntityCreatedV1, entity, payload)
}

func NewEntityTransitionedEvent(
	previous EntityRecord,
	current EntityRecord,
	transitionKey string,
	resources []ResourceReference,
) (EventEnvelope, error) {
	payload := EntityTransitionedPayload{
		EntityID:            current.ID,
		HumanID:             current.HumanID,
		EntityKey:           current.EntityKey,
		DefinitionVersionID: current.DefinitionVersionID,
		DefinitionVersion:   current.DefinitionVersion,
		ManifestChecksum:    current.ManifestChecksum,
		TransitionKey:       transitionKey,
		PreviousState:       previous.State,
		CurrentState:        current.State,
		Data:                current.Data,
		Resources:           resources,
	}
	return newEvent(EventEntityTransitionedV1, current, payload)
}

func NewEntityUpdatedEvent(
	previous EntityRecord,
	current EntityRecord,
	resources []ResourceReference,
	actorID string,
) (EventEnvelope, error) {
	payload := EntityUpdatedPayload{
		EntityID:            current.ID,
		HumanID:             current.HumanID,
		EntityKey:           current.EntityKey,
		DefinitionVersionID: current.DefinitionVersionID,
		DefinitionVersion:   current.DefinitionVersion,
		ManifestChecksum:    current.ManifestChecksum,
		State:               current.State,
		Data:                current.Data,
		ChangedFields:       ChangedDataFields(previous.Data, current.Data),
		ActorID:             actorID,
		Resources:           resources,
	}
	return newEvent(EventEntityUpdatedV1, current, payload)
}

func ChangedDataFields(previous map[string]any, current map[string]any) []string {
	keys := make(map[string]bool, len(previous)+len(current))
	for key := range previous {
		keys[key] = true
	}
	for key := range current {
		keys[key] = true
	}
	changed := make([]string, 0)
	for key := range keys {
		if !reflect.DeepEqual(previous[key], current[key]) {
			changed = append(changed, key)
		}
	}
	sort.Strings(changed)
	return changed
}

func newEvent(eventType string, entity EntityRecord, payload any) (EventEnvelope, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return EventEnvelope{}, fmt.Errorf("encode %s payload: %w", eventType, err)
	}
	eventID, err := newEventID()
	if err != nil {
		return EventEnvelope{}, err
	}
	occurredAt := entity.UpdatedAt
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}
	return EventEnvelope{
		EventID:       eventID,
		EventType:     eventType,
		OccurredAt:    occurredAt.UTC(),
		AggregateID:   entity.ID,
		EntityKey:     entity.EntityKey,
		SchemaVersion: "1",
		Payload:       encoded,
	}, nil
}

func newEventID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("generate event id: %w", err)
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(bytes[:])
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" +
		encoded[16:20] + "-" + encoded[20:32], nil
}
