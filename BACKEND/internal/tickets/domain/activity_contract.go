package domain

import (
	"encoding/json"
	"strings"
)

// ActivityContractVersion is the public API contract implemented by the
// activity payloads below. Persistence remains adapter-owned; callers always
// receive a normalized version of the contract through the application layer.
const ActivityContractVersion = 1

type CreatedActivityPayloadV1 struct {
	Priority string `json:"priority,omitempty"`
	Category string `json:"category,omitempty"`
}

type StatusChangedActivityPayloadV1 struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Source string `json:"source,omitempty"`
}

type AssignedActivityPayloadV1 struct {
	AssigneeName *string `json:"assigneeName"`
}

type CommentedActivityPayloadV1 struct {
	IsInternal bool `json:"isInternal"`
}

type AttachedActivityPayloadV1 struct {
	FileName  string `json:"fileName"`
	SizeBytes int64  `json:"sizeBytes"`
}

type MergedActivityPayloadV1 struct {
	MergedIDs  []string `json:"mergedIds,omitempty"`
	MergedInto string   `json:"mergedInto,omitempty"`
}

type UnmergedActivityPayloadV1 struct {
	UnmergedID   string `json:"unmergedId,omitempty"`
	UnmergedFrom string `json:"unmergedFrom,omitempty"`
}

type FieldsUpdatedActivityPayloadV1 struct {
	Fields []string `json:"fields"`
}

// NormalizeActivityEntry establishes the external v1 contract independently
// from historical storage shapes. In particular, migration 000005 persisted
// mergedIds as a scalar while current writers persist an array.
func NormalizeActivityEntry(entry ActivityEntry) ActivityEntry {
	entry.ContractVersion = ActivityContractVersion
	entry.Payload = cloneActivityPayload(entry.Payload)

	switch entry.Kind {
	case ActivityMerged:
		if _, exists := entry.Payload["mergedIds"]; exists {
			entry.Payload["mergedIds"] = normalizeActivityStringList(entry.Payload["mergedIds"])
		}
	case ActivityFieldsUpdated:
		if _, exists := entry.Payload["fields"]; exists {
			entry.Payload["fields"] = normalizeActivityStringList(entry.Payload["fields"])
		}
	}

	return entry
}

func cloneActivityPayload(payload map[string]any) map[string]any {
	if payload == nil {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(payload))
	for key, value := range payload {
		cloned[key] = value
	}
	return cloned
}

func normalizeActivityStringList(value any) []string {
	switch typed := value.(type) {
	case []string:
		return cleanActivityStrings(typed)
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok {
				items = append(items, text)
			}
		}
		return cleanActivityStrings(items)
	case string:
		raw := strings.TrimSpace(typed)
		if raw == "" {
			return []string{}
		}
		if strings.HasPrefix(raw, "[") {
			var decoded []string
			if json.Unmarshal([]byte(raw), &decoded) == nil {
				return cleanActivityStrings(decoded)
			}
		}
		return cleanActivityStrings(strings.Split(raw, ","))
	default:
		return []string{}
	}
}

func cleanActivityStrings(values []string) []string {
	cleaned := make([]string, 0, len(values))
	for _, value := range values {
		if normalized := strings.TrimSpace(value); normalized != "" {
			cleaned = append(cleaned, normalized)
		}
	}
	return cleaned
}
