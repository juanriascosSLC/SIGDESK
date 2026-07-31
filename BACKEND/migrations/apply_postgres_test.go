package migrations

import (
	"context"
	"fmt"
	"io/fs"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"sig-desk/backend/internal/platform/testsupport/pgtest"
)

// demoHumanIDs is the exact, explicit set of ticket ids that
// 000002_seed_demo.up.sql and 000005_ticket_core_features.up.sql insert, and
// that 000019_remove_legacy_demo_data.up.sql removes. Kept here, not derived,
// so a change to either migration's demo dataset makes these tests fail
// loudly instead of silently testing the wrong thing.
var demoHumanIDs = []string{
	"INC-000001", "INC-000002", "INC-000003", "INC-000004",
	"INC-202611", "INC-202612", "INC-202613",
}

// subsetFS materializes a prefix of the real embedded migrations (identical
// bytes, same names) as an in-memory filesystem, so applyFS can be driven
// against "an older deployment mid-upgrade" without touching the real files.
func subsetFS(t *testing.T, names []string) fs.FS {
	t.Helper()
	return renamedFS(t, names, nil)
}

// renamedFS materializes the given migration names as an in-memory
// filesystem. sourceOf optionally maps a name to the ACTUAL embedded filename
// to read its bytes from — used to simulate a historical filename that no
// longer exists post-rename, reusing the renamed file's identical content
// instead of duplicating SQL in the test.
func renamedFS(t *testing.T, names []string, sourceOf map[string]string) fs.FS {
	t.Helper()
	mapFS := fstest.MapFS{}
	for _, name := range names {
		sourceName := name
		if mapped, ok := sourceOf[name]; ok {
			sourceName = mapped
		}
		body, err := files.ReadFile(sourceName)
		if err != nil {
			t.Fatalf("read %s (as %s): %v", sourceName, name, err)
		}
		mapFS[name] = &fstest.MapFile{Data: body}
	}
	return mapFS
}

// assertHistory checks schema_migrations contains exactly `want`, in the
// order it was applied.
func assertHistory(t *testing.T, pool *pgxpool.Pool, want []string) {
	t.Helper()
	rows, err := pool.Query(context.Background(), `SELECT name FROM schema_migrations ORDER BY applied_at, name`)
	if err != nil {
		t.Fatalf("query schema_migrations: %v", err)
	}
	defer rows.Close()

	var got []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan schema_migrations row: %v", err)
		}
		got = append(got, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate schema_migrations: %v", err)
	}

	if len(got) != len(want) {
		t.Fatalf("schema_migrations has %d rows, want %d\ngot:  %v\nwant: %v", len(got), len(want), got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("schema_migrations[%d] = %q, want %q\ngot:  %v\nwant: %v", i, got[i], want[i], got, want)
		}
	}
}

// TestApplyOnEmptyDatabaseReachesTheFullSchema is the fresh-install path: the
// one every new deployment takes and the one nothing covered before this PR.
func TestApplyOnEmptyDatabaseReachesTheFullSchema(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)

	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("apply on empty database: %v", err)
	}

	assertHistory(t, pool, wantMigrations)

	for _, relation := range []string{
		"schema_migrations", "tickets", "ticket_comments", "ticket_attachments",
		"ticket_watchers", "ticket_activity", "catalog_definitions", "entity_records",
		"catalog_event_outbox", "catalog_projected_events", "sla_policies",
		"sla_assessments", "sla_processed_events", "catalog_idempotency_keys",
		"rbac_roles", "rbac_role_permissions", "rbac_user_roles", "rbac_known_users",
		"catalog_entity_relations",
	} {
		var exists *string
		if err := pool.QueryRow(ctx, `SELECT to_regclass($1)::text`, relation).Scan(&exists); err != nil {
			t.Fatalf("to_regclass(%s): %v", relation, err)
		}
		if exists == nil {
			t.Errorf("relation %s does not exist after a full migration run", relation)
		}
	}

	// 000019 runs as part of a single fresh Apply, so a brand-new database
	// never carries the demo tickets at all — this is the "las bases nuevas
	// no deben recibir datos demo automáticamente" requirement.
	var demoCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE human_id = ANY($1)`, demoHumanIDs).Scan(&demoCount); err != nil {
		t.Fatalf("count demo tickets: %v", err)
	}
	if demoCount != 0 {
		t.Errorf("fresh database still has %d demo tickets after Apply", demoCount)
	}

	// The 000012-before-000016 ordering constraint, observed rather than
	// asserted structurally: if create_rbac ever sorted after the permission
	// seed, this SELECT would match no role and the count would be zero.
	var granted int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM rbac_role_permissions AS grant_row
		JOIN rbac_roles AS role ON role.id = grant_row.role_id
		WHERE role.name = 'admin' AND grant_row.permission_key = 'sigdesk.problems.resolve'
	`).Scan(&granted); err != nil {
		t.Fatalf("query problem permissions: %v", err)
	}
	if granted != 1 {
		t.Errorf("admin is missing sigdesk.problems.resolve (%d rows)", granted)
	}
}

