package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

type DefinitionStatus string

const (
	StatusDraft      DefinitionStatus = "draft"
	StatusValidating DefinitionStatus = "validating"
	StatusPublished  DefinitionStatus = "published"
	StatusDeprecated DefinitionStatus = "deprecated"
	StatusRetired    DefinitionStatus = "retired"
	// StatusArchived is kept as a read-compatible alias for installations
	// created before the definition lifecycle was formalized.
	StatusArchived DefinitionStatus = "archived"
)

var (
	ErrInvalidDefinition = errors.New("invalid catalog definition")
	ErrInvalidEntityData = errors.New("invalid entity data")
	ErrInvalidTransition = errors.New("invalid entity transition")
	ErrInvalidRelation   = errors.New("invalid entity relation")
)

const (
	LegacyMetamodelVersion      = "1.0"
	ConditionalMetamodelVersion = "1.1"
	LayoutMetamodelVersion      = "1.2"
	RelationsMetamodelVersion   = "1.3"
	FormLayoutsMetamodelVersion = "1.4"
	CurrentMetamodelVersion     = "1.5"
)

// metamodelCapabilities enumerates which optional feature groups a given
// metamodelVersion may use. Feature gates consult this table instead of
// comparing against CurrentMetamodelVersion directly, so bumping the current
// version never invalidates older definitions that already validated fine.
type metamodelCapabilities struct {
	ConditionalFields bool
	DetailLayout      bool
	Relations         bool
	Layouts           bool
	PageLayout        bool
}

var supportedMetamodels = map[string]metamodelCapabilities{
	LegacyMetamodelVersion:      {},
	ConditionalMetamodelVersion: {ConditionalFields: true},
	LayoutMetamodelVersion:      {ConditionalFields: true, DetailLayout: true},
	RelationsMetamodelVersion:   {ConditionalFields: true, DetailLayout: true, Relations: true},
	FormLayoutsMetamodelVersion: {ConditionalFields: true, DetailLayout: true, Relations: true, Layouts: true},
	CurrentMetamodelVersion:     {ConditionalFields: true, DetailLayout: true, Relations: true, Layouts: true, PageLayout: true},
}

var keyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{1,31}$`)
var fieldKeyPattern = regexp.MustCompile(`^[a-z][a-zA-Z0-9_]{0,63}$`)

var allowedTicketFields = map[string]bool{
	"humanId": true, "requester": true, "assignee": true,
	"createdAt": true, "status": true, "mergedCount": true,
}

var allowedAudienceKeys = map[string]bool{
	"requester": true, "agent": true, "supervisor": true,
}

var allowedWidgetKeys = map[string]bool{
	"sla": true, "attachments": true, "activity": true,
}

var allowedPageContentKinds = map[string]bool{
	"section": true, "text": true, "divider": true, "spacer": true,
}

// pageWidgetRule is the backend half of the widget catalog (see
// TicketWidgetRegistry.tsx for the frontend half with components/icons). It
// only needs enough to validate a published page layout: where a widget may
// live, whether it can repeat, and whether it is a required, non-removable
// part of the page.
type pageWidgetRule struct {
	AllowedRegions []string
	AllowMultiple  bool
	RequiredIn     string // "" if not required
}

var pageWidgetRules = map[string]pageWidgetRule{
	"ticketHeader":       {AllowedRegions: []string{"header"}, RequiredIn: "header"},
	"ticketActions":      {AllowedRegions: []string{"actions"}, RequiredIn: "actions"},
	"sla":                {AllowedRegions: []string{"main", "sidebar", "footer"}},
	"attachments":        {AllowedRegions: []string{"main", "sidebar", "footer"}},
	"activity":           {AllowedRegions: []string{"main", "sidebar", "footer"}},
	"mergedTickets":      {AllowedRegions: []string{"main", "sidebar", "footer"}},
	"itsmRelations":      {AllowedRegions: []string{"main", "sidebar", "footer"}},
	"assetDetails":       {AllowedRegions: []string{"main", "sidebar", "footer"}},
	"description":        {AllowedRegions: []string{"main", "footer"}},
	"suggestedSolutions": {AllowedRegions: []string{"main", "sidebar", "footer"}},
	"requesterDetails":   {AllowedRegions: []string{"main", "sidebar"}},
	"statusHistory":      {AllowedRegions: []string{"main", "sidebar", "footer"}},
}

type Definition struct {
	ID               string                        `json:"id"`
	EntityKey        string                        `json:"entityKey"`
	Name             string                        `json:"name"`
	Version          int                           `json:"version"`
	MetamodelVersion string                        `json:"metamodelVersion"`
	Status           DefinitionStatus              `json:"status"`
	Specification    Specification                 `json:"specification"`
	Manifest         *ExecutableDefinitionManifest `json:"manifest,omitempty"`
	Checksum         string                        `json:"checksum,omitempty"`
	CreatedAt        time.Time                     `json:"createdAt"`
	PublishedAt      *time.Time                    `json:"publishedAt,omitempty"`
}

type Specification struct {
	Description  string                    `json:"description"`
	Identity     IdentityDefinition        `json:"identity"`
	Fields       []FieldDefinition         `json:"fields"`
	Lifecycle    LifecycleDefinition       `json:"lifecycle"`
	Bindings     []ResourceBinding         `json:"bindings,omitempty"`
	Views        map[string][]string       `json:"views,omitempty"`
	DetailLayout *DetailLayoutDefinition   `json:"detailLayout,omitempty"`
	Layouts      *FormLayouts              `json:"layouts,omitempty"`
	DetailPage   *PageLayoutDefinition     `json:"detailPage,omitempty"`
	Relations    []RelationDefinition      `json:"relations,omitempty"`
	Events       []EventDefinition         `json:"events,omitempty"`
	Actions      []ActionDefinition        `json:"actions,omitempty"`
	Extensions   map[string]map[string]any `json:"extensions,omitempty"`
}

type DetailLayoutDefinition struct {
	Fields          []DetailFieldPlacement `json:"fields,omitempty"`
	ShowSLA         *bool                  `json:"showSla,omitempty"`
	ShowAttachments *bool                  `json:"showAttachments,omitempty"`
	ShowActivity    *bool                  `json:"showActivity,omitempty"`
}

type DetailFieldPlacement struct {
	Source   string `json:"source"`
	FieldKey string `json:"fieldKey"`
	Label    string `json:"label,omitempty"`
	Width    string `json:"width,omitempty"`
}

// FormLayouts is the metamodel 1.4 successor to Views/DetailLayout: an
// explicit, section-based layout per view kind (create/edit/detail), with
// optional audience variants. Older specifications may omit it entirely; the
// runtime synthesizes an equivalent document from Views/DetailLayout instead.
type FormLayouts struct {
	Create *LayoutDefinition `json:"create,omitempty"`
	Edit   *LayoutDefinition `json:"edit,omitempty"`
	Detail *LayoutDefinition `json:"detail,omitempty"`
}

type LayoutDefinition struct {
	Default  LayoutDocument  `json:"default"`
	Variants []LayoutVariant `json:"variants,omitempty"`
}

// LayoutVariant is a complete alternative document for one audience. Variants
// replace the default document for that audience; they are not layered on
// top of it. AudienceKey is a stable, closed enum for this increment
// (requester/agent/supervisor) — it is presentation-only and is not yet
// resolved against IAM roles or used to authorize field access server-side.
type LayoutVariant struct {
	Key         string         `json:"key"`
	Label       string         `json:"label"`
	AudienceKey string         `json:"audienceKey"`
	Document    LayoutDocument `json:"document"`
}

type LayoutDocument struct {
	Sections []LayoutSection `json:"sections"`
}

type LayoutSection struct {
	ID          string               `json:"id"`
	Title       string               `json:"title,omitempty"`
	Description string               `json:"description,omitempty"`
	Columns     int                  `json:"columns"`
	Collapsible bool                 `json:"collapsible,omitempty"`
	VisibleWhen *ConditionExpression `json:"visibleWhen,omitempty"`
	Placements  []Placement          `json:"placements"`
}

type PlacementKind string

const (
	PlacementField  PlacementKind = "field"
	PlacementWidget PlacementKind = "widget"
)

// Placement positions either a field (source catalog/ticket) or a widget
// owned by another module (sla/attachments/activity) inside a section. A
// widget placement only controls position/width: Catalog never renders or
// owns the widget's content, it only reserves its slot in the layout.
// ReadOnly is a presentational hint only in this increment — it is not yet
// enforced by CreateEntity/UpdateEntity. VisibleWhen only affects whether the
// placement is shown; it never relaxes FieldDefinition.Required/RequiredWhen,
// which remain the sole data-validation authority (see ValidateData).
type Placement struct {
	ID         string        `json:"id"`
	Kind       PlacementKind `json:"kind"`
	ColumnSpan int           `json:"columnSpan"`

	Source      string               `json:"source,omitempty"`
	FieldKey    string               `json:"fieldKey,omitempty"`
	Label       string               `json:"label,omitempty"`
	ReadOnly    bool                 `json:"readOnly,omitempty"`
	VisibleWhen *ConditionExpression `json:"visibleWhen,omitempty"`

	WidgetKey string `json:"widgetKey,omitempty"`
}

// Metamodel 1.5: a full ticket page structure by fixed regions, distinct from
// (and additive to) the 1.4 form-section layouts above. Layouts (1.4) remain
// the model for create/edit; PageLayout (1.5) is exclusive to detail.
//
// Regions are named struct fields, not an array keyed by kind — this makes a
// missing or duplicated region structurally impossible instead of a
// validation rule.
type PageLayoutDefinition struct {
	Default  PageLayout          `json:"default"`
	Variants []PageLayoutVariant `json:"variants,omitempty"`
}

type PageLayoutVariant struct {
	Key         string     `json:"key"`
	Label       string     `json:"label"`
	AudienceKey string     `json:"audienceKey"`
	Page        PageLayout `json:"page"`
}

// SidebarColumns splits the page width between Main and Sidebar in the row
// where they coexist (3..5 of 12 — Main takes the rest). Header/Actions/
// Footer always span the full page width.
type PageLayout struct {
	SidebarColumns int          `json:"sidebarColumns"`
	Header         LayoutRegion `json:"header"`
	Actions        LayoutRegion `json:"actions"`
	Main           LayoutRegion `json:"main"`
	Sidebar        LayoutRegion `json:"sidebar"`
	Footer         LayoutRegion `json:"footer"`
}

// LayoutRegion is a region's own internal grid: always its own 0..Columns
// coordinate space, independent of how wide the region actually renders on
// the page (a narrow Sidebar still places items on a 0..12 grid).
type LayoutRegion struct {
	Columns    int             `json:"columns"`
	Placements []PagePlacement `json:"placements"`
}

type PagePlacementKind string

const (
	PagePlacementField   PagePlacementKind = "field"
	PagePlacementWidget  PagePlacementKind = "widget"
	PagePlacementContent PagePlacementKind = "content"
)

type PagePlacement struct {
	ID          string               `json:"id"`
	Kind        PagePlacementKind    `json:"kind"`
	Column      int                  `json:"column"`
	ColumnSpan  int                  `json:"columnSpan"`
	Row         int                  `json:"row"`
	RowSpan     int                  `json:"rowSpan,omitempty"`
	MobileOrder *int                 `json:"mobileOrder,omitempty"`
	Locked      bool                 `json:"locked,omitempty"`
	VisibleWhen *ConditionExpression `json:"visibleWhen,omitempty"`

	// Kind == field
	Source   string `json:"source,omitempty"`
	FieldKey string `json:"fieldKey,omitempty"`
	Label    string `json:"label,omitempty"`
	ReadOnly bool   `json:"readOnly,omitempty"`

	// Kind == widget
	WidgetKey string `json:"widgetKey,omitempty"`

	// Kind == content — structural/generic, owned by no business module.
	ContentKind string `json:"contentKind,omitempty"`
	Title       string `json:"title,omitempty"`
	Content     string `json:"content,omitempty"`
}

type IdentityDefinition struct {
	Prefix string `json:"prefix"`
}

type FieldDefinition struct {
	Key          string               `json:"key"`
	Label        string               `json:"label"`
	Type         string               `json:"type"`
	Required     bool                 `json:"required"`
	RequiredWhen *ConditionExpression `json:"requiredWhen,omitempty"`
	VisibleWhen  *ConditionExpression `json:"visibleWhen,omitempty"`
	MinLength    *int                 `json:"minLength,omitempty"`
	MaxLength    *int                 `json:"maxLength,omitempty"`
	Placeholder  string               `json:"placeholder,omitempty"`
	DefaultValue any                  `json:"defaultValue,omitempty"`
	Options      []FieldOption        `json:"options,omitempty"`
	Validation   map[string]any       `json:"validation,omitempty"`
}

type FieldOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type LifecycleDefinition struct {
	States      []StateDefinition      `json:"states"`
	Transitions []TransitionDefinition `json:"transitions"`
}

type StateDefinition struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Initial bool   `json:"initial,omitempty"`
}

type TransitionDefinition struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	From  string `json:"from"`
	To    string `json:"to"`
}

type ResourceBinding struct {
	// Kind and Version are legacy authoring aliases. New definitions should
	// use the explicit module/resourceType/resourceVersion contract.
	Kind            string `json:"kind,omitempty"`
	Module          string `json:"module,omitempty"`
	ResourceType    string `json:"resourceType,omitempty"`
	ResourceID      string `json:"resourceId"`
	ResourceVersion string `json:"resourceVersion,omitempty"`
	ContractVersion string `json:"contractVersion,omitempty"`
	Version         string `json:"version,omitempty"`
	Required        bool   `json:"required,omitempty"`
}

type ResourceReference struct {
	Module          string `json:"module"`
	ResourceType    string `json:"resourceType"`
	ResourceID      string `json:"resourceId"`
	ResourceVersion string `json:"resourceVersion"`
	ContractVersion string `json:"contractVersion"`
	Required        bool   `json:"required"`
}

// AvailableResource is discovery metadata owned by the specialized module.
// Catalog uses it only to let authors choose a stable, versioned reference.
type AvailableResource struct {
	Reference   ResourceReference `json:"reference"`
	DisplayName string            `json:"displayName"`
	Description string            `json:"description,omitempty"`
}

type ExecutableDefinitionManifest struct {
	DefinitionVersionID string              `json:"definitionVersionId"`
	EntityKey           string              `json:"entityKey"`
	Version             int                 `json:"version"`
	MetamodelVersion    string              `json:"metamodelVersion"`
	Specification       Specification       `json:"specification"`
	Resources           []ResourceReference `json:"resources"`
	Checksum            string              `json:"checksum"`
	CompiledAt          time.Time           `json:"compiledAt"`
}

type ValidationIssue struct {
	Path     string `json:"path"`
	Code     string `json:"code"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}

