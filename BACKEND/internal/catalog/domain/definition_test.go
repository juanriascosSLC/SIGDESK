package domain

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func validDefinition() Definition {
	minimum := 3
	maximum := 160
	return Definition{
		EntityKey: "INC",
		Name:      "Incidente",
		Specification: Specification{
			Identity: IdentityDefinition{Prefix: "INC"},
			Fields: []FieldDefinition{
				{
					Key:       "title",
					Label:     "Título",
					Type:      "text",
					Required:  true,
					MinLength: &minimum,
					MaxLength: &maximum,
				},
				{
					Key:      "priority",
					Label:    "Prioridad",
					Type:     "select",
					Required: true,
					Options: []FieldOption{
						{Value: "low", Label: "Baja"},
						{Value: "high", Label: "Alta"},
					},
				},
			},
			Lifecycle: LifecycleDefinition{
				States: []StateDefinition{
					{Key: "open", Label: "Abierto", Initial: true},
					{Key: "resolved", Label: "Resuelto"},
				},
				Transitions: []TransitionDefinition{
					{Key: "resolve", Label: "Resolver", From: "open", To: "resolved"},
				},
			},
			Views: map[string][]string{"create": {"title", "priority"}},
		},
	}
}

func TestDefinitionValidatesMetadataAndEntityData(t *testing.T) {
	definition := validDefinition()
	if err := definition.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	if state := definition.InitialState(); state != "open" {
		t.Fatalf("InitialState() = %q, want open", state)
	}
	if err := definition.ValidateData(map[string]any{
		"title":    "Camera offline",
		"priority": "high",
	}); err != nil {
		t.Fatalf("ValidateData() error = %v", err)
	}
}

func TestDefinitionRejectsRulesNotDeclaredInMetadata(t *testing.T) {
	definition := validDefinition()
	err := definition.ValidateData(map[string]any{
		"title":    "Camera offline",
		"priority": "urgent",
	})
	if !errors.Is(err, ErrInvalidEntityData) {
		t.Fatalf("ValidateData() error = %v, want ErrInvalidEntityData", err)
	}
}

func TestDefinitionRejectsUnknownViewField(t *testing.T) {
	definition := validDefinition()
	definition.Specification.Views["summary"] = []string{"unknown"}
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition", err)
	}
}

// TestDefinitionValidateRejectsDuplicateFieldID proves a definition cannot
// declare two fields sharing the same stable fieldId, even when their `key`s
// differ — this is the guard that stops a fieldId ever being reassigned to a
// second, different field within one definition version, which would let a
// layout binding silently jump to the wrong field.
func TestDefinitionValidateRejectsDuplicateFieldID(t *testing.T) {
	definition := validDefinition()
	definition.Specification.Fields = []FieldDefinition{
		{ID: "f1", Key: "title", Label: "Título", Type: "text"},
		{ID: "f1", Key: "headline", Label: "Titular", Type: "text"},
	}
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition", err)
	}
	if !strings.Contains(err.Error(), "duplicate fieldId") {
		t.Fatalf("Validate() error = %v, want it to mention the duplicate fieldId", err)
	}
}

// TestFieldIDSurvivesKeyRename proves FieldID() — the identifier layout
// bindings are meant to use — stays stable when a field's `key` is renamed,
// as long as the explicit `id` is carried over. Renaming `key` alone (without
// ever assigning an explicit `id`) is the pre-existing, unstable case: the
// fallback identity IS the key, so it changes too. The whole point of `id` is
// to opt out of that.
func TestFieldIDSurvivesKeyRename(t *testing.T) {
	before := FieldDefinition{ID: "f1", Key: "title", Label: "Título", Type: "text"}
	after := FieldDefinition{ID: "f1", Key: "headline", Label: "Titular", Type: "text"}

	if before.FieldID() != after.FieldID() {
		t.Fatalf("FieldID() changed across a key rename: %q -> %q", before.FieldID(), after.FieldID())
	}

	withoutExplicitID := FieldDefinition{Key: "title", Label: "Título", Type: "text"}
	renamedWithoutExplicitID := FieldDefinition{Key: "headline", Label: "Titular", Type: "text"}
	if withoutExplicitID.FieldID() == renamedWithoutExplicitID.FieldID() {
		t.Fatalf("expected FieldID() to change when key is renamed and no explicit id was ever assigned")
	}
}

