package domain

import (
	"reflect"
	"testing"
)

func TestNormalizeActivityEntryMergedIDs(t *testing.T) {
	tests := []struct {
		name  string
		value any
		want  []string
	}{
		{
			name:  "legacy scalar",
			value: "INC-000002",
			want:  []string{"INC-000002"},
		},
		{
			name:  "current array",
			value: []any{"INC-000002", "INC-000003"},
			want:  []string{"INC-000002", "INC-000003"},
		},
		{
			name:  "json encoded array",
			value: `["INC-000002","INC-000003"]`,
			want:  []string{"INC-000002", "INC-000003"},
		},
		{
			name:  "comma separated legacy value",
			value: "INC-000002, INC-000003",
			want:  []string{"INC-000002", "INC-000003"},
		},
		{
			name:  "invalid value",
			value: map[string]any{"id": "INC-000002"},
			want:  []string{},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			originalPayload := map[string]any{"mergedIds": test.value}
			entry := NormalizeActivityEntry(ActivityEntry{
				Kind:    ActivityMerged,
				Payload: originalPayload,
			})

			if entry.ContractVersion != ActivityContractVersion {
				t.Fatalf("ContractVersion = %d, want %d", entry.ContractVersion, ActivityContractVersion)
			}
			got, ok := entry.Payload["mergedIds"].([]string)
			if !ok {
				t.Fatalf("mergedIds type = %T, want []string", entry.Payload["mergedIds"])
			}
			if !reflect.DeepEqual(got, test.want) {
				t.Fatalf("mergedIds = %#v, want %#v", got, test.want)
			}
			if reflect.DeepEqual(originalPayload["mergedIds"], got) {
				t.Fatalf("normalization mutated the repository payload")
			}
		})
	}
}

func TestNormalizeActivityEntryProvidesEmptyPayload(t *testing.T) {
	entry := NormalizeActivityEntry(ActivityEntry{
		Kind:    ActivityWatcherAdded,
		Payload: nil,
	})

	if entry.ContractVersion != ActivityContractVersion {
		t.Fatalf("ContractVersion = %d, want %d", entry.ContractVersion, ActivityContractVersion)
	}
	if entry.Payload == nil {
		t.Fatal("Payload is nil, want an empty object")
	}
}