type PublicationValidation struct {
	Valid    bool                          `json:"valid"`
	Issues   []ValidationIssue             `json:"issues"`
	Manifest *ExecutableDefinitionManifest `json:"manifest,omitempty"`
}

type EventDefinition struct {
	Key     string `json:"key"`
	Trigger string `json:"trigger"`
}

type ActionDefinition struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Binding string `json:"binding,omitempty"`
}

type RelationDefinition struct {
	Key             string `json:"key"`
	Label           string `json:"label"`
	TargetEntityKey string `json:"targetEntityKey"`
	InverseKey      string `json:"inverseKey"`
	InverseLabel    string `json:"inverseLabel,omitempty"`
	Cardinality     string `json:"cardinality,omitempty"`
}

type EntityRecord struct {
	ID                  string         `json:"id"`
	HumanID             string         `json:"humanId"`
	EntityKey           string         `json:"entityKey"`
	DefinitionID        string         `json:"definitionId"`
	DefinitionVersionID string         `json:"definitionVersionId"`
	DefinitionVersion   int            `json:"definitionVersion"`
	SchemaVersion       string         `json:"schemaVersion"`
	ManifestChecksum    string         `json:"manifestChecksum"`
	State               string         `json:"state"`
	Data                map[string]any `json:"data"`
	CreatedAt           time.Time      `json:"createdAt"`
	UpdatedAt           time.Time      `json:"updatedAt"`
}

const EntityRelationContractVersion = "1"

type EntityRelation struct {
	ID                        string    `json:"id"`
	ContractVersion           string    `json:"contractVersion"`
	RelationKey               string    `json:"relationKey"`
	RelationLabel             string    `json:"relationLabel"`
	InverseKey                string    `json:"inverseKey"`
	InverseLabel              string    `json:"inverseLabel"`
	SourceEntityID            string    `json:"sourceEntityId"`
	SourceEntityKey           string    `json:"sourceEntityKey"`
	SourceHumanID             string    `json:"sourceHumanId"`
	SourceDefinitionVersionID string    `json:"sourceDefinitionVersionId"`
	TargetEntityID            string    `json:"targetEntityId"`
	TargetEntityKey           string    `json:"targetEntityKey"`
	TargetHumanID             string    `json:"targetHumanId"`
	TargetDefinitionVersionID string    `json:"targetDefinitionVersionId"`
	CreatedBy                 string    `json:"createdBy,omitempty"`
	CreatedAt                 time.Time `json:"createdAt"`
}

func NormalizeEntityKey(key string) string {
	return strings.ToUpper(strings.TrimSpace(key))
}

