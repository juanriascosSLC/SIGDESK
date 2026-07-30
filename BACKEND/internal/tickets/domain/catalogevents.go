package domain

import (
	"strings"
	"time"
)

// Event type identifiers published by the catalog's generic runtime.
// Tickets is one subscriber among possibly several; it only acts on
// entityKey == "INC" and ignores everything else.
const (
	CatalogEventEntityCreated      = "catalog.entity.created.v1"
	CatalogEventEntityUpdated      = "catalog.entity.updated.v1"
	CatalogEventEntityTransitioned = "catalog.entity.transitioned.v1"
)

// CatalogEntityCreatedEvent and CatalogEntityTransitionedEvent mirror the
// catalog runtime's post-persistence events. Tickets trusts entityKey,
// state/currentState and data exactly as reported: it does not re-validate
// fields, lifecycle states or transitions, because that authority belongs
// to the definition's executable manifest, not to this projection.
//
// Delivery is performed through Catalog's transactional outbox. The legacy
// POST /tickets compatibility adapter also uses this contract for an
// immediate read-your-write projection.
type CatalogEntityCreatedEvent struct {
	EventID             string
	OccurredAt          time.Time
	EntityID            string
	HumanID             string
	EntityKey           string
	DefinitionVersionID string
	DefinitionVersion   int
	ManifestChecksum    string
	State               string
	Data                map[string]any
	Replayed            bool
}

type CatalogEntityTransitionedEvent struct {
	EventID             string
	OccurredAt          time.Time
	EntityID            string
	HumanID             string
	EntityKey           string
	DefinitionVersionID string
	DefinitionVersion   int
	ManifestChecksum    string
	TransitionKey       string
	PreviousState       string
	CurrentState        string
	Data                map[string]any
}

type CatalogEntityUpdatedEvent struct {
	EventID             string
	OccurredAt          time.Time
	EntityID            string
	HumanID             string
	EntityKey           string
	DefinitionVersionID string
	DefinitionVersion   int
	ManifestChecksum    string
	State               string
	Data                map[string]any
	ChangedFields       []string
	ActorID             string
}

// ProjectedTicket is what Tickets derives from a created-entity event.
// Its HumanID and status come from the catalog entity verbatim rather than
// from Tickets' historical sequence/state machine.
type ProjectedTicket struct {
	EntityID    string
	HumanID     string
	State       string
	Title       string
	Description string
	Category    string
	Priority    string
	AssetID     *string
	Site        *string
}

// StringField reads a trimmed string field out of a catalog entity's data
// payload, tolerating absent or non-string values.
func StringField(data map[string]any, key string) string {
	value, ok := data[key]
	if !ok {
		return ""
	}
	text, _ := value.(string)
	return strings.TrimSpace(text)
}
