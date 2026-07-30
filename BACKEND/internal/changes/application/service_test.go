package application

import (
	"errors"
	"testing"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
)

func TestCalculateRiskUsesOwnedMatrix(t *testing.T) {
	tests := []struct {
		name       string
		impact     string
		urgency    string
		likelihood string
		expected   string
	}{
		{name: "low", impact: "low", urgency: "low", likelihood: "low", expected: "low"},
		{name: "medium", impact: "medium", urgency: "medium", likelihood: "medium", expected: "medium"},
		{name: "high", impact: "high", urgency: "medium", likelihood: "medium", expected: "high"},
		{name: "critical", impact: "critical", urgency: "high", likelihood: "high", expected: "critical"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := CalculateRisk(map[string]any{
				"impact": test.impact, "urgency": test.urgency, "likelihood": test.likelihood,
			})
			if err != nil || actual != test.expected {
				t.Fatalf("CalculateRisk() = %q, %v; want %q", actual, err, test.expected)
			}
		})
	}
}

func TestTransitionPreconditionsProtectCABAndImplementationFlow(t *testing.T) {
	if err := validateTransitionData("request_approval", map[string]any{}); !errors.Is(err, catalogDomain.ErrInvalidTransition) {
		t.Fatalf("request_approval without plans error = %v", err)
	}
	if err := validateTransitionData("request_approval", map[string]any{
		"implementationPlan": "Deploy", "rollbackPlan": "Restore", "testPlan": "Smoke tests",
	}); err != nil {
		t.Fatalf("request_approval with plans error = %v", err)
	}
	if err := validateTransitionData("schedule", map[string]any{
		"plannedStart": "2026-08-01T10:00:00Z",
		"plannedEnd":   "2026-08-01T09:00:00Z",
	}); !errors.Is(err, catalogDomain.ErrInvalidTransition) {
		t.Fatalf("schedule with invalid window error = %v", err)
	}
	if err := validateTransitionData("schedule", map[string]any{
		"plannedStart": "2026-08-01T09:00:00Z",
		"plannedEnd":   "2026-08-01T10:00:00Z",
	}); err != nil {
		t.Fatalf("schedule with valid window error = %v", err)
	}
}