func (definition Definition) Validate() error {
	if !keyPattern.MatchString(definition.EntityKey) {
		return fmt.Errorf("%w: entityKey must match %s", ErrInvalidDefinition, keyPattern)
	}
	if strings.TrimSpace(definition.Name) == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidDefinition)
	}
	if definition.MetamodelVersion != "" {
		if _, ok := supportedMetamodels[definition.MetamodelVersion]; !ok {
			return fmt.Errorf(
				"%w: unsupported metamodelVersion %q",
				ErrInvalidDefinition,
				definition.MetamodelVersion,
			)
		}
	}
	if !keyPattern.MatchString(definition.Specification.Identity.Prefix) {
		return fmt.Errorf("%w: identity.prefix must match %s", ErrInvalidDefinition, keyPattern)
	}
	if len(definition.Specification.Fields) == 0 {
		return fmt.Errorf("%w: at least one field is required", ErrInvalidDefinition)
	}

	fields := make(map[string]bool, len(definition.Specification.Fields))
	for _, field := range definition.Specification.Fields {
		if !fieldKeyPattern.MatchString(field.Key) {
			return fmt.Errorf("%w: invalid field key %q", ErrInvalidDefinition, field.Key)
		}
		if fields[field.Key] {
			return fmt.Errorf("%w: duplicate field %q", ErrInvalidDefinition, field.Key)
		}
		fields[field.Key] = true
		if strings.TrimSpace(field.Label) == "" {
			return fmt.Errorf("%w: field %q has no label", ErrInvalidDefinition, field.Key)
		}
		if field.Type != "text" && field.Type != "textarea" && field.Type != "select" &&
			field.Type != "boolean" && field.Type != "number" && field.Type != "date" &&
			field.Type != "datetime" {
			return fmt.Errorf("%w: field %q has unsupported type %q", ErrInvalidDefinition, field.Key, field.Type)
		}
		if field.Type == "select" && len(field.Options) == 0 {
			return fmt.Errorf("%w: select field %q needs options", ErrInvalidDefinition, field.Key)
		}
	}
	for _, field := range definition.Specification.Fields {
		for ruleName, condition := range map[string]*ConditionExpression{
			"visibleWhen":  field.VisibleWhen,
			"requiredWhen": field.RequiredWhen,
		} {
			if condition == nil {
				continue
			}
			if !supportedMetamodels[definition.MetamodelVersion].ConditionalFields {
				return fmt.Errorf(
					"%w: field %q uses %s, which requires metamodelVersion %s or later",
					ErrInvalidDefinition,
					field.Key,
					ruleName,
					ConditionalMetamodelVersion,
				)
			}
			if err := condition.Validate(fields, field.Key); err != nil {
				return fmt.Errorf("%w: field %q %s: %v", ErrInvalidDefinition, field.Key, ruleName, err)
			}
		}
	}

	stateKeys := make(map[string]bool, len(definition.Specification.Lifecycle.States))
	initialCount := 0
	for _, state := range definition.Specification.Lifecycle.States {
		if state.Key == "" || stateKeys[state.Key] {
			return fmt.Errorf("%w: lifecycle states must have unique keys", ErrInvalidDefinition)
		}
		stateKeys[state.Key] = true
		if state.Initial {
			initialCount++
		}
	}
	if initialCount != 1 {
		return fmt.Errorf("%w: lifecycle must contain exactly one initial state", ErrInvalidDefinition)
	}
	transitionKeys := make(map[string]bool, len(definition.Specification.Lifecycle.Transitions))
	for _, transition := range definition.Specification.Lifecycle.Transitions {
		if transition.Key == "" || transitionKeys[transition.Key] {
			return fmt.Errorf("%w: lifecycle transitions must have unique keys", ErrInvalidDefinition)
		}
		transitionKeys[transition.Key] = true
		if !stateKeys[transition.From] || !stateKeys[transition.To] {
			return fmt.Errorf("%w: transition %q references an unknown state", ErrInvalidDefinition, transition.Key)
		}
	}
	for view, viewFields := range definition.Specification.Views {
		for _, field := range viewFields {
			if !fields[field] {
				return fmt.Errorf("%w: view %q references unknown field %q", ErrInvalidDefinition, view, field)
			}
		}
	}
	relationKeys := make(map[string]bool, len(definition.Specification.Relations))
	inverseKeys := make(map[string]bool, len(definition.Specification.Relations))
	for _, relation := range definition.Specification.Relations {
		if !supportedMetamodels[definition.MetamodelVersion].Relations {
			return fmt.Errorf(
				"%w: relations require metamodelVersion %s or later",
				ErrInvalidDefinition,
				RelationsMetamodelVersion,
			)
		}
		if !fieldKeyPattern.MatchString(relation.Key) || relationKeys[relation.Key] {
			return fmt.Errorf("%w: relation keys must be valid and unique", ErrInvalidDefinition)
		}
		if !fieldKeyPattern.MatchString(relation.InverseKey) || inverseKeys[relation.InverseKey] {
			return fmt.Errorf("%w: relation inverse keys must be valid and unique", ErrInvalidDefinition)
		}
		if strings.TrimSpace(relation.Label) == "" || strings.TrimSpace(relation.InverseLabel) == "" {
			return fmt.Errorf("%w: relation %q requires label and inverseLabel", ErrInvalidDefinition, relation.Key)
		}
		if !keyPattern.MatchString(NormalizeEntityKey(relation.TargetEntityKey)) {
			return fmt.Errorf("%w: relation %q has invalid targetEntityKey", ErrInvalidDefinition, relation.Key)
		}
		if relation.Cardinality != "" && relation.Cardinality != "one" && relation.Cardinality != "many" {
			return fmt.Errorf("%w: relation %q cardinality must be one or many", ErrInvalidDefinition, relation.Key)
		}
		relationKeys[relation.Key] = true
		inverseKeys[relation.InverseKey] = true
	}
	if layout := definition.Specification.DetailLayout; layout != nil {
		if !supportedMetamodels[definition.MetamodelVersion].DetailLayout {
			return fmt.Errorf(
				"%w: detailLayout requires metamodelVersion %s or later",
				ErrInvalidDefinition,
				LayoutMetamodelVersion,
			)
		}
		placements := make(map[string]bool, len(layout.Fields))
		for index, placement := range layout.Fields {
			if placement.Source != "catalog" && placement.Source != "ticket" {
				return fmt.Errorf(
					"%w: detailLayout field %d has unsupported source %q",
					ErrInvalidDefinition,
					index,
					placement.Source,
				)
			}
			if placement.Source == "catalog" && !fields[placement.FieldKey] {
				return fmt.Errorf(
					"%w: detailLayout references unknown catalog field %q",
					ErrInvalidDefinition,
					placement.FieldKey,
				)
			}
			if placement.Source == "ticket" && !allowedTicketFields[placement.FieldKey] {
				return fmt.Errorf(
					"%w: detailLayout references unsupported ticket field %q",
					ErrInvalidDefinition,
					placement.FieldKey,
				)
			}
			placementKey := placement.Source + ":" + placement.FieldKey
			if placements[placementKey] {
				return fmt.Errorf(
					"%w: detailLayout contains duplicate field %q",
					ErrInvalidDefinition,
					placementKey,
				)
			}
			placements[placementKey] = true
			if placement.Width != "" &&
				placement.Width != "third" &&
				placement.Width != "half" &&
				placement.Width != "full" {
				return fmt.Errorf(
					"%w: detailLayout field %q has unsupported width %q",
					ErrInvalidDefinition,
					placementKey,
					placement.Width,
				)
			}
		}
	}
	if err := validateLayouts(definition, fields); err != nil {
		return err
	}
	if err := validateDetailPage(definition, fields); err != nil {
		return err
	}
	for index, binding := range definition.Specification.Bindings {
		reference := binding.Reference()
		if reference.Module == "" || reference.ResourceType == "" || reference.ResourceID == "" {
			return fmt.Errorf(
				"%w: binding %d requires module, resourceType and resourceId",
				ErrInvalidDefinition,
				index,
			)
		}
	}
	return nil
}

