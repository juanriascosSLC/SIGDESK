package migrations

import (
	"crypto/sha256"
	"fmt"
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
	"000020_create_catalog_layout_versions.up.sql",
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

// TestHistoricalMigrationChecksumsMatchGoldenManifest asserts that published
// historical migration files (*.up.sql) remain strictly immutable. Any modification
// to a published migration file causes this test to fail loudly.
func TestHistoricalMigrationChecksumsMatchGoldenManifest(t *testing.T) {
	goldenHashes := map[string]string{
		"000001_create_tickets.up.sql":                    "ab13c26e3685ab2117da5450edd39bfe2372ae387a0628f06e6dcb8567218826",
		"000002_seed_demo.up.sql":                         "fc6772697bcdd515795edfe45bf97c830ea95f844ae88a9b549c41d3e1fd6186",
		"000003_create_catalog_metamodel.up.sql":          "4d12db1cf8c80fad6a428beb75eec524a36c58e8950a8c881a1ede2963191765",
		"000004_extend_incident_catalog_fields.up.sql":    "b95ec7f31a6f51917f51f33f7f19852b5e029f4ba4933c41b230ba769d6f7504",
		"000005_ticket_core_features.up.sql":              "f4d7ade7987ea0fb38eee3af33c2c4e3bce9e27320c6b00e2a61243f93a30508",
		"000006_executable_catalog_definitions.up.sql":    "13b219b3ee969eaacaef9655e52c4064c860d5ea935e65bdab8f86986bcb20de",
		"000007_catalog_transactional_outbox.up.sql":      "37778e1be16e315a13855c8e4fd2e234296a6e016a1da8645604bb8303a6a917",
		"000008_ticket_catalog_event_projection.up.sql":   "37099264c40dc5a8dde60452e96f783f0891539ef20e40b63df8bee10464d47a",
		"000009_create_sla_engine.up.sql":                 "c23ef01daa3141f4731af3c33bc29936fbfd8f96a7c0d00784db82dc1308bcf2",
		"000010_align_ticket_ids_and_lifecycle.up.sql":    "aa46359814a048abf7b0a6eaaffb26605f6f26103e5dfa773cb59188595c19f8",
		"000011_repair_catalog_ticket_projections.up.sql": "ed3106a25ba123c82316847f25c64a351c7d6b8aca2ab59d696a167b7a94f024",
		"000012_create_rbac.up.sql":                       "66ea65c627c2ea5046c4bef85cb3fd2cd6312f5048973f16329887e5915552cb",
		"000013_ticket_field_update_activity.up.sql":      "ed5ac964d85085a63926d29f0d4c2d14fb379b23c0db47c7b74bc3b323c4d226",
		"000014_normalize_ticket_activity_contract.up.sql": "41822cf38b587daf1f73d95bc0b7d8f65a2bc9ca65c55c4071c2fb7f2e5d0aef",
		"000015_create_entity_relations.up.sql":           "d5c22d5c7f9e91f167fe066bcffb9938b792857ea1e4bdd9cc38e25b77316117",
		"000016_seed_problem_permissions.up.sql":          "a3d8770beb471b2dc405364cf4d91b5f8a40224b55c673561a60b1b358c1654c",
		"000017_single_active_catalog_draft.up.sql":       "18b16fb5bc859be1d7ce7417b456b42c83173a1a3e7663dac12f6f88cefc6c86",
		"000018_catalog_idempotency_keys.up.sql":          "395c58c70407e785954cf25b24fd58f4667c02dfe499b5e3d9e729087ba212eb",
		"000019_remove_legacy_demo_data.up.sql":           "69735799508ca2e898c8382436736c381b978c4c90175b41571865a6a2c532ba",
		"000020_create_catalog_layout_versions.up.sql":    "d42086b8b710e0e365c03150a52105e050762802ec51f23e9767560232eeb907",
	}

	for name, wantHash := range goldenHashes {
		body, err := files.ReadFile(name)
		if err != nil {
			t.Fatalf("read migration %s: %v", name, err)
		}
		gotHash := fmt.Sprintf("%x", sha256.Sum256(body))
		if gotHash != wantHash {
			t.Fatalf("migration %s was modified after publication (got sha256 %s, want %s)", name, gotHash, wantHash)
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