func TestConditionalFieldsAreVisibleAndRequiredFromMetadata(t *testing.T) {
	definition := validDefinition()
	definition.MetamodelVersion = CurrentMetamodelVersion
	definition.Specification.Fields = append(
		definition.Specification.Fields,
		FieldDefinition{
			Key: "cameraChannel", Label: "Canal de cámara", Type: "number",
			VisibleWhen: &ConditionExpression{
				Field: "priority", Operator: "equals", Value: "high",
			},
			RequiredWhen: &ConditionExpression{
				Field: "priority", Operator: "equals", Value: "high",
			},
		},
	)
	definition.Specification.Views["create"] = append(
		definition.Specification.Views["create"],
		"cameraChannel",
	)
	if err := definition.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}

	err := definition.ValidateData(map[string]any{
		"title": "Camera offline", "priority": "high",
	})
	if !errors.Is(err, ErrInvalidEntityData) ||
		!strings.Contains(err.Error(), `field "cameraChannel" is required`) {
		t.Fatalf("conditional required field error = %v", err)
	}
	if err := definition.ValidateData(map[string]any{
		"title": "Camera offline", "priority": "high", "cameraChannel": float64(4),
	}); err != nil {
		t.Fatalf("ValidateData(high with channel) error = %v", err)
	}
	if err := definition.ValidateData(map[string]any{
		"title": "Informational request", "priority": "low",
	}); err != nil {
		t.Fatalf("ValidateData(low without channel) error = %v", err)
	}
	err = definition.ValidateData(map[string]any{
		"title": "Informational request", "priority": "low", "cameraChannel": float64(4),
	})
	if !errors.Is(err, ErrInvalidEntityData) ||
		!strings.Contains(err.Error(), "not applicable") {
		t.Fatalf("hidden field was accepted: %v", err)
	}
}

func TestDefinitionRejectsInvalidConditionalRules(t *testing.T) {
	definition := validDefinition()
	definition.MetamodelVersion = CurrentMetamodelVersion
	definition.Specification.Fields[0].VisibleWhen = &ConditionExpression{
		Field: "missing", Operator: "equals", Value: "camera",
	}
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition", err)
	}

	definition = validDefinition()
	definition.MetamodelVersion = CurrentMetamodelVersion
	definition.Specification.Fields[0].RequiredWhen = &ConditionExpression{
		All: []ConditionExpression{
			{Field: "priority", Operator: "in", Values: []any{"high"}},
			{Field: "priority", Operator: "notEquals", Value: "low"},
		},
	}
	if err := definition.Validate(); err != nil {
		t.Fatalf("Validate(composite condition) error = %v", err)
	}
}

func TestDefinitionValidatesVersionedDetailLayout(t *testing.T) {
	definition := validDefinition()
	definition.MetamodelVersion = CurrentMetamodelVersion
	show := true
	definition.Specification.DetailLayout = &DetailLayoutDefinition{
		Fields: []DetailFieldPlacement{
			{Source: "ticket", FieldKey: "requester", Width: "third"},
			{Source: "catalog", FieldKey: "title", Label: "Asunto", Width: "full"},
		},
		ShowSLA: &show,
	}
	if err := definition.Validate(); err != nil {
		t.Fatalf("Validate(detailLayout) error = %v", err)
	}

	definition.Specification.DetailLayout.Fields = append(
		definition.Specification.DetailLayout.Fields,
		DetailFieldPlacement{Source: "catalog", FieldKey: "missing", Width: "half"},
	)
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate(unknown detail field) error = %v, want ErrInvalidDefinition", err)
	}
}

