package httpserver

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	catalogHTTP "sig-desk/backend/internal/catalog/adapters/httpapi"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	changeHTTP "sig-desk/backend/internal/changes/adapters/httpapi"
	changeApplication "sig-desk/backend/internal/changes/application"
	"sig-desk/backend/internal/identity/adapters/httpmw"
	identityDomain "sig-desk/backend/internal/identity/domain"
	identityPorts "sig-desk/backend/internal/identity/ports"
	"sig-desk/backend/internal/platform/config"
	rbacHTTP "sig-desk/backend/internal/rbac/adapters/httpapi"
	rbacApplication "sig-desk/backend/internal/rbac/application"
	slaHTTP "sig-desk/backend/internal/sla/adapters/httpapi"
	slaApplication "sig-desk/backend/internal/sla/application"
	ticketHTTP "sig-desk/backend/internal/tickets/adapters/httpapi"
	"sig-desk/backend/internal/tickets/application"
)

type Dependencies struct {
	Config         config.Config
	Logger         *slog.Logger
	TicketService  *application.Service
	CatalogService *catalogApplication.Service
	LayoutService  *catalogApplication.LayoutService
	SLAService     *slaApplication.Service
	ChangeService  *changeApplication.Service
	// Authenticator validates callers against SIGTools. Required: main builds
	// a disabled one explicitly for local development, so a nil here is a
	// wiring mistake rather than an "open by default" deployment.
	Authenticator *httpmw.Authenticator
	// RBACService owns SIG-DESK's roles and permissions. Authentication is
	// shared company-wide; authorization is this application's own.
	RBACService *rbacApplication.Service
	ReadyCheck  func(context.Context) error
}

