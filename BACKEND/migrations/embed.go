package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.up.sql
var files embed.FS

// Apply executes each pending migration exactly once against the embedded
// set. This also upgrades persistent Docker volumes; docker-entrypoint-initdb.d
// only handles empty databases and cannot do that on its own.
func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	return applyFS(ctx, pool, files)
}

// applyFS is Apply against an arbitrary source instead of the embedded set,
// so tests can drive it with a synthetic filesystem: a prefix of the real
// migrations (simulating an older deployment mid-upgrade) or a reconstruction
// of a historical filename layout (simulating a rename). Production only ever
// calls this through Apply, with the real embedded files.
func applyFS(ctx context.Context, pool *pgxpool.Pool, source fs.FS) error {
	// Detect if this execution is a fresh install vs an upgrade of an existing database.
	// A fresh install means schema_migrations did not exist (or was empty) AND none of
	// the core domain tables (tickets, catalog_definitions, entity_records) existed yet.
	var schemaMigrationsCount int
	var schemaMigrationsExists bool
	if err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'schema_migrations'
			  AND table_schema = current_schema()
		)
	`).Scan(&schemaMigrationsExists); err != nil {
		return fmt.Errorf("check schema_migrations existence: %w", err)
	}

	if schemaMigrationsExists {
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&schemaMigrationsCount); err != nil {
			return fmt.Errorf("count schema_migrations: %w", err)
		}
	}

	var domainTablesExist bool
	if err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name IN ('tickets', 'catalog_definitions', 'entity_records')
			  AND table_schema = current_schema()
		)
	`).Scan(&domainTablesExist); err != nil {
		return fmt.Errorf("check domain tables existence: %w", err)
	}

	isFreshInstall := (!schemaMigrationsExists || schemaMigrationsCount == 0) && !domainTablesExist

	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("create migration history: %w", err)
	}
	entries, err := fs.ReadDir(source, ".")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		var applied bool
		if err := pool.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)
		`, name).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if applied {
			continue
		}
		script, err := fs.ReadFile(source, name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		transaction, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}

		freshStr := "false"
		if isFreshInstall {
			freshStr = "true"
		}
		if _, err := transaction.Exec(ctx, "SELECT set_config('sigdesk.fresh_install', $1, true)", freshStr); err != nil {
			_ = transaction.Rollback(ctx)
			return fmt.Errorf("set fresh_install GUC for %s: %w", name, err)
		}

		if _, err = transaction.Exec(ctx, string(script)); err != nil {
			_ = transaction.Rollback(ctx)
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err = transaction.Exec(ctx, `
			INSERT INTO schema_migrations (name) VALUES ($1)
		`, name); err != nil {
			_ = transaction.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err = transaction.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}
	return nil
}