func TestCompileManifestIsVersionLockedAndDeterministic(t *testing.T) {
	definition := validDefinition()
	definition.ID = "definition-version-1"
	definition.Version = 1
	definition.MetamodelVersion = CurrentMetamodelVersion
	compiledAt := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	resources := []ResourceReference{{
		Module:          "sla",
		ResourceType:    "policy",
		ResourceID:      "sla:policy:incident-standard",
		ResourceVersion: "3",
		ContractVersion: "1",
	}}

	first, err := CompileManifest(definition, resources, compiledAt)
	if err != nil {
		t.Fatalf("CompileManifest() error = %v", err)
	}
	second, err := CompileManifest(definition, resources, compiledAt.Add(time.Hour))
	if err != nil {
		t.Fatalf("CompileManifest() second error = %v", err)
	}
	if first.Checksum == "" || first.Checksum != second.Checksum {
		t.Fatalf("manifest checksum must ignore compilation time: %q != %q", first.Checksum, second.Checksum)
	}
	definition.Specification.Fields[0].Label = "Changed after publication"
	if first.Specification.Fields[0].Label == definition.Specification.Fields[0].Label {
		t.Fatal("compiled manifest shares mutable specification memory")
	}
}

func newFieldPlacement(id, source, fieldKey string, columnSpan int) Placement {
	return Placement{ID: id, Kind: PlacementField, Source: source, FieldKey: fieldKey, ColumnSpan: columnSpan}
}

func newWidgetPlacement(id, widgetKey string, columnSpan int) Placement {
	return Placement{ID: id, Kind: PlacementWidget, WidgetKey: widgetKey, ColumnSpan: columnSpan}
}

func newSection(id string, columns int, placements ...Placement) LayoutSection {
	return LayoutSection{ID: id, Columns: columns, Placements: placements}
}

func validCreateLayoutDocument() LayoutDocument {
	return LayoutDocument{
		Sections: []LayoutSection{
			newSection("section-main", 2,
				newFieldPlacement("placement-title", "catalog", "title", 2),
				newFieldPlacement("placement-priority", "catalog", "priority", 1),
			),
		},
	}
}

// definitionWithCreateLayout returns a definition whose create layout places
// both required fields (title, priority) exactly once, unconditionally
// visible — the minimal well-formed case every failing test mutates.
func definitionWithCreateLayout() Definition {
	definition := validDefinition()
	definition.MetamodelVersion = CurrentMetamodelVersion
	definition.Specification.Layouts = &FormLayouts{
		Create: &LayoutDefinition{Default: validCreateLayoutDocument()},
	}
	return definition
}

func TestRelationsAndDetailLayoutRemainValidAtRelationsMetamodelVersion(t *testing.T) {
	definition := validDefinition()
	definition.MetamodelVersion = RelationsMetamodelVersion
	definition.Specification.Relations = []RelationDefinition{
		{
			Key: "linkedProblem", Label: "Problema vinculado",
			TargetEntityKey: "PRB",
			InverseKey:      "linkedIncidents", InverseLabel: "Incidentes vinculados",
		},
	}
	show := true
	definition.Specification.DetailLayout = &DetailLayoutDefinition{
		Fields: []DetailFieldPlacement{
			{Source: "ticket", FieldKey: "requester", Width: "third"},
			{Source: "catalog", FieldKey: "title", Width: "full"},
		},
		ShowSLA: &show,
	}
	if err := definition.Validate(); err != nil {
		t.Fatalf("a %s definition with relations and detailLayout must still validate after introducing %s: %v", RelationsMetamodelVersion, CurrentMetamodelVersion, err)
	}
	compiledAt := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)
	if _, err := CompileManifest(definition, nil, compiledAt); err != nil {
		t.Fatalf("CompileManifest() on a %s definition error = %v", RelationsMetamodelVersion, err)
	}
}

