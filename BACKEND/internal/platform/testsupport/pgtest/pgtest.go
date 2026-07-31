// Package pgtest hands a test its own throwaway PostgreSQL database.
//
// Tests using this package SKIP when SIGDESK_TEST_DATABASE_URL is unset.
// That is load-bearing: `go test ./...` on a machine with nothing installed
// must stay green, and CI proves exactly that in a step that deliberately
// omits the variable before running a separate step that sets it.
//
// Locally:
//
//	docker compose up -d --wait postgres
//	SIGDESK_TEST_DATABASE_URL='postgres://sigdesk:sigdesk@localhost:5432/postgres?sslmode=disable' \
//	  go test -count=1 -v ./migrations/...
//
// Point it at a MAINTENANCE database (typically "postgres"), not at a
// database you care about: this package issues CREATE DATABASE / DROP
// DATABASE, which cannot target the database the connection itself is using.
// It never reads or writes the database named in the DSN — only the
// throwaway ones it creates alongside it — so a developer's own data is
// never at risk.
package pgtest

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sig-desk/backend/internal/platform/database"
)

// DSNEnv is the environment variable pgtest reads for the admin/maintenance
// connection string.
const DSNEnv = "SIGDESK_TEST_DATABASE_URL"

// NewDatabase creates an empty, uniquely-named database on the same server as
// SIGDESK_TEST_DATABASE_URL, returns a pool connected to it, and drops it
// when the test ends. Skips the test if the environment variable is not set.
func NewDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()

	adminDSN := os.Getenv(DSNEnv)
	if adminDSN == "" {
		t.Skipf("%s is not set; skipping database-backed test", DSNEnv)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	adminConn, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		t.Fatalf("pgtest: connect to admin database: %v", err)
	}
	defer func() { _ = adminConn.Close(context.Background()) }()

	name := sanitizeDatabaseName(t.Name())

	// CREATE/DROP DATABASE cannot run inside a transaction block; a plain
	// Exec over a single pgx.Conn is autocommit, which is what this needs.
	if _, err := adminConn.Exec(ctx, fmt.Sprintf(`CREATE DATABASE %s`, quoteIdentifier(name))); err != nil {
		t.Fatalf("pgtest: create database %s: %v", name, err)
	}

	testDSN, err := withDatabaseName(adminDSN, name)
	if err != nil {
		_, _ = adminConn.Exec(ctx, fmt.Sprintf(`DROP DATABASE IF EXISTS %s`, quoteIdentifier(name)))
		t.Fatalf("pgtest: build DSN for %s: %v", name, err)
	}

	pool, err := database.Open(context.Background(), testDSN)
	if err != nil {
		dropAdminConn, dropErr := pgx.Connect(ctx, adminDSN)
		if dropErr == nil {
			_, _ = dropAdminConn.Exec(ctx, fmt.Sprintf(`DROP DATABASE IF EXISTS %s`, quoteIdentifier(name)))
			_ = dropAdminConn.Close(context.Background())
		}
		t.Fatalf("pgtest: connect to new database %s: %v", name, err)
	}

	t.Cleanup(func() {
		pool.Close()

		dropCtx, dropCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer dropCancel()
		dropConn, err := pgx.Connect(dropCtx, adminDSN)
		if err != nil {
			t.Logf("pgtest: could not connect to drop database %s (leaked, needs manual cleanup): %v", name, err)
			return
		}
		defer func() { _ = dropConn.Close(context.Background()) }()

		// WITH (FORCE) (PostgreSQL 13+; the target here is postgres:17-alpine)
		// terminates any connection left open by a leaked pool before
		// dropping — without it, one straggling connection wedges cleanup
		// and every subsequent run leaks another database.
		if _, err := dropConn.Exec(dropCtx, fmt.Sprintf(`DROP DATABASE IF EXISTS %s WITH (FORCE)`, quoteIdentifier(name))); err != nil {
			t.Logf("pgtest: could not drop database %s (leaked, needs manual cleanup): %v", name, err)
		}
	})

	return pool
}

// sanitizeDatabaseName turns a Go test name (which may contain '/' from
// subtests and spaces from t.Run(fmt.Sprintf(...))) into a valid, reasonably
// unique PostgreSQL identifier.
func sanitizeDatabaseName(testName string) string {
	replacer := strings.NewReplacer("/", "_", " ", "_", "-", "_", ".", "_")
	cleaned := strings.ToLower(replacer.Replace(testName))
	name := fmt.Sprintf("sigdesk_test_%s_%d", cleaned, time.Now().UnixNano())
	// PostgreSQL identifiers are limited to 63 bytes.
	if len(name) > 63 {
		name = name[:63]
	}
	return name
}

func quoteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// withDatabaseName rewrites the path segment of a Postgres connection URL,
// keeping every other component (host, credentials, query parameters) as-is.
// Documented restriction: URL-form DSNs only, not libpq keyword/value form —
// which is what every DSN in this codebase already uses.
func withDatabaseName(dsn, name string) (string, error) {
	parsed, err := url.Parse(dsn)
	if err != nil {
		return "", fmt.Errorf("parse DSN: %w", err)
	}
	parsed.Path = "/" + name
	return parsed.String(), nil
}