func New(dependencies Dependencies) http.Handler {
	mux := http.NewServeMux()
	ticketHandler := ticketHTTP.NewHandler(dependencies.TicketService)

	authenticator := dependencies.Authenticator
	if authenticator == nil {
		// Tests and any caller that forgets to wire this get the disabled
		// authenticator rather than a nil dereference. Production cannot reach
		// here: main exits when SIGTOOLS_API_URL is missing.
		authenticator = httpmw.NewDisabledAuthenticator()
	}
	// guard is the single place a route declares what it requires. An empty
	// permission means "any authenticated caller".
	guard := authenticator.RequirePermission
	runtimeGuard := func(operation string, next http.HandlerFunc) http.HandlerFunc {
		return func(writer http.ResponseWriter, request *http.Request) {
			entityKey := strings.ToUpper(strings.TrimSpace(request.PathValue("entityKey")))
			permission := identityDomain.PermCatalogView
			switch entityKey {
			case "INC":
				switch operation {
				case "create":
					permission = identityDomain.PermTicketsCreate
				case "edit":
					permission = identityDomain.PermTicketsEdit
				case "transition":
					permission = identityDomain.PermTicketsResolve
				default:
					permission = identityDomain.PermTicketsView
				}
			case "PRB":
				switch operation {
				case "create":
					permission = identityDomain.PermProblemsCreate
				case "edit", "relation":
					permission = identityDomain.PermProblemsEdit
				case "transition":
					permission = identityDomain.PermProblemsResolve
				default:
					permission = identityDomain.PermProblemsView
				}
			case "RFC":
				switch operation {
				case "create":
					permission = identityDomain.PermChangesCreate
				case "edit", "relation":
					permission = identityDomain.PermChangesEdit
				case "transition":
					permission = identityDomain.PermChangesImplement
				default:
					permission = identityDomain.PermChangesView
				}
			case "":
				writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "entity key is required"})
				return
			default:
				if operation == "create" || operation == "edit" || operation == "transition" || operation == "relation" {
					permission = identityDomain.PermCatalogAuthor
				}
			}
			guard(permission, next)(writer, request)
		}
	}

	mux.HandleFunc("GET /health/live", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /health/ready", func(writer http.ResponseWriter, request *http.Request) {
		if err := dependencies.ReadyCheck(request.Context()); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
	})

	// Who the caller is, as SIG-DESK sees them: the identity verified against
	// SIGTools plus the permission keys this app defines. The SPA uses it to
	// decide what to render without guessing.
	mux.HandleFunc("GET /api/v1/me", authenticator.RequireAuth(func(writer http.ResponseWriter, request *http.Request) {
		identity, _ := identityPorts.IdentityFromContext(request.Context())
		writeJSON(writer, http.StatusOK, map[string]any{
			"identity":          identity,
			"isAdmin":           identity.IsAdmin(),
			"permissionCatalog": identityDomain.PermissionCatalog(),
		})
	}))

	mux.HandleFunc("GET /api/v1/tickets", guard(identityDomain.PermTicketsView, ticketHandler.List))
	mux.HandleFunc("POST /api/v1/tickets", guard(identityDomain.PermTicketsCreate, ticketHandler.Create))
	mux.HandleFunc("GET /api/v1/tickets/{id}", guard(identityDomain.PermTicketsView, ticketHandler.Get))
	mux.HandleFunc("PATCH /api/v1/tickets/{id}/status", guard(identityDomain.PermTicketsResolve, ticketHandler.UpdateStatus))
	mux.HandleFunc("POST /api/v1/tickets/{id}/assign", guard(identityDomain.PermTicketsAssign, ticketHandler.Assign))
	mux.HandleFunc("POST /api/v1/tickets/{id}/merge", guard(identityDomain.PermTicketsMerge, ticketHandler.Merge))
	mux.HandleFunc("POST /api/v1/tickets/{id}/unmerge/{mergedId}", guard(identityDomain.PermTicketsMerge, ticketHandler.Unmerge))
	mux.HandleFunc("GET /api/v1/tickets/{id}/comments", guard(identityDomain.PermTicketsView, ticketHandler.ListComments))
	mux.HandleFunc("POST /api/v1/tickets/{id}/comments", guard(identityDomain.PermTicketsComment, ticketHandler.AddComment))
	mux.HandleFunc("GET /api/v1/tickets/{id}/attachments", guard(identityDomain.PermTicketsView, ticketHandler.ListAttachments))
	mux.HandleFunc("POST /api/v1/tickets/{id}/attachments", guard(identityDomain.PermTicketsAttach, ticketHandler.AddAttachment))
	mux.HandleFunc("GET /api/v1/attachments/{attachmentId}/download", guard(identityDomain.PermTicketsView, ticketHandler.DownloadAttachment))
	// Watching is passive, so reading the ticket is enough to follow it.
	mux.HandleFunc("GET /api/v1/tickets/{id}/watchers", guard(identityDomain.PermTicketsView, ticketHandler.ListWatchers))
	mux.HandleFunc("POST /api/v1/tickets/{id}/watchers", guard(identityDomain.PermTicketsView, ticketHandler.AddWatcher))
	mux.HandleFunc("DELETE /api/v1/tickets/{id}/watchers/{watcherName}", guard(identityDomain.PermTicketsView, ticketHandler.RemoveWatcher))
	mux.HandleFunc("GET /api/v1/tickets/{id}/activity", guard(identityDomain.PermTicketsView, ticketHandler.ListActivity))

	if dependencies.CatalogService != nil {
		catalogHandler := catalogHTTP.NewHandler(dependencies.CatalogService)
		mux.HandleFunc("GET /api/v1/catalog/resources", guard(identityDomain.PermCatalogView, catalogHandler.ListAvailableResources))
		mux.HandleFunc(
			"GET /api/v1/catalog/outbox/status",
			guard(identityDomain.PermCatalogPublish, catalogHandler.GetOutboxStatus),
		)
		mux.HandleFunc("GET /api/v1/catalog/definitions", guard(identityDomain.PermCatalogView, catalogHandler.ListDefinitions))
		mux.HandleFunc("POST /api/v1/catalog/definitions", guard(identityDomain.PermCatalogAuthor, catalogHandler.CreateDraft))
		mux.HandleFunc("GET /api/v1/catalog/definitions/{entityKey}", guard(identityDomain.PermCatalogView, catalogHandler.GetPublishedDefinition))
		mux.HandleFunc("POST /api/v1/catalog/definitions/{entityKey}/versions/{version}/validate", guard(identityDomain.PermCatalogPublish, catalogHandler.ValidatePublication))
		mux.HandleFunc("POST /api/v1/catalog/definitions/{entityKey}/versions/{version}/publish", guard(identityDomain.PermCatalogPublish, catalogHandler.Publish))
		mux.HandleFunc("GET /api/v1/catalog/definitions/{entityKey}/versions/{version}/manifest", guard(identityDomain.PermCatalogView, catalogHandler.GetManifest))
		mux.HandleFunc("POST /api/v1/catalog/definitions/{entityKey}/submit", runtimeGuard("create", catalogHandler.CreateEntity))
		mux.HandleFunc("GET /api/v1/entities/{entityKey}", runtimeGuard("view", catalogHandler.ListEntities))
		mux.HandleFunc(
			"GET /api/v1/entities/{entityKey}/presentation",
			runtimeGuard("view", catalogHandler.GetPublishedDefinition),
		)
		mux.HandleFunc("GET /api/v1/entities/{entityKey}/{entityID}", runtimeGuard("view", catalogHandler.GetEntity))
		mux.HandleFunc("PATCH /api/v1/entities/{entityKey}/{entityID}", runtimeGuard("edit", catalogHandler.UpdateEntity))
		mux.HandleFunc("GET /api/v1/entities/{entityKey}/{entityID}/manifest", runtimeGuard("view", catalogHandler.GetEntityManifest))
		mux.HandleFunc("POST /api/v1/entities/{entityKey}", runtimeGuard("create", catalogHandler.CreateEntity))
		mux.HandleFunc(
			"POST /api/v1/entities/{entityKey}/{entityID}/transitions/{transitionKey}",
			runtimeGuard("transition", catalogHandler.TransitionEntity),
		)
		mux.HandleFunc(
			"GET /api/v1/entities/{entityKey}/{entityID}/relations",
			runtimeGuard("view", catalogHandler.ListEntityRelations),
		)
		mux.HandleFunc(
			"POST /api/v1/entities/{entityKey}/{entityID}/relations",
			runtimeGuard("relation", catalogHandler.CreateEntityRelation),
		)
		mux.HandleFunc(
			"DELETE /api/v1/entities/{entityKey}/{entityID}/relations/{relationID}",
			runtimeGuard("relation", catalogHandler.DeleteEntityRelation),
		)
	}

	if dependencies.LayoutService != nil {
		layoutHandler := catalogHTTP.NewLayoutHandler(dependencies.LayoutService)
		mux.HandleFunc("GET /api/v1/catalog/layouts/{entityKey}/draft", guard(identityDomain.PermCatalogAuthor, layoutHandler.GetDraft))
		mux.HandleFunc("POST /api/v1/catalog/layouts/{entityKey}/draft", guard(identityDomain.PermCatalogAuthor, layoutHandler.CreateDraft))
		mux.HandleFunc("PUT /api/v1/catalog/layouts/{entityKey}/draft", guard(identityDomain.PermCatalogAuthor, layoutHandler.UpdateDraft))
		mux.HandleFunc("POST /api/v1/catalog/layouts/{entityKey}/publish", guard(identityDomain.PermCatalogPublish, layoutHandler.PublishDraft))
		mux.HandleFunc("GET /api/v1/catalog/layouts/{entityKey}/versions", guard(identityDomain.PermCatalogView, layoutHandler.ListVersions))
		mux.HandleFunc("GET /api/v1/catalog/layouts/{entityKey}/active", guard(identityDomain.PermCatalogView, layoutHandler.GetActiveVersion))
		mux.HandleFunc("POST /api/v1/catalog/layouts/{entityKey}/versions/{version}/activate", guard(identityDomain.PermCatalogPublish, layoutHandler.ActivateVersion))
		mux.HandleFunc("GET /api/v1/entities/{entityKey}/{entityID}/resolved-definition", authenticator.RequireAuth(layoutHandler.ResolveLayoutForRecord))
	}
	if dependencies.SLAService != nil {
		slaHandler := slaHTTP.NewHandler(dependencies.SLAService)
		mux.HandleFunc("GET /api/v1/sla/policies", guard(identityDomain.PermSLAView, slaHandler.ListPolicies))
		mux.HandleFunc("POST /api/v1/sla/policies", guard(identityDomain.PermSLAManage, slaHandler.CreateDraft))
		mux.HandleFunc(
			"PUT /api/v1/sla/policies/{resourceID}/versions/{version}",
			guard(identityDomain.PermSLAManage, slaHandler.UpdateDraft),
		)
		mux.HandleFunc(
			"POST /api/v1/sla/policies/{resourceID}/versions/{version}/publish",
			guard(identityDomain.PermSLAManage, slaHandler.Publish),
		)
		mux.HandleFunc("POST /api/v1/sla/preview", guard(identityDomain.PermSLAView, slaHandler.Preview))
		mux.HandleFunc("GET /api/v1/sla/assessments", guard(identityDomain.PermSLAView, slaHandler.ListAssessments))
		mux.HandleFunc("GET /api/v1/sla/assessments/{entityID}", guard(identityDomain.PermSLAView, slaHandler.GetAssessment))
	}
	if dependencies.ChangeService != nil {
		changeHandler := changeHTTP.NewHandler(dependencies.ChangeService)
		mux.HandleFunc(
			"GET /api/v1/changes/definition",
			guard(identityDomain.PermChangesView, changeHandler.Definition),
		)
		mux.HandleFunc(
			"GET /api/v1/changes",
			guard(identityDomain.PermChangesView, changeHandler.List),
		)
		mux.HandleFunc(
			"POST /api/v1/changes",
			guard(identityDomain.PermChangesCreate, changeHandler.Create),
		)
		mux.HandleFunc(
			"GET /api/v1/changes/{id}",
			guard(identityDomain.PermChangesView, changeHandler.Get),
		)
		mux.HandleFunc(
			"PATCH /api/v1/changes/{id}",
			guard(identityDomain.PermChangesEdit, changeHandler.Update),
		)
		mux.HandleFunc(
			"GET /api/v1/changes/{id}/manifest",
			guard(identityDomain.PermChangesView, changeHandler.Manifest),
		)
		mux.HandleFunc(
			"POST /api/v1/changes/{id}/transitions/{transitionKey}",
			func(writer http.ResponseWriter, request *http.Request) {
				permission := identityDomain.PermChangesEdit
				switch request.PathValue("transitionKey") {
				case "approve", "reject":
					permission = identityDomain.PermChangesApprove
				case "start", "complete", "fail", "rollback", "close", "close_after_rollback":
					permission = identityDomain.PermChangesImplement
				}
				guard(permission, changeHandler.Transition)(writer, request)
			},
		)
	}

	// Resolve runs outermost of the app middlewares so every handler and guard
	// sees the verified caller. It replaced a middleware that simply believed
	// the X-Actor-ID / X-Actor-Roles headers the client sent.
	// Role administration lives in SIG-DESK, not in the shared platform: users
	// are provisioned company-wide but what they may do here is this app's own
	// concern (see ADR-0007 and migration 000012).
	if dependencies.RBACService != nil {
		rbacHandler := rbacHTTP.NewHandler(dependencies.RBACService)
		mux.HandleFunc("GET /api/v1/admin/permissions", guard(identityDomain.PermAdminRoles, rbacHandler.ListPermissionCatalog))
		mux.HandleFunc("GET /api/v1/admin/roles", guard(identityDomain.PermAdminRoles, rbacHandler.ListRoles))
		mux.HandleFunc("POST /api/v1/admin/roles", guard(identityDomain.PermAdminRoles, rbacHandler.CreateRole))
		mux.HandleFunc("PATCH /api/v1/admin/roles/{roleID}", guard(identityDomain.PermAdminRoles, rbacHandler.UpdateRole))
		mux.HandleFunc("DELETE /api/v1/admin/roles/{roleID}", guard(identityDomain.PermAdminRoles, rbacHandler.DeleteRole))
		mux.HandleFunc("PUT /api/v1/admin/roles/{roleID}/permissions", guard(identityDomain.PermAdminRoles, rbacHandler.SetRolePermissions))
		mux.HandleFunc("GET /api/v1/admin/users", guard(identityDomain.PermAdminRoles, rbacHandler.ListUsers))
		mux.HandleFunc("PUT /api/v1/admin/users/{username}/roles", guard(identityDomain.PermAdminRoles, rbacHandler.SetUserRoles))
	}

	handler := authenticator.Resolve(mux)
	handler = requestLogger(dependencies.Logger, handler)
	handler = cors(dependencies.Config.FrontendOrigin, handler)
	return recoverPanic(dependencies.Logger, handler)
}