func TestLayoutsRequireCurrentMetamodelVersion(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.MetamodelVersion = RelationsMetamodelVersion
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for layouts on an older metamodel", err)
	}
}

func TestValidateLayoutsAcceptsWellFormedCreateLayout(t *testing.T) {
	definition := definitionWithCreateLayout()
	if err := definition.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestValidateLayoutsRejectsDuplicateSectionID(t *testing.T) {
	definition := definitionWithCreateLayout()
	create := definition.Specification.Layouts.Create
	create.Default.Sections = append(create.Default.Sections,
		newSection("section-main", 1, newWidgetPlacement("placement-activity", "activity", 1)),
	)
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for duplicate section id", err)
	}
}

func TestValidateLayoutsRejectsDuplicatePlacementID(t *testing.T) {
	definition := definitionWithCreateLayout()
	sections := definition.Specification.Layouts.Create.Default.Sections
	sections[0].Placements = append(sections[0].Placements,
		newFieldPlacement("placement-title", "ticket", "status", 1),
	)
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for duplicate placement id", err)
	}
}

func TestValidateLayoutsRejectsDuplicatePlacementKey(t *testing.T) {
	definition := definitionWithCreateLayout()
	sections := definition.Specification.Layouts.Create.Default.Sections
	sections[0].Placements = append(sections[0].Placements,
		newFieldPlacement("placement-title-again", "catalog", "title", 1),
	)
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for a field placed twice", err)
	}
}

func TestValidateLayoutsRejectsUnknownCatalogField(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.Specification.Layouts.Create.Default.Sections[0].Placements[0].FieldKey = "missing"
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for unknown field", err)
	}
}

func TestValidateLayoutsRejectsResourceSource(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.Specification.Layouts.Create.Default.Sections[0].Placements[0].Source = "resource"
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition: 'resource' is not an executable source yet", err)
	}
}

func TestValidateLayoutsRejectsUnknownWidgetKey(t *testing.T) {
	definition := validDefinition()
	definition.MetamodelVersion = CurrentMetamodelVersion
	definition.Specification.Layouts = &FormLayouts{
		Detail: &LayoutDefinition{Default: LayoutDocument{
			Sections: []LayoutSection{
				newSection("section-detail", 3, newWidgetPlacement("placement-widget", "unknown-widget", 3)),
			},
		}},
	}
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for unknown widgetKey", err)
	}
}

func TestValidateLayoutsRejectsColumnSpanBeyondSectionColumns(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.Specification.Layouts.Create.Default.Sections[0].Placements[1].ColumnSpan = 5
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for columnSpan beyond section columns", err)
	}
}

func TestValidateLayoutsRejectsSectionColumnsOutOfRange(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.Specification.Layouts.Create.Default.Sections[0].Columns = 4
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for a section with more than 3 columns", err)
	}
}

func TestValidateLayoutsRejectsConditionOnUnknownField(t *testing.T) {
	definition := definitionWithCreateLayout()
	sections := definition.Specification.Layouts.Create.Default.Sections
	sections[0].Placements[1].VisibleWhen = &ConditionExpression{
		Field: "missing", Operator: "equals", Value: "x",
	}
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for a condition referencing an unknown field", err)
	}
}

func TestValidateLayoutsRejectsInvalidOrDuplicateAudienceKey(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.Specification.Layouts.Create.Variants = []LayoutVariant{
		{Key: "requester-view", AudienceKey: "unknown-audience", Document: validCreateLayoutDocument()},
	}
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for an unrecognized audienceKey", err)
	}

	definition = definitionWithCreateLayout()
	definition.Specification.Layouts.Create.Variants = []LayoutVariant{
		{Key: "requester-view", AudienceKey: "requester", Document: validCreateLayoutDocument()},
		{Key: "requester-view-2", AudienceKey: "requester", Document: validCreateLayoutDocument()},
	}
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for a duplicate audienceKey across variants", err)
	}
}