// TestApplyIsIdempotent: a second run must be a pure no-op. This is what
// makes it safe for every API restart to call Apply.
func TestApplyIsIdempotent(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("first apply: %v", err)
	}

	var firstMax time.Time
	if err := pool.QueryRow(ctx, `SELECT max(applied_at) FROM schema_migrations`).Scan(&firstMax); err != nil {
		t.Fatalf("read first applied_at: %v", err)
	}
	var firstCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&firstCount); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}

	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("second apply: %v", err)
	}

	assertHistory(t, pool, wantMigrations)
	var secondMax time.Time
	if err := pool.QueryRow(ctx, `SELECT max(applied_at) FROM schema_migrations`).Scan(&secondMax); err != nil {
		t.Fatalf("read second applied_at: %v", err)
	}
	if !secondMax.Equal(firstMax) {
		t.Errorf("the second run re-applied something (applied_at moved %v -> %v)", firstMax, secondMax)
	}
	var secondCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&secondCount); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if secondCount != firstCount {
		t.Errorf("schema_migrations row count changed: %d -> %d", firstCount, secondCount)
	}
}

// TestApplyUpgradesFromEveryIntermediateState is the upgrade-from-existing
// path. There is no archive of released schemas, so an "older deployment" is
// synthesised by applying a PREFIX of the migrations and then letting Apply
// finish the job. Sweeping every cut point turns every migration boundary
// into an upgrade scenario for free.
func TestApplyUpgradesFromEveryIntermediateState(t *testing.T) {
	ctx := context.Background()
	names := embeddedNames(t)

	cutPoints := make([]int, 0, len(names)+1)
	for cut := 0; cut <= len(names); cut++ {
		cutPoints = append(cutPoints, cut)
	}
	if testing.Short() {
		// The interesting boundaries: empty, either side of the RBAC
		// creation/seed pair, and either side of the renamed migration and
		// the demo cleanup.
		cutPoints = []int{0, 11, 12, 16, 17, 18, len(names)}
	}

	for _, cut := range cutPoints {
		cut := cut
		label := "empty"
		if cut > 0 {
			label = names[cut-1]
		}
		t.Run(fmt.Sprintf("%02d_after_%s", cut, label), func(t *testing.T) {
			pool := pgtest.NewDatabase(t)
			if cut > 0 {
				if err := applyFS(ctx, pool, subsetFS(t, names[:cut])); err != nil {
					t.Fatalf("seed state after %d migrations: %v", cut, err)
				}
			}
			if err := Apply(ctx, pool); err != nil {
				t.Fatalf("upgrade from %d applied migrations: %v", cut, err)
			}
			assertHistory(t, pool, names)
		})
	}
}