// validateLayouts validates specification.layouts (metamodel 1.4). It is a
// no-op when the specification does not declare layouts, so definitions
// authored before 1.4 are unaffected.
func validateLayouts(definition Definition, fields map[string]bool) error {
	layouts := definition.Specification.Layouts
	if layouts == nil {
		return nil
	}
	if !supportedMetamodels[definition.MetamodelVersion].Layouts {
		return fmt.Errorf(
			"%w: layouts require metamodelVersion %s or later",
			ErrInvalidDefinition,
			FormLayoutsMetamodelVersion,
		)
	}
	fieldByKey := make(map[string]FieldDefinition, len(definition.Specification.Fields))
	for _, field := range definition.Specification.Fields {
		fieldByKey[field.Key] = field
	}
	kinds := []struct {
		name       string
		definition *LayoutDefinition
	}{
		{"create", layouts.Create},
		{"edit", layouts.Edit},
		{"detail", layouts.Detail},
	}
	for _, entry := range kinds {
		if entry.definition == nil {
			continue
		}
		documents := []LayoutDocument{entry.definition.Default}
		variantKeys := make(map[string]bool, len(entry.definition.Variants))
		audienceKeys := make(map[string]bool, len(entry.definition.Variants))
		for _, variant := range entry.definition.Variants {
			if strings.TrimSpace(variant.Key) == "" || variantKeys[variant.Key] {
				return fmt.Errorf(
					"%w: layout %q has an invalid or duplicate variant key %q",
					ErrInvalidDefinition, entry.name, variant.Key,
				)
			}
			variantKeys[variant.Key] = true
			if !allowedAudienceKeys[variant.AudienceKey] || audienceKeys[variant.AudienceKey] {
				return fmt.Errorf(
					"%w: layout %q variant %q has an invalid or duplicate audienceKey %q",
					ErrInvalidDefinition, entry.name, variant.Key, variant.AudienceKey,
				)
			}
			audienceKeys[variant.AudienceKey] = true
			documents = append(documents, variant.Document)
		}
		for _, document := range documents {
			if err := validateLayoutDocument(document, fields); err != nil {
				return fmt.Errorf("%w: layout %q: %v", ErrInvalidDefinition, entry.name, err)
			}
			if entry.name == "create" {
				if err := validateCreatableRequiredFields(document, fieldByKey); err != nil {
					return fmt.Errorf("%w: layout %q: %v", ErrInvalidDefinition, entry.name, err)
				}
			}
		}
	}
	return nil
}