func TestValidateLayoutsRejectsRequiredFieldMissingFromCreateLayout(t *testing.T) {
	definition := definitionWithCreateLayout()
	sections := definition.Specification.Layouts.Create.Default.Sections
	sections[0].Placements = sections[0].Placements[:1] // drops the required "priority" placement
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `required field "priority" must be placed`) {
		t.Fatalf("Validate() error = %v, want a required-field-not-placed error", err)
	}
}

func TestValidateLayoutsRejectsRequiredFieldHiddenOnCreateLayout(t *testing.T) {
	definition := definitionWithCreateLayout()
	sections := definition.Specification.Layouts.Create.Default.Sections
	sections[0].Placements[1].VisibleWhen = &ConditionExpression{Field: "title", Operator: "exists"}
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `required field "priority" cannot have a conditional visibility`) {
		t.Fatalf("Validate() error = %v, want a required-field-hidden error", err)
	}
}

func TestValidateLayoutsRejectsReadOnlyRequiredFieldWithoutDefault(t *testing.T) {
	definition := definitionWithCreateLayout()
	sections := definition.Specification.Layouts.Create.Default.Sections
	sections[0].Placements[1].ReadOnly = true
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `required field "priority" is read-only`) {
		t.Fatalf("Validate() error = %v, want a read-only-without-default error", err)
	}
	definition.Specification.Fields[1].DefaultValue = "low"
	if err := definition.Validate(); err != nil {
		t.Fatalf("Validate() error = %v, want success once the field has a defaultValue", err)
	}
}

func TestValidateLayoutsRequiresEveryVariantToBeCreatable(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.Specification.Layouts.Create.Variants = []LayoutVariant{
		{
			Key: "requester-view", AudienceKey: "requester",
			Document: LayoutDocument{Sections: []LayoutSection{
				newSection("section-main", 1, newFieldPlacement("placement-title", "catalog", "title", 1)),
			}},
		},
	}
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `required field "priority" must be placed`) {
		t.Fatalf("Validate() error = %v, want every variant to be independently creatable", err)
	}
}

func TestCompileManifestChecksumReflectsLayoutChanges(t *testing.T) {
	definition := definitionWithCreateLayout()
	definition.ID = "definition-version-1"
	definition.Version = 1
	compiledAt := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)

	first, err := CompileManifest(definition, nil, compiledAt)
	if err != nil {
		t.Fatalf("CompileManifest() error = %v", err)
	}
	second, err := CompileManifest(definition, nil, compiledAt.Add(time.Hour))
	if err != nil {
		t.Fatalf("CompileManifest() second error = %v", err)
	}
	if first.Checksum == "" || first.Checksum != second.Checksum {
		t.Fatalf("checksum must be stable when layouts do not change: %q != %q", first.Checksum, second.Checksum)
	}

	definition.Specification.Layouts.Create.Default.Sections[0].Columns = 3
	definition.Specification.Layouts.Create.Default.Sections[0].Placements[1].ColumnSpan = 3
	changed, err := CompileManifest(definition, nil, compiledAt)
	if err != nil {
		t.Fatalf("CompileManifest() after layout change error = %v", err)
	}
	if changed.Checksum == first.Checksum {
		t.Fatal("checksum must change when layouts change")
	}
}

func TestFormLayoutsRemainValidAtFormLayoutsMetamodelVersion(t *testing.T) {
	definition := validDefinition()
	definition.MetamodelVersion = FormLayoutsMetamodelVersion
	definition.Specification.Layouts = &FormLayouts{
		Create: &LayoutDefinition{Default: validCreateLayoutDocument()},
	}
	if err := definition.Validate(); err != nil {
		t.Fatalf(
			"a %s definition with layouts.create must still validate after introducing %s: %v",
			FormLayoutsMetamodelVersion, CurrentMetamodelVersion, err,
		)
	}
	compiledAt := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	if _, err := CompileManifest(definition, nil, compiledAt); err != nil {
		t.Fatalf("CompileManifest() on a %s definition error = %v", FormLayoutsMetamodelVersion, err)
	}
}