func countCatalogIdempotencyKeysObjects(t *testing.T, pool *pgxpool.Pool, tables, indexes, constraints *int) {
	t.Helper()
	ctx := context.Background()
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE tablename = 'catalog_idempotency_keys'`).Scan(tables); err != nil {
		t.Fatalf("count catalog_idempotency_keys tables: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE tablename = 'catalog_idempotency_keys'`).Scan(indexes); err != nil {
		t.Fatalf("count catalog_idempotency_keys indexes: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM pg_constraint constraint_row
		JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
		WHERE table_row.relname = 'catalog_idempotency_keys'
	`).Scan(constraints); err != nil {
		t.Fatalf("count catalog_idempotency_keys constraints: %v", err)
	}
}

// TestHistoricalIdempotencyKeysRenameIsSafeNoOp reproduces the exact
// situation a real, already-deployed database is in: it applied
// 000012_catalog_idempotency_keys.up.sql (the historical name) BEFORE
// 000012_create_rbac.up.sql, then everything through 000017. Upgrading it
// with the current, renamed embedded set must apply 000018 (new name, same
// content) as a real no-op — no duplicate table, index or constraint — and
// must also carry the database through 000019, finally removing the demo
// data that migration always inserted at initial deploy time.
func TestHistoricalIdempotencyKeysRenameIsSafeNoOp(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)

	historicalNames := append(append(
		append([]string{}, wantMigrations[:11]...), // 000001..000011
		"000012_catalog_idempotency_keys.up.sql",   // historical name and position
	), wantMigrations[11:17]...) // 000012_create_rbac..000017

	historicalSource := map[string]string{
		// Same bytes as the renamed file; only the filename differs.
		"000012_catalog_idempotency_keys.up.sql": "000018_catalog_idempotency_keys.up.sql",
	}

	if err := applyFS(ctx, pool, renamedFS(t, historicalNames, historicalSource)); err != nil {
		t.Fatalf("seed historical (pre-rename) state: %v", err)
	}

	var historicalDemoCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE human_id = ANY($1)`, demoHumanIDs).Scan(&historicalDemoCount); err != nil {
		t.Fatalf("count demo tickets in historical state: %v", err)
	}
	if historicalDemoCount != len(demoHumanIDs) {
		t.Fatalf("historical state has %d/%d demo tickets; the simulated history is wrong", historicalDemoCount, len(demoHumanIDs))
	}

	var tablesBefore, indexesBefore, constraintsBefore int
	countCatalogIdempotencyKeysObjects(t, pool, &tablesBefore, &indexesBefore, &constraintsBefore)
	if tablesBefore != 1 {
		t.Fatalf("expected exactly 1 catalog_idempotency_keys table after the historical migration, got %d", tablesBefore)
	}

	// The real upgrade path: bring an existing database up to the current
	// embedded set.
	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("upgrade an existing database through the rename: %v", err)
	}

	var tablesAfter, indexesAfter, constraintsAfter int
	countCatalogIdempotencyKeysObjects(t, pool, &tablesAfter, &indexesAfter, &constraintsAfter)
	if tablesAfter != tablesBefore {
		t.Errorf("catalog_idempotency_keys table count changed: %d -> %d (the rename must not duplicate it)", tablesBefore, tablesAfter)
	}
	if indexesAfter != indexesBefore {
		t.Errorf("catalog_idempotency_keys index count changed: %d -> %d", indexesBefore, indexesAfter)
	}
	if constraintsAfter != constraintsBefore {
		t.Errorf("catalog_idempotency_keys constraint count changed: %d -> %d", constraintsBefore, constraintsAfter)
	}

	// Both names are expected in history: the historical one because a real
	// database really did apply it under that name, and the new one because
	// 000018 was applied too — as a real, harmless no-op.
	for _, name := range []string{"000012_catalog_idempotency_keys.up.sql", "000018_catalog_idempotency_keys.up.sql"} {
		var applied bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`, name).Scan(&applied); err != nil {
			t.Fatalf("check %s recorded: %v", name, err)
		}
		if !applied {
			t.Errorf("expected %s to be recorded in schema_migrations", name)
		}
	}

	// The upgrade also carries this "existing" database through 000019: the
	// demo tickets it accumulated at initial deploy time are finally gone.
	var demoCountAfter int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE human_id = ANY($1)`, demoHumanIDs).Scan(&demoCountAfter); err != nil {
		t.Fatalf("count demo tickets after upgrade: %v", err)
	}
	if demoCountAfter != 0 {
		t.Errorf("upgrade left %d demo tickets behind; 000019 should have removed them", demoCountAfter)
	}
}

