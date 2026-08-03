package buildinfo_test

import (
	"testing"
	"time"

	"sig-desk/backend/internal/platform/buildinfo"
)

func TestBuildInfo_Defaults(t *testing.T) {
	info := buildinfo.Get()

	if info.Version != "dev" {
		t.Errorf("expected default Version to be 'dev', got %q", info.Version)
	}
	if info.Commit != "unknown" {
		t.Errorf("expected default Commit to be 'unknown', got %q", info.Commit)
	}
	if info.BuildTime != "unknown" {
		t.Errorf("expected default BuildTime to be 'unknown', got %q", info.BuildTime)
	}
}

func TestBuildInfo_IsRFC3339(t *testing.T) {
	valid := time.Now().UTC().Format(time.RFC3339)
	if !buildinfo.IsRFC3339(valid) {
		t.Errorf("expected %q to be valid RFC3339 UTC", valid)
	}

	invalidCases := []string{
		"2026-07-31",
		"unknown",
		"2026-07-31 15:30:00",
		"2026-07-31T15:30:00+05:00", // Non-UTC offset
	}

	for _, tc := range invalidCases {
		if buildinfo.IsRFC3339(tc) {
			t.Errorf("expected %q to be invalid RFC3339 UTC", tc)
		}
	}
}