func newPagePlacement(id string, kind PagePlacementKind, column, columnSpan, row int) PagePlacement {
	return PagePlacement{ID: id, Kind: kind, Column: column, ColumnSpan: columnSpan, Row: row}
}

func fieldPagePlacement(id, source, fieldKey string, column, columnSpan, row int) PagePlacement {
	placement := newPagePlacement(id, PagePlacementField, column, columnSpan, row)
	placement.Source = source
	placement.FieldKey = fieldKey
	return placement
}

func widgetPagePlacement(id, widgetKey string, column, columnSpan, row int) PagePlacement {
	placement := newPagePlacement(id, PagePlacementWidget, column, columnSpan, row)
	placement.WidgetKey = widgetKey
	return placement
}

func validPageLayout() PageLayout {
	return PageLayout{
		SidebarColumns: 4,
		Header: LayoutRegion{Columns: 12, Placements: []PagePlacement{
			widgetPagePlacement("placement-header", "ticketHeader", 0, 12, 0),
		}},
		Actions: LayoutRegion{Columns: 12, Placements: []PagePlacement{
			widgetPagePlacement("placement-actions", "ticketActions", 0, 12, 0),
		}},
		Main: LayoutRegion{Columns: 12, Placements: []PagePlacement{
			fieldPagePlacement("placement-title", "catalog", "title", 0, 12, 0),
		}},
		Sidebar: LayoutRegion{Columns: 12, Placements: []PagePlacement{
			widgetPagePlacement("placement-asset", "assetDetails", 0, 12, 0),
		}},
		Footer: LayoutRegion{Columns: 12},
	}
}

// definitionWithDetailPage returns a definition whose detail page is well
// formed: both required widgets present in their required regions, no
// duplicate/overflowing placements — the minimal well-formed case every
// failing test mutates.
func definitionWithDetailPage() Definition {
	definition := validDefinition()
	definition.MetamodelVersion = CurrentMetamodelVersion
	definition.Specification.DetailPage = &PageLayoutDefinition{Default: validPageLayout()}
	return definition
}

func TestDetailPageRequiresCurrentMetamodelVersion(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.MetamodelVersion = FormLayoutsMetamodelVersion
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for detailPage on an older metamodel", err)
	}
}

func TestValidateDetailPageAcceptsWellFormedPage(t *testing.T) {
	definition := definitionWithDetailPage()
	if err := definition.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestValidateDetailPageRejectsMissingTicketHeader(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Header.Placements = nil
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `required widget "ticketHeader" must be placed`) {
		t.Fatalf("Validate() error = %v, want a missing-required-widget error", err)
	}
}

func TestValidateDetailPageRejectsWidgetInDisallowedRegion(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Header.Placements = append(
		definition.Specification.DetailPage.Default.Header.Placements,
		widgetPagePlacement("placement-sla-in-header", "sla", 0, 1, 1),
	)
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `widget "sla" is not allowed in region "header"`) {
		t.Fatalf("Validate() error = %v, want a widget-not-allowed-in-region error", err)
	}
}

func TestValidateDetailPageRejectsDuplicateWidget(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Main.Placements = append(
		definition.Specification.DetailPage.Default.Main.Placements,
		widgetPagePlacement("placement-asset-2", "assetDetails", 0, 1, 1),
	)
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `widget "assetDetails" cannot be placed more than once`) {
		t.Fatalf("Validate() error = %v, want a duplicate-widget error", err)
	}
}

func TestValidateDetailPageRejectsColumnOverflow(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Main.Placements[0].ColumnSpan = 20
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for a placement wider than its region", err)
	}
}

func TestValidateDetailPageRejectsNegativeRow(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Main.Placements[0].Row = -1
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for a negative row", err)
	}
}

func TestValidateDetailPageRejectsSidebarColumnsOutOfRange(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.SidebarColumns = 6
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for sidebarColumns out of range", err)
	}
}

