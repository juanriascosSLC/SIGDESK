package domain

import (
	"testing"
	"time"
)

func TestBusinessCalendarSkipsWeekend(t *testing.T) {
	calendar := Calendar{
		Timezone: "America/Bogota",
		Windows: []BusinessWindow{
			{Weekday: 1, Start: "08:00", End: "18:00"},
			{Weekday: 2, Start: "08:00", End: "18:00"},
			{Weekday: 3, Start: "08:00", End: "18:00"},
			{Weekday: 4, Start: "08:00", End: "18:00"},
			{Weekday: 5, Start: "08:00", End: "18:00"},
		},
	}
	location, err := time.LoadLocation("America/Bogota")
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(2026, 7, 31, 17, 0, 0, 0, location) // Friday.
	due, err := calendar.Add(start, 120)
	if err != nil {
		t.Fatal(err)
	}
	expected := time.Date(2026, 8, 3, 9, 0, 0, 0, location)
	if !due.Equal(expected) {
		t.Fatalf("calendar.Add() = %s, want %s", due, expected)
	}
}

func TestAssessmentReportsLiveBreachesWithoutMutatingItsDeadline(t *testing.T) {
	startedAt := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	assessment := Assessment{
		StartedAt:       startedAt,
		ResponseDueAt:   startedAt.Add(15 * time.Minute),
		ResolutionDueAt: startedAt.Add(4 * time.Hour),
	}
	current := assessment.At(startedAt.Add(30 * time.Minute))
	if !current.ResponseBreached || current.ResolutionBreached {
		t.Fatalf("Assessment.At() returned unexpected breach state: %#v", current)
	}
	if assessment.ResponseBreached {
		t.Fatal("Assessment.At() mutated the persisted assessment")
	}

	pausedAt := startedAt.Add(10 * time.Minute)
	assessment.PausedAt = &pausedAt
	current = assessment.At(startedAt.Add(24 * time.Hour))
	if current.ResponseBreached || current.ResolutionBreached {
		t.Fatalf("paused assessment kept consuming time: %#v", current)
	}
}