// TestDemoCleanupRemovesAllSeededRowsAndDependents proves 000019 reaches
// every table the demo dataset actually touches: the tickets themselves and
// every ticket-keyed dependent.
func TestDemoCleanupRemovesAllSeededRowsAndDependents(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("apply: %v", err)
	}

	for _, table := range []struct {
		name   string
		column string
	}{
		{"tickets", "human_id"},
		{"ticket_activity", "ticket_id"},
		{"ticket_comments", "ticket_id"},
		{"ticket_attachments", "ticket_id"},
		{"ticket_watchers", "ticket_id"},
	} {
		var count int
		query := fmt.Sprintf(`SELECT count(*) FROM %s WHERE %s = ANY($1)`, table.name, table.column)
		if err := pool.QueryRow(ctx, query, demoHumanIDs).Scan(&count); err != nil {
			t.Fatalf("count demo rows in %s: %v", table.name, err)
		}
		if count != 0 {
			t.Errorf("%s still has %d rows for demo ticket ids after Apply", table.name, count)
		}
	}

	// The entity-pipeline tables the user explicitly asked to be covered.
	// Empty by construction (see the migration's own comment: these demo
	// tickets were inserted directly, bypassing the catalog pipeline, so they
	// were never projected into entity_records), verified rather than assumed.
	for _, table := range []string{
		"entity_records", "catalog_entity_relations", "catalog_event_outbox",
		"catalog_projected_events", "catalog_idempotency_keys", "sla_assessments",
		"sla_processed_events",
	} {
		var count int
		if err := pool.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM %s`, table)).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if count != 0 {
			t.Errorf("%s has %d rows on a database whose only writes were migrations; expected 0", table, count)
		}
	}
}

// TestDemoCleanupLeavesNoOrphans checks referential integrity directly rather
// than trusting that ON DELETE CASCADE was configured correctly everywhere.
func TestDemoCleanupLeavesNoOrphans(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("apply: %v", err)
	}

	for _, table := range []string{"ticket_activity", "ticket_comments", "ticket_attachments", "ticket_watchers"} {
		var orphans int
		query := fmt.Sprintf(`
			SELECT count(*) FROM %s AS dependent
			WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE tickets.human_id = dependent.ticket_id)
		`, table)
		if err := pool.QueryRow(ctx, query).Scan(&orphans); err != nil {
			t.Fatalf("check orphans in %s: %v", table, err)
		}
		if orphans != 0 {
			t.Errorf("%s has %d rows referencing a ticket that no longer exists", table, orphans)
		}
	}

	var mergeOrphans int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM tickets AS child
		WHERE child.merged_into_id IS NOT NULL
		  AND NOT EXISTS (SELECT 1 FROM tickets AS parent WHERE parent.human_id = child.merged_into_id)
	`).Scan(&mergeOrphans); err != nil {
		t.Fatalf("check merged_into_id orphans: %v", err)
	}
	if mergeOrphans != 0 {
		t.Errorf("%d tickets reference a merged_into_id that no longer exists", mergeOrphans)
	}
}

// TestDemoCleanupSQLIsSafeToRunTwice executes 000019's own SQL content twice
// directly, bypassing the schema_migrations bookkeeping entirely — a
// stronger proof that the SQL itself is idempotent than relying on the
// runner's skip-by-name behavior (which only ever runs it once anyway).
func TestDemoCleanupSQLIsSafeToRunTwice(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := applyFS(ctx, pool, subsetFS(t, wantMigrations[:len(wantMigrations)-1])); err != nil {
		t.Fatalf("seed up to (not including) the cleanup migration: %v", err)
	}

	script, err := files.ReadFile("000019_remove_legacy_demo_data.up.sql")
	if err != nil {
		t.Fatalf("read 000019 content: %v", err)
	}

	if _, err := pool.Exec(ctx, string(script)); err != nil {
		t.Fatalf("first run of the cleanup SQL: %v", err)
	}
	var afterFirst int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE human_id = ANY($1)`, demoHumanIDs).Scan(&afterFirst); err != nil {
		t.Fatalf("count after first run: %v", err)
	}
	if afterFirst != 0 {
		t.Fatalf("first run left %d demo tickets", afterFirst)
	}

	if _, err := pool.Exec(ctx, string(script)); err != nil {
		t.Fatalf("second run of the cleanup SQL: %v", err)
	}
	var afterSecond int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE human_id = ANY($1)`, demoHumanIDs).Scan(&afterSecond); err != nil {
		t.Fatalf("count after second run: %v", err)
	}
	if afterSecond != 0 {
		t.Fatalf("second run resurrected demo tickets: %d", afterSecond)
	}
}

