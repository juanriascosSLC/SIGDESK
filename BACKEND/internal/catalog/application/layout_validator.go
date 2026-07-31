package application

import (
	"fmt"

	"sig-desk/backend/internal/catalog/domain"
	identityDomain "sig-desk/backend/internal/identity/domain"
)

type LayoutValidator struct{}

func NewLayoutValidator() *LayoutValidator {
	return &LayoutValidator{}
}

func (v *LayoutValidator) ValidateCompatibility(
	doc map[string]any,
	manifest domain.ExecutableDefinitionManifest,
) error {
	fingerprint := v.DeriveCompatibility(doc, manifest)
	if !v.IsCompatible(fingerprint, manifest) {
		return fmt.Errorf("layout document references fields or widgets incompatible with manifest %s", manifest.DefinitionVersionID)
	}
	return nil
}

func (v *LayoutValidator) DeriveCompatibility(
	doc map[string]any,
	manifest domain.ExecutableDefinitionManifest,
) *domain.CompatibilityFingerprint {
	fieldByID := make(map[string]domain.FieldDefinition)
	for _, f := range manifest.Specification.Fields {
		fieldByID[f.FieldID()] = f
		fieldByID[f.Key] = f
	}

	var placements []domain.CompatibilityPlacement
	var extractFromPlacements func(rawPlacements []any, region string, audienceKey string)

	extractFromPlacements = func(rawPlacements []any, region string, audienceKey string) {
		for _, rawP := range rawPlacements {
			pMap, ok := rawP.(map[string]any)
			if !ok {
				continue
			}
			pID, _ := pMap["id"].(string)
			kind, _ := pMap["kind"].(string)
			source, _ := pMap["source"].(string)
			fieldKey, _ := pMap["fieldKey"].(string)
			fieldID, _ := pMap["fieldId"].(string)
			if fieldID == "" {
				fieldID = fieldKey
			}
			widgetKey, _ := pMap["widgetKey"].(string)

			fieldType := ""
			if fDef, found := fieldByID[fieldID]; found {
				fieldType = fDef.Type
			}

			reqPerms := []string{identityDomain.PermTicketsView}
			if source == "catalog" && fieldID != "" {
				reqPerms = append(reqPerms, identityDomain.PermCatalogView)
			}

			placements = append(placements, domain.CompatibilityPlacement{
				PlacementID:          pID,
				Kind:                 kind,
				Source:               source,
				FieldID:              fieldID,
				FieldType:            fieldType,
				WidgetKey:            widgetKey,
				WidgetContractVersion: "1.0",
				Region:               region,
				AudienceKey:          audienceKey,
				RequiredPermissions:  reqPerms,
				AllowMultiple:        false,
			})
		}
	}

	// Parse detail layout / page layout / sections if present
	if detail, ok := doc["detail"].(map[string]any); ok {
		if regions, ok := detail["regions"].(map[string]any); ok {
			for regName, regVal := range regions {
				if rMap, ok := regVal.(map[string]any); ok {
					if rawP, ok := rMap["placements"].([]any); ok {
						extractFromPlacements(rawP, regName, "default")
					}
				}
			}
		}
	}

	return &domain.CompatibilityFingerprint{
		Placements:      placements,
		MandatoryWidgets: []string{"ticketHeader", "ticketActions"},
	}
}

func (v *LayoutValidator) IsCompatible(
	compat *domain.CompatibilityFingerprint,
	manifest domain.ExecutableDefinitionManifest,
) bool {
	if compat == nil {
		return false
	}
	fields := make(map[string]bool)
	for _, f := range manifest.Specification.Fields {
		fields[f.FieldID()] = true
		fields[f.Key] = true
	}

	for _, p := range compat.Placements {
		if p.Kind == "field" && p.Source == "catalog" && p.FieldID != "" {
			if !fields[p.FieldID] {
				return false
			}
		}
	}
	return true
}

func (v *LayoutValidator) SynthesizeFromManifest(manifest domain.ExecutableDefinitionManifest) map[string]any {
	var fieldPlacements []map[string]any
	for i, f := range manifest.Specification.Fields {
		fieldPlacements = append(fieldPlacements, map[string]any{
			"id":         fmt.Sprintf("placement-%d", i+1),
			"kind":       "field",
			"source":     "catalog",
			"fieldId":    f.FieldID(),
			"fieldKey":   f.Key,
			"column":     0,
			"columnSpan": 12,
			"row":        i,
		})
	}

	return map[string]any{
		"detail": map[string]any{
			"default": map[string]any{
				"sidebarColumns": 4,
				"header": map[string]any{
					"columns": 12,
					"placements": []map[string]any{
						{"id": "hdr-1", "kind": "widget", "widgetKey": "ticketHeader", "column": 0, "columnSpan": 12, "row": 0},
					},
				},
				"actions": map[string]any{
					"columns": 12,
					"placements": []map[string]any{
						{"id": "act-1", "kind": "widget", "widgetKey": "ticketActions", "column": 0, "columnSpan": 12, "row": 0},
					},
				},
				"main": map[string]any{
					"columns":    12,
					"placements": fieldPlacements,
				},
				"sidebar": map[string]any{
					"columns": 12,
					"placements": []map[string]any{
						{"id": "sla-1", "kind": "widget", "widgetKey": "sla", "column": 0, "columnSpan": 12, "row": 0},
					},
				},
				"footer": map[string]any{
					"columns":    12,
					"placements": []map[string]any{},
				},
			},
		},
	}
}

// Convert map to canonical JSON string
func CanonicalString(v any) (string, error) {
	b, err := domain.CanonicalJSON(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