// cors accepts a comma-separated list of origins, because the frontend is
// served from whichever port the developer happens to be running (3003, 5173,
// 5199 have all been in use) and a single value silently blocks every request
// from the others — with a browser-side error that never reaches these logs.
// Each entry also matches its localhost/127.0.0.1 counterpart.
func cors(origins string, next http.Handler) http.Handler {
	allowedOrigins := make(map[string]bool)
	for _, origin := range strings.Split(origins, ",") {
		normalized := normalizeOrigin(strings.TrimSpace(origin))
		if normalized == "" {
			continue
		}
		allowedOrigins[normalized] = true
		allowedOrigins[strings.Replace(normalized, "localhost", "127.0.0.1", 1)] = true
		allowedOrigins[strings.Replace(normalized, "127.0.0.1", "localhost", 1)] = true
	}
	allowAny := strings.TrimSpace(origins) == "*"

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestOrigin := normalizeOrigin(request.Header.Get("Origin"))
		if allowedOrigins[requestOrigin] || (allowAny && requestOrigin != "") {
			writer.Header().Set("Access-Control-Allow-Origin", requestOrigin)
			writer.Header().Set("Access-Control-Allow-Credentials", "true")
			writer.Header().Set("Vary", "Origin")
			writer.Header().Set(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization, Idempotency-Key",
			)
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		}
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		start := time.Now()
		next.ServeHTTP(writer, request)
		logger.Info("request completed",
			"method", request.Method,
			"path", request.URL.Path,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

func recoverPanic(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				logger.Error("panic recovered", "error", recovered, "path", request.URL.Path)
				writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			}
		}()
		next.ServeHTTP(writer, request)
	})
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func normalizeOrigin(origin string) string {
	return strings.TrimSuffix(origin, "/")
}