func validateLayoutDocument(document LayoutDocument, fields map[string]bool) error {
	sectionIDs := make(map[string]bool, len(document.Sections))
	placementIDs := map[string]bool{}
	placementKeys := map[string]bool{}
	for _, section := range document.Sections {
		if strings.TrimSpace(section.ID) == "" || sectionIDs[section.ID] {
			return fmt.Errorf("section id %q is invalid or duplicated", section.ID)
		}
		sectionIDs[section.ID] = true
		if section.Columns < 1 || section.Columns > 3 {
			return fmt.Errorf("section %q must have between 1 and 3 columns", section.ID)
		}
		if section.VisibleWhen != nil {
			if err := section.VisibleWhen.Validate(fields, section.ID); err != nil {
				return fmt.Errorf("section %q visibleWhen: %w", section.ID, err)
			}
		}
		for _, placement := range section.Placements {
			if strings.TrimSpace(placement.ID) == "" || placementIDs[placement.ID] {
				return fmt.Errorf("placement id %q is invalid or duplicated", placement.ID)
			}
			placementIDs[placement.ID] = true
			if placement.ColumnSpan < 1 || placement.ColumnSpan > section.Columns {
				return fmt.Errorf(
					"placement %q columnSpan must be between 1 and %d",
					placement.ID, section.Columns,
				)
			}
			var placementKey string
			switch placement.Kind {
			case PlacementField:
				if placement.Source != "catalog" && placement.Source != "ticket" {
					return fmt.Errorf("placement %q has unsupported source %q", placement.ID, placement.Source)
				}
				if placement.Source == "catalog" && !fields[placement.FieldKey] {
					return fmt.Errorf(
						"placement %q references unknown catalog field %q",
						placement.ID, placement.FieldKey,
					)
				}
				if placement.Source == "ticket" && !allowedTicketFields[placement.FieldKey] {
					return fmt.Errorf(
						"placement %q references unsupported ticket field %q",
						placement.ID, placement.FieldKey,
					)
				}
				if placement.VisibleWhen != nil {
					if err := placement.VisibleWhen.Validate(fields, placement.FieldKey); err != nil {
						return fmt.Errorf("placement %q visibleWhen: %w", placement.ID, err)
					}
				}
				placementKey = "field:" + placement.Source + ":" + placement.FieldKey
			case PlacementWidget:
				if !allowedWidgetKeys[placement.WidgetKey] {
					return fmt.Errorf("placement %q has unsupported widgetKey %q", placement.ID, placement.WidgetKey)
				}
				placementKey = "widget:" + placement.WidgetKey
			default:
				return fmt.Errorf("placement %q has unsupported kind %q", placement.ID, placement.Kind)
			}
			if placementKeys[placementKey] {
				return fmt.Errorf("placement %q duplicates an existing placement in the same document", placement.ID)
			}
			placementKeys[placementKey] = true
		}
	}
	return nil
}

// validateCreatableRequiredFields ensures every unconditionally required
// field can actually be filled in on the create layout: it must be placed
// exactly once, not presentationally hidden, and not read-only without a
// default value. Fields with a conditional RequiredWhen are not statically
// checked here (documented limitation).
func validateCreatableRequiredFields(document LayoutDocument, fieldByKey map[string]FieldDefinition) error {
	placementsByField := make(map[string]Placement)
	for _, section := range document.Sections {
		for _, placement := range section.Placements {
			if placement.Kind == PlacementField && placement.Source == "catalog" {
				placementsByField[placement.FieldKey] = placement
			}
		}
	}
	for key, field := range fieldByKey {
		if !field.Required {
			continue
		}
		placement, ok := placementsByField[key]
		if !ok {
			return fmt.Errorf("required field %q must be placed on the create layout", key)
		}
		if placement.VisibleWhen != nil {
			return fmt.Errorf("required field %q cannot have a conditional visibility on the create layout", key)
		}
		if placement.ReadOnly && field.DefaultValue == nil {
			return fmt.Errorf("required field %q is read-only on the create layout but has no defaultValue", key)
		}
	}
	return nil
}

// validateDetailPage validates specification.detailPage (metamodel 1.5). It is
// a no-op when the specification does not declare a page layout, so
// definitions authored before 1.5 (including the 1.4 layouts.detail shape)
// are unaffected.
func validateDetailPage(definition Definition, fields map[string]bool) error {
	detailPage := definition.Specification.DetailPage
	if detailPage == nil {
		return nil
	}
	if !supportedMetamodels[definition.MetamodelVersion].PageLayout {
		return fmt.Errorf(
			"%w: detailPage requires metamodelVersion %s or later",
			ErrInvalidDefinition,
			CurrentMetamodelVersion,
		)
	}
	pages := []PageLayout{detailPage.Default}
	variantKeys := make(map[string]bool, len(detailPage.Variants))
	audienceKeys := make(map[string]bool, len(detailPage.Variants))
	for _, variant := range detailPage.Variants {
		if strings.TrimSpace(variant.Key) == "" || variantKeys[variant.Key] {
			return fmt.Errorf(
				"%w: detailPage has an invalid or duplicate variant key %q",
				ErrInvalidDefinition, variant.Key,
			)
		}
		variantKeys[variant.Key] = true
		if !allowedAudienceKeys[variant.AudienceKey] || audienceKeys[variant.AudienceKey] {
			return fmt.Errorf(
				"%w: detailPage variant %q has an invalid or duplicate audienceKey %q",
				ErrInvalidDefinition, variant.Key, variant.AudienceKey,
			)
		}
		audienceKeys[variant.AudienceKey] = true
		pages = append(pages, variant.Page)
	}
	for _, page := range pages {
		if err := validatePageLayout(page, fields); err != nil {
			return fmt.Errorf("%w: detailPage: %v", ErrInvalidDefinition, err)
		}
	}
	return nil
}

func validatePageLayout(page PageLayout, fields map[string]bool) error {
	if page.SidebarColumns < 3 || page.SidebarColumns > 5 {
		return fmt.Errorf("sidebarColumns must be between 3 and 5, got %d", page.SidebarColumns)
	}
	regions := []struct {
		name   string
		region LayoutRegion
	}{
		{"header", page.Header},
		{"actions", page.Actions},
		{"main", page.Main},
		{"sidebar", page.Sidebar},
		{"footer", page.Footer},
	}
	placementIDs := map[string]bool{}
	widgetUsage := map[string]bool{}
	fieldUsage := map[string]bool{}
	widgetRegion := map[string]string{}
	for _, entry := range regions {
		if err := validatePageRegion(
			entry.name, entry.region, fields,
			placementIDs, widgetUsage, fieldUsage, widgetRegion,
		); err != nil {
			return err
		}
	}
	for widgetKey, rule := range pageWidgetRules {
		if rule.RequiredIn == "" {
			continue
		}
		region, seen := widgetRegion[widgetKey]
		if !seen {
			return fmt.Errorf("required widget %q must be placed in the %q region", widgetKey, rule.RequiredIn)
		}
		if region != rule.RequiredIn {
			return fmt.Errorf(
				"required widget %q must be placed in the %q region, found in %q",
				widgetKey, rule.RequiredIn, region,
			)
		}
	}
	return nil
}

