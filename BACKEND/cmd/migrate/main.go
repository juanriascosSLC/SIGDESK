// Command migrate is a standalone CLI runner that applies pending database
// migrations without starting the API server or destroying existing data.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"sig-desk/backend/internal/platform/config"
	"sig-desk/backend/internal/platform/database"
	"sig-desk/backend/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg := config.Load()

	if cfg.DatabaseURL == "" {
		logger.Error("DATABASE_URL is required to run migrations")
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	logger.Info("applying database migrations...")
	if err := migrations.Apply(ctx, pool); err != nil {
		logger.Error("migration failed", "error", err)
		os.Exit(1)
	}

	fmt.Println("migrations applied successfully")
}
