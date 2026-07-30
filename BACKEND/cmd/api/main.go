package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	automationsApplication "sig-desk/backend/internal/automations/application"
	catalogMemory "sig-desk/backend/internal/catalog/adapters/memory"
	catalogModules "sig-desk/backend/internal/catalog/adapters/modules"
	catalogPostgres "sig-desk/backend/internal/catalog/adapters/postgres"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
	changesApplication "sig-desk/backend/internal/changes/application"
	iamApplication "sig-desk/backend/internal/iam/application"
	"sig-desk/backend/internal/identity/adapters/httpmw"
	"sig-desk/backend/internal/identity/adapters/sigtools"
	integrationsApplication "sig-desk/backend/internal/integrations/application"
	notificationsApplication "sig-desk/backend/internal/notifications/application"
	"sig-desk/backend/internal/platform/config"
	"sig-desk/backend/internal/platform/database"
	platformEvents "sig-desk/backend/internal/platform/events"
	"sig-desk/backend/internal/platform/httpserver"
	rbacMemory "sig-desk/backend/internal/rbac/adapters/memory"
	rbacPostgres "sig-desk/backend/internal/rbac/adapters/postgres"
	rbacApplication "sig-desk/backend/internal/rbac/application"
	rbacPorts "sig-desk/backend/internal/rbac/ports"
	reportsApplication "sig-desk/backend/internal/reports/application"
	slaMemory "sig-desk/backend/internal/sla/adapters/memory"
	slaPostgres "sig-desk/backend/internal/sla/adapters/postgres"
	slaApplication "sig-desk/backend/internal/sla/application"
	slaPorts "sig-desk/backend/internal/sla/ports"
	"sig-desk/backend/internal/tickets/adapters/blobstore"
	"sig-desk/backend/internal/tickets/adapters/catalogevents"
	"sig-desk/backend/internal/tickets/adapters/catalogintake"
	"sig-desk/backend/internal/tickets/adapters/memory"
	"sig-desk/backend/internal/tickets/adapters/postgres"
	"sig-desk/backend/internal/tickets/application"
	"sig-desk/backend/internal/tickets/ports"
	"sig-desk/backend/migrations"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	ctx, cancelApplication := context.WithCancel(context.Background())
	defer cancelApplication()
	var repository ports.Repository
	var catalogRepository catalogPorts.Repository
	var slaRepository slaPorts.Repository
	var rbacRepository rbacPorts.Repository
	var closeDatabase func()
	var readyCheck func(context.Context) error

	if cfg.DatabaseURL == "" {
		logger.Warn("DATABASE_URL is empty; using the in-memory development repository")
		repository = memory.NewRepository(memory.DemoTickets())
		catalogRepository = catalogMemory.NewRepository(catalogMemory.DemoDefinitions()...)
		slaRepository = slaMemory.NewRepository(slaApplication.DefaultPolicy())
		rbacRepository = rbacMemory.NewRepository()
		closeDatabase = func() {}
		readyCheck = func(context.Context) error { return nil }
	} else {
		pool, err := database.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			logger.Error("database connection failed", "error", err)
			os.Exit(1)
		}
		if err := migrations.Apply(ctx, pool); err != nil {
			logger.Error("database migration failed", "error", err)
			pool.Close()
			os.Exit(1)
		}
		repository = postgres.NewRepository(pool)
		catalogRepository = catalogPostgres.NewRepository(pool)
		slaRepository = slaPostgres.NewRepository(pool)
		rbacRepository = rbacPostgres.NewRepository(pool)
		closeDatabase = pool.Close
		readyCheck = pool.Ping
		logger.Info("connected to PostgreSQL")
	}
	defer closeDatabase()

	attachmentStore, err := blobstore.NewLocalDisk(cfg.AttachmentsDir)
	if err != nil {
		logger.Error("could not prepare attachments directory", "error", err)
		os.Exit(1)
	}

	moduleRegistry := catalogModules.NewRegistry()
	iamService := iamApplication.NewService(cfg.Environment != "production")
	for _, resource := range iamService.Resources() {
		moduleRegistry.Register(resource, iamService.HandleCommand)
	}
	slaService := slaApplication.NewService(slaRepository)
	slaResources, err := slaService.Resources(ctx)
	if err != nil {
		logger.Error("could not load SLA resources", "error", err)
		os.Exit(1)
	}
	for _, resource := range slaResources {
		moduleRegistry.Register(resource, slaService.HandleCommand)
	}
	moduleRegistry.RegisterResolver("sla", slaService.ResolveResource)
	moduleRegistry.RegisterProvider("sla", slaService.AvailableResources)
	automationsService := automationsApplication.NewService()
	for _, resource := range automationsService.Resources() {
		moduleRegistry.Register(resource, automationsService.HandleCommand)
	}
	notificationsService := notificationsApplication.NewService()
	for _, resource := range notificationsService.Resources() {
		moduleRegistry.Register(resource, notificationsService.HandleCommand)
	}
	integrationsService := integrationsApplication.NewService(cfg.IncidentWebhookCredentialRef)
	for _, resource := range integrationsService.Resources() {
		moduleRegistry.Register(resource, integrationsService.HandleCommand)
	}
	reportsService := reportsApplication.NewService()
	for _, resource := range reportsService.Resources() {
		moduleRegistry.Register(resource, reportsService.HandleCommand)
	}

	eventBus := platformEvents.NewBus()
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "sla",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1:      true,
			catalogDomain.EventEntityUpdatedV1:      true,
			catalogDomain.EventEntityTransitionedV1: true,
		},
		Handler: slaService.HandleEvent,
	})
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "automations",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1: true,
		},
		Handler: automationsService.HandleEvent,
	})
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "notifications",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1: true,
		},
		Handler: notificationsService.HandleEvent,
	})
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "integrations",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1: true,
		},
		Handler: integrationsService.HandleEvent,
	})
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "reports",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1:      true,
			catalogDomain.EventEntityUpdatedV1:      true,
			catalogDomain.EventEntityTransitionedV1: true,
		},
		Handler: reportsService.HandleEvent,
	})

	catalogService := catalogApplication.NewService(catalogRepository, moduleRegistry)
	changeService := changesApplication.NewService(catalogService)
	for _, resource := range changeService.Resources() {
		moduleRegistry.Register(resource, changeService.HandleCommand)
	}
	seedIncidentDefinitionV2(ctx, logger, catalogService)
	seedProblemDefinition(ctx, logger, catalogService)
	seedChangeDefinition(ctx, logger, catalogService)
	outboxStore, ok := catalogRepository.(catalogPorts.OutboxStore)
	if !ok {
		logger.Error("catalog repository does not implement transactional outbox")
		os.Exit(1)
	}
	outboxDispatcher, err := catalogApplication.NewOutboxDispatcher(outboxStore, eventBus)
	if err != nil {
		logger.Error("could not initialize outbox dispatcher", "error", err)
		os.Exit(1)
	}
	catalogIntake := catalogintake.NewAdapter(catalogService)
	ticketService := application.NewService(repository, attachmentStore, catalogIntake)
	ticketEvents := catalogevents.NewConsumer(ticketService)
	eventBus.Subscribe(platformEvents.Subscription{
		Name: "tickets-projection",
		EventTypes: map[string]bool{
			catalogDomain.EventEntityCreatedV1:      true,
			catalogDomain.EventEntityUpdatedV1:      true,
			catalogDomain.EventEntityTransitionedV1: true,
		},
		Handler: ticketEvents.Handle,
	})
	go outboxDispatcher.Run(ctx, time.Second, func(err error) {
		logger.Error("catalog outbox dispatch failed", "error", err)
	})
	// Authorization is SIG-DESK's own: its roles and permissions live in its
	// own database, so the roles the shared platform defines for
	// SIGInstallations and SIGInventory (designer, field_tech, inventory_op)
	// never govern access here.
	rbacService := rbacApplication.NewService(rbacRepository, cfg.BootstrapAdmins)
	if !rbacService.HasBootstrapAdmins() {
		logger.Warn(
			"SIGDESK_BOOTSTRAP_ADMINS is not set: nobody can reach role administration " +
				"until a user is granted the admin role directly in the database",
		)
	}

	// Authentication, by contrast, IS delegated to SIGTools — the company-wide
	// auth service already used by the other two apps: same Active Directory
	// credentials and same session. SIG-DESK stores no passwords and does not
	// own the user record.
	var authenticator *httpmw.Authenticator
	if cfg.AuthEnabled() {
		authenticator = httpmw.NewAuthenticator(
			sigtools.NewProvider(cfg.SigtoolsAPIURL),
			httpmw.WithAuthorizer(rbacService),
		)
		logger.Info(
			"authentication enabled",
			"authority", cfg.SigtoolsAPIURL,
			"bootstrapAdmins", len(cfg.BootstrapAdmins),
		)
	} else {
		if cfg.IsProduction() {
			logger.Error("SIGTOOLS_API_URL is required when APP_ENV=production; refusing to start unauthenticated")
			os.Exit(1)
		}
		authenticator = httpmw.NewDisabledAuthenticator()
		logger.Warn("SIGTOOLS_API_URL is not set: authentication and permission checks are DISABLED (local development only)")
	}

	handler := httpserver.New(httpserver.Dependencies{
		Config:         cfg,
		Logger:         logger,
		TicketService:  ticketService,
		CatalogService: catalogService,
		SLAService:     slaService,
		ChangeService:  changeService,
		Authenticator:  authenticator,
		RBACService:    rbacService,
		ReadyCheck:     readyCheck,
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("SIG-DESK API started", "port", cfg.Port, "environment", cfg.Environment)
		errCh <- server.ListenAndServe()
	}()

	signalCh := make(chan os.Signal, 1)
	signal.Notify(signalCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-signalCh:
		logger.Info("shutdown requested", "signal", sig.String())
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}
	cancelApplication()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("server stopped")
}