func TestValidateDetailPageRejectsUnknownField(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Main.Placements[0].FieldKey = "missing"
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for unknown field", err)
	}
}

func TestValidateDetailPageRejectsUnknownWidgetKey(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Sidebar.Placements[0].WidgetKey = "unknownWidget"
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for unknown widgetKey", err)
	}
}

func TestValidateDetailPageRejectsInvalidContentKind(t *testing.T) {
	definition := definitionWithDetailPage()
	contentPlacement := newPagePlacement("placement-content", PagePlacementContent, 0, 12, 1)
	contentPlacement.ContentKind = "banner"
	definition.Specification.DetailPage.Default.Main.Placements = append(
		definition.Specification.DetailPage.Default.Main.Placements, contentPlacement,
	)
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for an unsupported contentKind", err)
	}
}

func TestValidateDetailPageRejectsDuplicateFieldAcrossRegions(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Sidebar.Placements = append(
		definition.Specification.DetailPage.Default.Sidebar.Placements,
		fieldPagePlacement("placement-title-2", "catalog", "title", 0, 1, 1),
	)
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), "duplicates an existing field placement") {
		t.Fatalf("Validate() error = %v, want a duplicate-field-across-regions error", err)
	}
}

func TestValidateDetailPageRejectsConditionOnUnknownField(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.Specification.DetailPage.Default.Main.Placements[0].VisibleWhen = &ConditionExpression{
		Field: "missing", Operator: "equals", Value: "x",
	}
	if err := definition.Validate(); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("Validate() error = %v, want ErrInvalidDefinition for a condition referencing an unknown field", err)
	}
}

func TestValidateDetailPageRequiresEveryVariantToHaveRequiredWidgets(t *testing.T) {
	definition := definitionWithDetailPage()
	incompletePage := validPageLayout()
	incompletePage.Actions.Placements = nil // drops the required ticketActions widget
	definition.Specification.DetailPage.Variants = []PageLayoutVariant{
		{Key: "requester-view", AudienceKey: "requester", Page: incompletePage},
	}
	err := definition.Validate()
	if !errors.Is(err, ErrInvalidDefinition) ||
		!strings.Contains(err.Error(), `required widget "ticketActions" must be placed`) {
		t.Fatalf("Validate() error = %v, want every variant to require ticketActions too", err)
	}
}

func TestCompileManifestChecksumReflectsDetailPageChanges(t *testing.T) {
	definition := definitionWithDetailPage()
	definition.ID = "definition-version-1"
	definition.Version = 1
	compiledAt := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)

	first, err := CompileManifest(definition, nil, compiledAt)
	if err != nil {
		t.Fatalf("CompileManifest() error = %v", err)
	}
	second, err := CompileManifest(definition, nil, compiledAt.Add(time.Hour))
	if err != nil {
		t.Fatalf("CompileManifest() second error = %v", err)
	}
	if first.Checksum == "" || first.Checksum != second.Checksum {
		t.Fatalf("checksum must be stable when detailPage does not change: %q != %q", first.Checksum, second.Checksum)
	}

	definition.Specification.DetailPage.Default.SidebarColumns = 5
	changed, err := CompileManifest(definition, nil, compiledAt)
	if err != nil {
		t.Fatalf("CompileManifest() after detailPage change error = %v", err)
	}
	if changed.Checksum == first.Checksum {
		t.Fatal("checksum must change when detailPage changes")
	}
}

func TestTransitionIsDrivenByDefinition(t *testing.T) {
	definition := validDefinition()
	next, err := definition.Transition("open", "resolve")
	if err != nil {
		t.Fatalf("Transition() error = %v", err)
	}
	if next != "resolved" {
		t.Fatalf("Transition() = %q, want resolved", next)
	}
	if _, err := definition.Transition("resolved", "resolve"); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Transition() error = %v, want ErrInvalidTransition", err)
	}
}
