package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
)

type LayoutStatus string

const (
	LayoutStatusDraft      LayoutStatus = "draft"
	LayoutStatusPublished  LayoutStatus = "published"
	LayoutStatusDeprecated LayoutStatus = "deprecated"
	LayoutStatusArchived   LayoutStatus = "archived"
)

var (
	ErrLayoutNotFound     = errors.New("catalog layout version not found")
	ErrDraftNotFound      = errors.New("catalog layout draft not found")
	ErrDraftAlreadyExists = errors.New("catalog layout draft already exists")
	ErrLayoutIncompatible = errors.New("catalog layout is incompatible with target definition")
)

type CatalogLayoutVersion struct {
	ID            string                 `json:"id"`
	EntityKey     string                 `json:"entityKey"`
	Version       int                    `json:"version"`
	Status        LayoutStatus           `json:"status"`
	Document      map[string]any         `json:"document"`
	Compatibility *CompatibilityFingerprint `json:"compatibility,omitempty"`
	Checksum      string                 `json:"checksum,omitempty"`
	IsActive      bool                   `json:"isActive"`
	CreatedAt     time.Time              `json:"createdAt"`
	PublishedAt   *time.Time             `json:"publishedAt,omitempty"`
}

type CompatibilityPlacement struct {
	PlacementID          string   `json:"placementId"`
	Kind                 string   `json:"kind"`
	Source               string   `json:"source,omitempty"`
	FieldID              string   `json:"fieldId,omitempty"`
	FieldType            string   `json:"fieldType,omitempty"`
	WidgetKey            string   `json:"widgetKey,omitempty"`
	WidgetContractVersion string  `json:"widgetContractVersion,omitempty"`
	Region               string   `json:"region"`
	AudienceKey          string   `json:"audienceKey"`
	RequiredPermissions  []string `json:"requiredPermissions,omitempty"`
	AllowMultiple        bool     `json:"allowMultiple"`
}

type CompatibilityFingerprint struct {
	Placements      []CompatibilityPlacement `json:"placements"`
	MandatoryWidgets []string                 `json:"mandatoryWidgets"`
}

type ResolvedDefinitionResponse struct {
	EntityID            string            `json:"entityId"`
	HumanID             string            `json:"humanId"`
	EntityKey           string            `json:"entityKey"`
	DefinitionVersionID string            `json:"definitionVersionId"`
	SchemaVersion       string            `json:"schemaVersion"`
	WorkflowVersion     string            `json:"workflowVersion"`
	MetamodelVersion    string            `json:"metamodelVersion"`
	LayoutVersionID     *string           `json:"layoutVersionId"`
	LayoutVersion       *int              `json:"layoutVersion"`
	LayoutResolution    string            `json:"layoutResolution"`
	Fields              []FieldDefinition `json:"fields"`
	Lifecycle           LifecycleDefinition `json:"lifecycle"`
	Layouts             map[string]any    `json:"layouts"`
}

// ComputeCanonicalChecksum returns a deterministic SHA-256 string for the document and compatibility.
func ComputeCanonicalChecksum(document map[string]any, compat *CompatibilityFingerprint) (string, error) {
	docJSON, err := CanonicalJSON(document)
	if err != nil {
		return "", fmt.Errorf("canonicalizing document: %w", err)
	}
	compatJSON, err := CanonicalJSON(compat)
	if err != nil {
		return "", fmt.Errorf("canonicalizing compatibility: %w", err)
	}
	raw := string(docJSON) + ":" + string(compatJSON)
	hash := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(hash[:]), nil
}

// CanonicalJSON recursively sorts JSON keys for deterministic representation.
func CanonicalJSON(v any) ([]byte, error) {
	var canonicalize func(val any) any
	canonicalize = func(val any) any {
		switch elem := val.(type) {
		case map[string]any:
			keys := make([]string, 0, len(elem))
			for k := range elem {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			sortedMap := make(map[string]any, len(elem))
			for _, k := range keys {
				sortedMap[k] = canonicalize(elem[k])
			}
			return sortedMap
		case []any:
			arr := make([]any, len(elem))
			for i, item := range elem {
				arr[i] = canonicalize(item)
			}
			return arr
		default:
			return elem
		}
	}
	// Roundtrip through json marshal/unmarshal to normalize numbers/types
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var unmarshaled any
	if err := json.Unmarshal(b, &unmarshaled); err != nil {
		return nil, err
	}
	c := canonicalize(unmarshaled)
	return json.Marshal(c)
}