func validatePageRegion(
	regionName string,
	region LayoutRegion,
	fields map[string]bool,
	placementIDs map[string]bool,
	widgetUsage map[string]bool,
	fieldUsage map[string]bool,
	widgetRegion map[string]string,
) error {
	if region.Columns < 1 || region.Columns > 12 {
		return fmt.Errorf("region %q must have between 1 and 12 columns", regionName)
	}
	for _, placement := range region.Placements {
		if strings.TrimSpace(placement.ID) == "" || placementIDs[placement.ID] {
			return fmt.Errorf("placement id %q is invalid or duplicated", placement.ID)
		}
		placementIDs[placement.ID] = true
		if placement.ColumnSpan < 1 || placement.Column < 0 ||
			placement.Column+placement.ColumnSpan > region.Columns {
			return fmt.Errorf("placement %q must fit within region %q's columns", placement.ID, regionName)
		}
		if placement.Row < 0 {
			return fmt.Errorf("placement %q has a negative row", placement.ID)
		}
		if placement.RowSpan < 0 {
			return fmt.Errorf("placement %q has a negative rowSpan", placement.ID)
		}
		switch placement.Kind {
		case PagePlacementField:
			if placement.Source != "catalog" && placement.Source != "ticket" {
				return fmt.Errorf("placement %q has unsupported source %q", placement.ID, placement.Source)
			}
			if placement.Source == "catalog" && !fields[placement.FieldKey] {
				return fmt.Errorf(
					"placement %q references unknown catalog field %q",
					placement.ID, placement.FieldKey,
				)
			}
			if placement.Source == "ticket" && !allowedTicketFields[placement.FieldKey] {
				return fmt.Errorf(
					"placement %q references unsupported ticket field %q",
					placement.ID, placement.FieldKey,
				)
			}
			fieldKey := placement.Source + ":" + placement.FieldKey
			if fieldUsage[fieldKey] {
				return fmt.Errorf("placement %q duplicates an existing field placement in the page", placement.ID)
			}
			fieldUsage[fieldKey] = true
			if placement.VisibleWhen != nil {
				if err := placement.VisibleWhen.Validate(fields, placement.FieldKey); err != nil {
					return fmt.Errorf("placement %q visibleWhen: %w", placement.ID, err)
				}
			}
		case PagePlacementWidget:
			rule, ok := pageWidgetRules[placement.WidgetKey]
			if !ok {
				return fmt.Errorf("placement %q has unsupported widgetKey %q", placement.ID, placement.WidgetKey)
			}
			if !containsString(rule.AllowedRegions, regionName) {
				return fmt.Errorf("widget %q is not allowed in region %q", placement.WidgetKey, regionName)
			}
			if widgetUsage[placement.WidgetKey] && !rule.AllowMultiple {
				return fmt.Errorf("widget %q cannot be placed more than once on the page", placement.WidgetKey)
			}
			widgetUsage[placement.WidgetKey] = true
			widgetRegion[placement.WidgetKey] = regionName
			if placement.VisibleWhen != nil {
				if err := placement.VisibleWhen.Validate(fields, placement.WidgetKey); err != nil {
					return fmt.Errorf("placement %q visibleWhen: %w", placement.ID, err)
				}
			}
		case PagePlacementContent:
			if !allowedPageContentKinds[placement.ContentKind] {
				return fmt.Errorf("placement %q has unsupported contentKind %q", placement.ID, placement.ContentKind)
			}
		default:
			return fmt.Errorf("placement %q has unsupported kind %q", placement.ID, placement.Kind)
		}
	}
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (binding ResourceBinding) Reference() ResourceReference {
	module := strings.ToLower(strings.TrimSpace(binding.Module))
	resourceType := strings.TrimSpace(binding.ResourceType)
	if module == "" || resourceType == "" {
		legacyModule, legacyType := legacyBindingOwner(binding.Kind)
		if module == "" {
			module = legacyModule
		}
		if resourceType == "" {
			resourceType = legacyType
		}
	}
	resourceVersion := strings.TrimSpace(binding.ResourceVersion)
	if resourceVersion == "" {
		resourceVersion = strings.TrimSpace(binding.Version)
	}
	return ResourceReference{
		Module:          module,
		ResourceType:    resourceType,
		ResourceID:      strings.TrimSpace(binding.ResourceID),
		ResourceVersion: resourceVersion,
		ContractVersion: strings.TrimSpace(binding.ContractVersion),
		Required:        binding.Required,
	}
}

func legacyBindingOwner(kind string) (string, string) {
	switch strings.TrimSpace(kind) {
	case "permissionPolicy":
		return "iam", "policy"
	case "slaPolicy":
		return "sla", "policy"
	case "automation":
		return "automations", "workflow"
	case "notificationTemplate":
		return "notifications", "template"
	case "integration":
		return "integrations", "connector"
	case "reportMetric":
		return "reports", "metric"
	default:
		return "", ""
	}
}

func (definition Definition) Transition(state, transitionKey string) (string, error) {
	for _, transition := range definition.Specification.Lifecycle.Transitions {
		if transition.Key == transitionKey && transition.From == state {
			return transition.To, nil
		}
	}
	return "", fmt.Errorf(
		"%w: transition %q is not available from state %q",
		ErrInvalidTransition,
		transitionKey,
		state,
	)
}

func CompileManifest(
	definition Definition,
	resources []ResourceReference,
	compiledAt time.Time,
) (ExecutableDefinitionManifest, error) {
	if err := definition.Validate(); err != nil {
		return ExecutableDefinitionManifest{}, err
	}
	for index, resource := range resources {
		if resource.Module == "" || resource.ResourceType == "" || resource.ResourceID == "" ||
			resource.ResourceVersion == "" || resource.ContractVersion == "" {
			return ExecutableDefinitionManifest{}, fmt.Errorf(
				"%w: resource %d is not fully versioned",
				ErrInvalidDefinition,
				index,
			)
		}
	}

	specification, err := cloneSpecification(definition.Specification)
	if err != nil {
		return ExecutableDefinitionManifest{}, err
	}
	sort.Slice(resources, func(left, right int) bool {
		leftKey := resources[left].Module + ":" + resources[left].ResourceType + ":" + resources[left].ResourceID
		rightKey := resources[right].Module + ":" + resources[right].ResourceType + ":" + resources[right].ResourceID
		return leftKey < rightKey
	})
	manifest := ExecutableDefinitionManifest{
		DefinitionVersionID: definition.ID,
		EntityKey:           definition.EntityKey,
		Version:             definition.Version,
		MetamodelVersion:    definition.MetamodelVersion,
		Specification:       specification,
		Resources:           resources,
		CompiledAt:          compiledAt.UTC(),
	}
	if manifest.MetamodelVersion == "" {
		manifest.MetamodelVersion = CurrentMetamodelVersion
	}
	checksumPayload := struct {
		DefinitionVersionID string              `json:"definitionVersionId"`
		EntityKey           string              `json:"entityKey"`
		Version             int                 `json:"version"`
		MetamodelVersion    string              `json:"metamodelVersion"`
		Specification       Specification       `json:"specification"`
		Resources           []ResourceReference `json:"resources"`
	}{
		DefinitionVersionID: manifest.DefinitionVersionID,
		EntityKey:           manifest.EntityKey,
		Version:             manifest.Version,
		MetamodelVersion:    manifest.MetamodelVersion,
		Specification:       manifest.Specification,
		Resources:           manifest.Resources,
	}
	encoded, err := json.Marshal(checksumPayload)
	if err != nil {
		return ExecutableDefinitionManifest{}, fmt.Errorf("encode manifest checksum: %w", err)
	}
	sum := sha256.Sum256(encoded)
	manifest.Checksum = hex.EncodeToString(sum[:])
	return manifest, nil
}

func cloneSpecification(specification Specification) (Specification, error) {
	encoded, err := json.Marshal(specification)
	if err != nil {
		return Specification{}, fmt.Errorf("encode catalog specification: %w", err)
	}
	var cloned Specification
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return Specification{}, fmt.Errorf("decode catalog specification: %w", err)
	}
	return cloned, nil
}

