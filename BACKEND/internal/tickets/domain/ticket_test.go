package domain

import "testing"

func TestTicketStatusTransitions(t *testing.T) {
	tests := []struct {
		name string
		from Status
		to   Status
		want bool
	}{
		{name: "open to in progress", from: StatusOpen, to: StatusInProgress, want: true},
		{name: "pending review to resolved", from: StatusPendingReview, to: StatusResolved, want: true},
		{name: "resolved can reopen", from: StatusResolved, to: StatusOpen, want: true},
		{name: "open cannot skip to pending review", from: StatusOpen, to: StatusPendingReview, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := CanTransition(test.from, test.to); got != test.want {
				t.Fatalf("CanTransition(%q, %q) = %v, want %v", test.from, test.to, got, test.want)
			}
		})
	}
}