// TestDemoCleanupDoesNotTouchLookAlikeRealData proves the removal criterion
// is the fixed id list, never content: a real ticket with the exact same
// title/description/priority/site as a demo ticket, but a different id, must
// survive.
func TestDemoCleanupDoesNotTouchLookAlikeRealData(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := applyFS(ctx, pool, subsetFS(t, wantMigrations[:len(wantMigrations)-1])); err != nil {
		t.Fatalf("seed up to (not including) the cleanup migration: %v", err)
	}

	const lookAlikeID = "INC-900001"
	if _, err := pool.Exec(ctx, `
		INSERT INTO tickets (human_id, title, description, status, priority, category, requester_name, asset_id, site, created_at)
		VALUES ($1, 'Camera offline at Site #401', 'The main entrance camera is not responding to health checks.', 'open', 'critical', 'hardware', 'John Doe', 'CAM-12607', 'Site #401', now())
	`, lookAlikeID); err != nil {
		t.Fatalf("insert look-alike real ticket: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload)
		VALUES ($1, 'created', 'John Doe', '{}'::jsonb)
	`, lookAlikeID); err != nil {
		t.Fatalf("insert look-alike activity: %v", err)
	}

	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("apply remaining migrations: %v", err)
	}

	var survived bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tickets WHERE human_id = $1)`, lookAlikeID).Scan(&survived); err != nil {
		t.Fatalf("check look-alike survived: %v", err)
	}
	if !survived {
		t.Fatalf("cleanup deleted a real ticket (%s) that only resembled the demo data by content, not by id", lookAlikeID)
	}

	var activitySurvived int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM ticket_activity WHERE ticket_id = $1`, lookAlikeID).Scan(&activitySurvived); err != nil {
		t.Fatalf("check look-alike activity survived: %v", err)
	}
	if activitySurvived == 0 {
		t.Errorf("cleanup deleted the look-alike ticket's activity")
	}

	var demoCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE human_id = ANY($1)`, demoHumanIDs).Scan(&demoCount); err != nil {
		t.Fatalf("count demo tickets: %v", err)
	}
	if demoCount != 0 {
		t.Errorf("real demo tickets survived alongside the look-alike: %d", demoCount)
	}
}

// TestDemoCleanupDoesNotRegressSequenceOrCauseCollisions proves the migration
// never winds entity_human_id_seq backward and that a real ticket created
// afterward cannot collide with a removed (or remaining) id.
func TestDemoCleanupDoesNotRegressSequenceOrCauseCollisions(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := applyFS(ctx, pool, subsetFS(t, wantMigrations[:len(wantMigrations)-1])); err != nil {
		t.Fatalf("seed up to (not including) the cleanup migration: %v", err)
	}

	var sequenceBefore int64
	if err := pool.QueryRow(ctx, `SELECT last_value FROM entity_human_id_seq`).Scan(&sequenceBefore); err != nil {
		t.Fatalf("read sequence before cleanup: %v", err)
	}

	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("apply the cleanup migration: %v", err)
	}

	var sequenceAfter int64
	if err := pool.QueryRow(ctx, `SELECT last_value FROM entity_human_id_seq`).Scan(&sequenceAfter); err != nil {
		t.Fatalf("read sequence after cleanup: %v", err)
	}
	if sequenceAfter < sequenceBefore {
		t.Fatalf("entity_human_id_seq regressed from %d to %d; cleanup must never wind a sequence backward", sequenceBefore, sequenceAfter)
	}

	var newHumanID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO tickets (title, description, status, priority, requester_name)
		VALUES ('Real ticket after cleanup', 'Created after demo data was removed.', 'open', 'medium', 'Real User')
		RETURNING human_id
	`).Scan(&newHumanID); err != nil {
		t.Fatalf("insert real ticket after cleanup: %v", err)
	}

	for _, demoID := range demoHumanIDs {
		if newHumanID == demoID {
			t.Fatalf("new ticket id %s collided with a deleted demo ticket id", newHumanID)
		}
	}
}