func (definition Definition) InitialState() string {
	for _, state := range definition.Specification.Lifecycle.States {
		if state.Initial {
			return state.Key
		}
	}
	return ""
}

func (definition Definition) ValidateData(data map[string]any) error {
	fieldByKey := make(map[string]FieldDefinition, len(definition.Specification.Fields))
	evaluationData := make(map[string]any, len(data)+len(definition.Specification.Fields))
	for key, value := range data {
		evaluationData[key] = value
	}
	for _, field := range definition.Specification.Fields {
		fieldByKey[field.Key] = field
		if _, exists := evaluationData[field.Key]; !exists && field.DefaultValue != nil {
			evaluationData[field.Key] = field.DefaultValue
		}
	}
	for key := range data {
		if _, exists := fieldByKey[key]; !exists {
			return fmt.Errorf("%w: unknown field %q", ErrInvalidEntityData, key)
		}
	}
	for _, field := range definition.Specification.Fields {
		value, exists := data[field.Key]
		visible := field.VisibleWhen == nil || field.VisibleWhen.Matches(evaluationData)
		if !visible {
			if exists && !isEmptyValue(value) {
				return fmt.Errorf(
					"%w: field %q is not applicable for the supplied data",
					ErrInvalidEntityData,
					field.Key,
				)
			}
			continue
		}
		required := field.Required ||
			(field.RequiredWhen != nil && field.RequiredWhen.Matches(evaluationData))
		if !exists || isEmptyValue(value) {
			if required {
				return fmt.Errorf("%w: field %q is required", ErrInvalidEntityData, field.Key)
			}
			continue
		}
		switch field.Type {
		case "text", "textarea", "date", "datetime":
			text, ok := value.(string)
			if !ok {
				return fmt.Errorf("%w: field %q must be a string", ErrInvalidEntityData, field.Key)
			}
			if field.Type == "date" {
				if _, err := time.Parse("2006-01-02", text); err != nil {
					return fmt.Errorf("%w: field %q must use YYYY-MM-DD", ErrInvalidEntityData, field.Key)
				}
			}
			if field.Type == "datetime" {
				if _, err := time.Parse(time.RFC3339, text); err != nil {
					return fmt.Errorf("%w: field %q must use RFC3339", ErrInvalidEntityData, field.Key)
				}
			}
			length := len(strings.TrimSpace(text))
			if field.MinLength != nil && length < *field.MinLength {
				return fmt.Errorf("%w: field %q is shorter than %d characters", ErrInvalidEntityData, field.Key, *field.MinLength)
			}
			if field.MaxLength != nil && length > *field.MaxLength {
				return fmt.Errorf("%w: field %q is longer than %d characters", ErrInvalidEntityData, field.Key, *field.MaxLength)
			}
		case "number":
			if _, ok := value.(float64); !ok {
				return fmt.Errorf("%w: field %q must be a number", ErrInvalidEntityData, field.Key)
			}
		case "boolean":
			if _, ok := value.(bool); !ok {
				return fmt.Errorf("%w: field %q must be a boolean", ErrInvalidEntityData, field.Key)
			}
		case "select":
			selected, ok := value.(string)
			if !ok || !containsOption(field.Options, selected) {
				return fmt.Errorf("%w: field %q contains an invalid option", ErrInvalidEntityData, field.Key)
			}
		}
	}
	return nil
}

func containsOption(options []FieldOption, selected string) bool {
	for _, option := range options {
		if option.Value == selected {
			return true
		}
	}
	return false
}
