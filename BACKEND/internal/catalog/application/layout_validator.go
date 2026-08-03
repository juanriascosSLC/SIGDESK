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
				PlacementID:           pID,
				Kind:                  kind,
				Source:                source,
				FieldID:               fieldID,
				FieldType:             fieldType,
				WidgetKey:             widgetKey,
				WidgetContractVersion: "1.0",
				Region:                region,
				AudienceKey:           audienceKey,
				RequiredPermissions:   reqPerms,
				AllowMultiple:         false,
			})
		}
	}

	var inspectPageLayout func(pageMap map[string]any, audienceKey string)
	inspectPageLayout = func(pageMap map[string]any, audienceKey string) {
		regSource := pageMap
		if regions, ok := pageMap["regions"].(map[string]any); ok {
			regSource = regions
		}
		for _, regName := range []string{"header", "actions", "main", "sidebar", "footer"} {
			if regVal, ok := regSource[regName].(map[string]any); ok {
				if rawP, ok := regVal["placements"].([]any); ok {
					extractFromPlacements(rawP, regName, audienceKey)
				}
			}
		}
	}

	var inspectSections func(sections []any, audienceKey string)
	inspectSections = func(sections []any, audienceKey string) {
		for _, s := range sections {
			sMap, ok := s.(map[string]any)
			if !ok {
				continue
			}
			if rawP, ok := sMap["placements"].([]any); ok {
				extractFromPlacements(rawP, "main", audienceKey)
			}
		}
	}

	if detail, ok := doc["detail"].(map[string]any); ok {
		if defPage, ok := detail["default"].(map[string]any); ok {
			inspectPageLayout(defPage, "default")
			if variants, ok := detail["variants"].([]any); ok {
				for _, v := range variants {
					if vMap, ok := v.(map[string]any); ok {
						audKey, _ := vMap["audienceKey"].(string)
						if pMap, ok := vMap["page"].(map[string]any); ok {
							inspectPageLayout(pMap, audKey)
						}
					}
				}
			}
		} else if sections, ok := detail["sections"].([]any); ok {
			inspectSections(sections, "default")
			if variants, ok := detail["variants"].([]any); ok {
				for _, v := range variants {
					if vMap, ok := v.(map[string]any); ok {
						audKey, _ := vMap["audienceKey"].(string)
						if docMap, ok := vMap["document"].(map[string]any); ok {
							if vSections, ok := docMap["sections"].([]any); ok {
								inspectSections(vSections, audKey)
							}
						}
					}
				}
			}
		} else {
			inspectPageLayout(detail, "default")
		}
	} else if detailPage, ok := doc["detailPage"].(map[string]any); ok {
		if defPage, ok := detailPage["default"].(map[string]any); ok {
			inspectPageLayout(defPage, "default")
		} else {
			inspectPageLayout(detailPage, "default")
		}
	}

	return &domain.CompatibilityFingerprint{
		Placements:       placements,
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
	row := 0
	for _, f := range manifest.Specification.Fields {
		// "title" is always shown by the mandatory ticketHeader widget above
		// (see pageWidgetRule for "ticketHeader" and TicketHeaderWidget.tsx),
		// so it is deliberately excluded here — matching the pre-existing
		// convention in defaultDetailPlacements (page-layout-normalizer.ts),
		// which never lists "title" either. Including it would duplicate the
		// page heading in the body.
		if f.Key == "title" {
			continue
		}
		fieldPlacements = append(fieldPlacements, map[string]any{
			"id":         fmt.Sprintf("placement-%d", row+1),
			"kind":       "field",
			"source":     "catalog",
			"fieldId":    f.FieldID(),
			"fieldKey":   f.Key,
			"column":     0,
			"columnSpan": 12,
			"row":        row,
		})
		row++
	}

	// Mirrors synthesizePageLayoutFromLegacy (page-layout-normalizer.ts): every
	// entity gets itsmRelations unconditionally, mergedTickets only when the
	// legacy detailLayout config actually wired up a mergedCount placement,
	// and sla/attachments/activity respect their show* toggles (nil means the
	// field was never set, which defaults to shown — same as the TS `?? true`).
	detailLayout := manifest.Specification.DetailLayout
	showSLA := detailLayout == nil || detailLayout.ShowSLA == nil || *detailLayout.ShowSLA
	showAttachments := detailLayout == nil || detailLayout.ShowAttachments == nil || *detailLayout.ShowAttachments
	showActivity := detailLayout == nil || detailLayout.ShowActivity == nil || *detailLayout.ShowActivity
	mergedConfigured := false
	if detailLayout != nil {
		for _, placement := range detailLayout.Fields {
			if placement.Source == "ticket" && placement.FieldKey == "mergedCount" {
				mergedConfigured = true
				break
			}
		}
	}

	var sidebarPlacements []map[string]any
	sidebarRow := 0
	if mergedConfigured {
		sidebarPlacements = append(sidebarPlacements, map[string]any{
			"id": "widget-mergedTickets", "kind": "widget", "widgetKey": "mergedTickets",
			"column": 0, "columnSpan": 12, "row": sidebarRow,
		})
		sidebarRow++
	}
	sidebarPlacements = append(sidebarPlacements, map[string]any{
		"id": "widget-itsmRelations", "kind": "widget", "widgetKey": "itsmRelations",
		"column": 0, "columnSpan": 12, "row": sidebarRow,
	})
	sidebarRow++
	if showSLA {
		sidebarPlacements = append(sidebarPlacements, map[string]any{
			"id": "widget-sla", "kind": "widget", "widgetKey": "sla",
			"column": 0, "columnSpan": 12, "row": sidebarRow,
		})
		sidebarRow++
	}
	if showAttachments {
		sidebarPlacements = append(sidebarPlacements, map[string]any{
			"id": "widget-attachments", "kind": "widget", "widgetKey": "attachments",
			"column": 0, "columnSpan": 12, "row": sidebarRow,
		})
		sidebarRow++
	}
	if showActivity {
		sidebarPlacements = append(sidebarPlacements, map[string]any{
			"id": "widget-activity", "kind": "widget", "widgetKey": "activity",
			"column": 0, "columnSpan": 12, "row": sidebarRow,
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
					"columns":    12,
					"placements": sidebarPlacements,
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
