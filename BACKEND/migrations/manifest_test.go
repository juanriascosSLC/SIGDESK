package migrations

import (
	"sort"
	"strings"
	"testing"
)

// wantMigrations is the exact, ordered manifest of migrations that exist.
//
// It is a golden list because schema_migrations is keyed by FILENAME (see
// applyFS in embed.go): renaming a file that any database has already
// applied makes it run a SECOND time under the new name. Adding a migration
// means appending one line here, on purpose. Renaming one fails this test,
// on purpose.
var wantMigrations = []string{
	"000001_create_tickets.up.sql",
	"000002_seed_demo.up.sql",
	"000003_create_catalog_metamodel.up.sql",
	"000004_extend_incident_catalog_fields.up.sql",
	"000005_ticket_core_features.up.sql",
	"000006_executable_catalog_definitions.up.sql",
	"000007_catalog_transactional_outbox.up.sql",
	"000008_ticket_catalog_event_projection.up.sql",
	"000009_create_sla_engine.up.sql",
	"000010_align_ticket_ids_and_lifecycle.up.sql",
	"000011_repair_catalog_ticket_projections.up.sql",
	"000012_create_rbac.up.sql",
	"000013_ticket_field_update_activity.up.sql",
	"000014_normalize_ticket_activity_contract.up.sql",
	"000015_create_entity_relations.up.sql",
	"000016_seed_problem_permissions.up.sql",
	"000017_single_active_catalog_draft.up.sql",
	"000018_catalog_idempotency_keys.up.sql",
	"000019_remove_legacy_demo_data.up.sql",
}

func embeddedNames(t *testing.T) []string {
	t.Helper()
	entries, err := files.ReadDir(".")
	if err != nil {
		t.Fatalf("read embedded migrations: %v", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names) // exactly what applyFS does.
	return names
}

func TestEmbeddedMigrationsMatchTheGoldenManifest(t *testing.T) {
	got := embeddedNames(t)
	if len(got) != len(wantMigrations) {
		t.Fatalf("migration count changed: got %d, want %d\ngot:  %v\nwant: %v",
			len(got), len(wantMigrations), got, wantMigrations)
	}
	for i := range got {
		if got[i] != wantMigrations[i] {
			t.Fatalf("migration %d is %q, manifest says %q.\n"+
				"If you RENAMED a file, undo it: schema_migrations is keyed by name, so every "+
				"existing database would re-run it under the new name. If you ADDED one, append "+
				"it to wantMigrations.",
				i, got[i], wantMigrations[i])
		}
	}
}

// TestNoNewDuplicateNumericPrefixes rejects ANY duplicate numeric prefix with
// zero exceptions. The one duplicate this repository ever had
// (000012_catalog_idempotency_keys vs 000012_create_rbac) was resolved by
// renaming the former to 000018 rather than grandfathered here, precisely so
// this test never needs a special case again.
func TestNoNewDuplicateNumericPrefixes(t *testing.T) {
	counts := map[string][]string{}
	for _, name := range embeddedNames(t) {
		prefix, _, found := strings.Cut(name, "_")
		if !found || len(prefix) != 6 {
			t.Fatalf("migration %q does not start with a 6-digit prefix", name)
		}
		counts[prefix] = append(counts[prefix], name)
	}
	for prefix, names := range counts {
		if len(names) > 1 {
			t.Errorf("prefix %s is used by %d migrations (%v); pick the next free number instead — "+
				"the runner orders by full filename, so a collision makes the relative order of two "+
				"migrations depend on their descriptions rather than their numbers",
				prefix, len(names), names)
		}
	}
}

// TestRBACTablesAreCreatedBeforeTheyAreSeeded derives the dependency from the
// SQL itself (who creates rbac_role_permissions vs. who inserts into it)
// rather than hard-coding "12 before 16", so it keeps holding as migrations
// are added or renumbered.
func TestRBACTablesAreCreatedBeforeTheyAreSeeded(t *testing.T) {
	const table = "rbac_role_permissions"
	creator, creatorIndex := "", -1
	readers := map[string]int{}

	for i, name := range embeddedNames(t) {
		body, err := files.ReadFile(name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		sql := strings.ToLower(string(body))
		switch {
		case strings.Contains(sql, "create table if not exists "+table),
			strings.Contains(sql, "create table "+table):
			if creatorIndex >= 0 {
				t.Fatalf("%s is created by both %s and %s", table, creator, name)
			}
			creator, creatorIndex = name, i
		case strings.Contains(sql, "insert into "+table):
			readers[name] = i
		}
	}
	if creatorIndex < 0 {
		t.Fatalf("no migration creates %s; did it get renamed?", table)
	}
	for reader, index := range readers {
		if index < creatorIndex {
			t.Errorf("%s (position %d) writes to %s but %s (position %d) creates it: "+
				"a FRESH database would fail on a missing relation",
				reader, index, table, creator, creatorIndex)
		}
	}
}
