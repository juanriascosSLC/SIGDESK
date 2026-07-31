package migrations

import (
	"context"
	"testing"

	"sig-desk/backend/internal/platform/testsupport/pgtest"
)

// TestUpgradeFrom000019To000020IsIdempotent proves the newest migration in
// this branch — 000020, which introduces catalog_layout_versions — applies
// cleanly on top of a database already migrated through 000019, and that
// re-running its own SQL text directly (bypassing schema_migrations
// bookkeeping entirely, the same stronger proof TestDemoCleanupSQLIsSafeToRunTwice
// uses for 000019) is a true no-op: no duplicate table, index, constraint or
// RBAC grant.
func TestUpgradeFrom000019To000020IsIdempotent(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)

	if err := applyFS(ctx, pool, subsetFS(t, wantMigrations[:len(wantMigrations)-1])); err != nil {
		t.Fatalf("seed up to 000019: %v", err)
	}

	var existsBefore *string
	if err := pool.QueryRow(ctx, `SELECT to_regclass('catalog_layout_versions')::text`).Scan(&existsBefore); err != nil {
		t.Fatalf("to_regclass before 000020: %v", err)
	}
	if existsBefore != nil {
		t.Fatalf("catalog_layout_versions already exists before 000020 ran")
	}

	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("apply 000020: %v", err)
	}
	assertHistory(t, pool, wantMigrations)

	var existsAfter *string
	if err := pool.QueryRow(ctx, `SELECT to_regclass('catalog_layout_versions')::text`).Scan(&existsAfter); err != nil {
		t.Fatalf("to_regclass after 000020: %v", err)
	}
	if existsAfter == nil {
		t.Fatalf("catalog_layout_versions does not exist after 000020")
	}

	var grantedBefore int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM rbac_role_permissions AS grant_row
		JOIN rbac_roles AS role ON role.id = grant_row.role_id
		WHERE role.name = 'admin' AND grant_row.permission_key IN ('sigdesk.catalog.author', 'sigdesk.catalog.publish')
	`).Scan(&grantedBefore); err != nil {
		t.Fatalf("query catalog permissions before re-run: %v", err)
	}
	if grantedBefore != 2 {
		t.Fatalf("expected admin to hold both catalog author/publish grants, got %d", grantedBefore)
	}

	var tablesBefore, indexesBefore, constraintsBefore int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE tablename = 'catalog_layout_versions'`).Scan(&tablesBefore); err != nil {
		t.Fatalf("count tables before re-run: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE tablename = 'catalog_layout_versions'`).Scan(&indexesBefore); err != nil {
		t.Fatalf("count indexes before re-run: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM pg_constraint constraint_row
		JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
		WHERE table_row.relname = 'catalog_layout_versions'
	`).Scan(&constraintsBefore); err != nil {
		t.Fatalf("count constraints before re-run: %v", err)
	}

	// Apply() as a whole is already proven idempotent by TestApplyIsIdempotent
	// (which runs the full migration set, including 000020, twice). Here we go
	// one step further: re-execute 000020's own SQL text directly, so the
	// proof covers the SQL's own idempotency, not just the runner's
	// skip-by-name behavior (which would never re-run it in the first place).
	script, err := files.ReadFile("000020_create_catalog_layout_versions.up.sql")
	if err != nil {
		t.Fatalf("read 000020 content: %v", err)
	}
	if _, err := pool.Exec(ctx, string(script)); err != nil {
		t.Fatalf("re-run 000020 SQL directly: %v", err)
	}

	var tablesAfter, indexesAfter, constraintsAfter int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE tablename = 'catalog_layout_versions'`).Scan(&tablesAfter); err != nil {
		t.Fatalf("count tables after re-run: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE tablename = 'catalog_layout_versions'`).Scan(&indexesAfter); err != nil {
		t.Fatalf("count indexes after re-run: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM pg_constraint constraint_row
		JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
		WHERE table_row.relname = 'catalog_layout_versions'
	`).Scan(&constraintsAfter); err != nil {
		t.Fatalf("count constraints after re-run: %v", err)
	}

	if tablesAfter != tablesBefore {
		t.Errorf("catalog_layout_versions table count changed: %d -> %d", tablesBefore, tablesAfter)
	}
	if indexesAfter != indexesBefore {
		t.Errorf("catalog_layout_versions index count changed: %d -> %d", indexesBefore, indexesAfter)
	}
	if constraintsAfter != constraintsBefore {
		t.Errorf("catalog_layout_versions constraint count changed: %d -> %d", constraintsBefore, constraintsAfter)
	}

	var grantedAfter int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM rbac_role_permissions AS grant_row
		JOIN rbac_roles AS role ON role.id = grant_row.role_id
		WHERE role.name = 'admin' AND grant_row.permission_key IN ('sigdesk.catalog.author', 'sigdesk.catalog.publish')
	`).Scan(&grantedAfter); err != nil {
		t.Fatalf("query catalog permissions after re-run: %v", err)
	}
	if grantedAfter != grantedBefore {
		t.Errorf("admin catalog grant count changed on re-run: %d -> %d (ON CONFLICT DO NOTHING should have made this a no-op)", grantedBefore, grantedAfter)
	}
}

// TestCatalogLayoutVersionsImmutabilityTriggers exercises
// prevent_published_layout_modification and prevent_published_layout_deletion
// directly against real Postgres: the status-transition whitelist, full-row
// immutability of a published row's content, and deletion being permanently
// blocked once a row has ever been published — even after it later moves to
// deprecated/archived.
func TestCatalogLayoutVersionsImmutabilityTriggers(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := Apply(ctx, pool); err != nil {
		t.Fatalf("apply: %v", err)
	}

	var id string
	if err := pool.QueryRow(ctx, `
		INSERT INTO catalog_layout_versions (id, entity_key, version, status, document)
		VALUES (gen_random_uuid(), 'TST', 0, 'draft', '{"detail":{}}'::jsonb)
		RETURNING id::text
	`).Scan(&id); err != nil {
		t.Fatalf("insert draft: %v", err)
	}

	// draft -> published is the only legal transition out of draft.
	if _, err := pool.Exec(ctx, `
		UPDATE catalog_layout_versions
		SET status = 'published', version = 1, published_at = now(),
		    compatibility = '{}'::jsonb, checksum = repeat('a', 64), is_active = true
		WHERE id = $1
	`, id); err != nil {
		t.Fatalf("publish draft: %v", err)
	}

	// Invalid transition: published -> draft must be rejected.
	if _, err := pool.Exec(ctx, `UPDATE catalog_layout_versions SET status = 'draft' WHERE id = $1`, id); err == nil {
		t.Fatal("expected published->draft transition to be rejected")
	}

	// Immutability: mutating a published row's content, without even touching
	// status, must be rejected.
	if _, err := pool.Exec(ctx, `
		UPDATE catalog_layout_versions SET document = '{"detail":{"changed":true}}'::jsonb WHERE id = $1
	`, id); err == nil {
		t.Fatal("expected mutation of a published row's document to be rejected")
	}
	if _, err := pool.Exec(ctx, `UPDATE catalog_layout_versions SET checksum = repeat('b', 64) WHERE id = $1`, id); err == nil {
		t.Fatal("expected mutation of a published row's checksum to be rejected")
	}

	// published -> deprecated is the only other legal step.
	if _, err := pool.Exec(ctx, `
		UPDATE catalog_layout_versions SET status = 'deprecated', is_active = false WHERE id = $1
	`, id); err != nil {
		t.Fatalf("expected published->deprecated transition to succeed: %v", err)
	}

	// Invalid: deprecated -> published (going backward) must be rejected.
	if _, err := pool.Exec(ctx, `UPDATE catalog_layout_versions SET status = 'published' WHERE id = $1`, id); err == nil {
		t.Fatal("expected deprecated->published transition to be rejected")
	}

	// deprecated -> archived is allowed.
	if _, err := pool.Exec(ctx, `UPDATE catalog_layout_versions SET status = 'archived' WHERE id = $1`, id); err != nil {
		t.Fatalf("expected deprecated->archived transition to succeed: %v", err)
	}

	// DELETE of a row that was EVER published must be rejected regardless of
	// its current status — published_at, once set, is never cleared.
	if _, err := pool.Exec(ctx, `DELETE FROM catalog_layout_versions WHERE id = $1`, id); err == nil {
		t.Fatal("expected deletion of a published-then-archived row to be rejected")
	}

	// Negative control: a row that was NEVER published deletes normally — the
	// deletion trigger's condition is specifically published_at IS NOT NULL,
	// not "any row in this table".
	var draftID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO catalog_layout_versions (id, entity_key, version, status, document)
		VALUES (gen_random_uuid(), 'TST2', 0, 'draft', '{}'::jsonb)
		RETURNING id::text
	`).Scan(&draftID); err != nil {
		t.Fatalf("insert second draft: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM catalog_layout_versions WHERE id = $1`, draftID); err != nil {
		t.Fatalf("expected deletion of a never-published draft to succeed: %v", err)
	}
}
