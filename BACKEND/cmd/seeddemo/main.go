// Command seeddemo inserts SIG-DESK's disposable sample tickets into a
// database that already has migrations applied.
//
// This data used to be inserted automatically by migrations 000002 and
// 000005, which meant every environment — including production — got
// INC-000001..4 (and the three tickets merged into INC-000001) the moment it
// was first migrated. Migration 000019_remove_legacy_demo_data.up.sql now
// removes that automatic outcome; this command is the only way to get the
// same sample data back, and only when someone explicitly asks for it. It is
// never invoked by migrations, by cmd/api's startup, or by any other
// automated process.
package main

import (
	"context"
	"log/slog"
	"os"

	"sig-desk/backend/internal/platform/config"
	"sig-desk/backend/internal/platform/database"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg := config.Load()

	if cfg.IsProduction() {
		logger.Error("refusing to seed demo data: APP_ENV=production")
		os.Exit(1)
	}
	if cfg.DatabaseURL == "" {
		logger.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	var alreadySeeded bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tickets WHERE human_id = 'INC-000001')`).Scan(&alreadySeeded); err != nil {
		logger.Error("could not check for existing demo data", "error", err)
		os.Exit(1)
	}
	if alreadySeeded {
		logger.Info("demo data already present; nothing to do")
		return
	}

	transaction, err := pool.Begin(ctx)
	if err != nil {
		logger.Error("could not start transaction", "error", err)
		os.Exit(1)
	}
	if _, err := transaction.Exec(ctx, demoDataSQL); err != nil {
		_ = transaction.Rollback(ctx)
		logger.Error("seeding demo data failed", "error", err)
		os.Exit(1)
	}
	if err := transaction.Commit(ctx); err != nil {
		logger.Error("could not commit demo data", "error", err)
		os.Exit(1)
	}
	logger.Info("demo data seeded", "tickets", 7)
}
