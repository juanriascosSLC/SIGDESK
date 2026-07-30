package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	catalogMemory "sig-desk/backend/internal/catalog/adapters/memory"
	catalogModules "sig-desk/backend/internal/catalog/adapters/modules"
	catalogApplication "sig-desk/backend/internal/catalog/application"
	"sig-desk/backend/internal/platform/config"
	"sig-desk/backend/internal/tickets/adapters/blobstore"
	"sig-desk/backend/internal/tickets/adapters/catalogintake"
	"sig-desk/backend/internal/tickets/adapters/memory"
	"sig-desk/backend/internal/tickets/application"
	ticketDomain "sig-desk/backend/internal/tickets/domain"
)

func TestTicketFlow(t *testing.T) {
	repository := memory.NewRepository(nil)
	attachmentStore, err := blobstore.NewLocalDisk(t.TempDir())
	if err != nil {
		t.Fatalf("prepare attachment store: %v", err)
	}
	catalogService := catalogApplication.NewService(
		catalogMemory.NewRepository(catalogMemory.DemoDefinitions()...),
		catalogModules.NewDevelopmentRegistry(),
	)
	handler := New(Dependencies{
		Config: config.Config{
			Environment:    "test",
			FrontendOrigin: "http://localhost:3003",
		},
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		TicketService:  application.NewService(repository, attachmentStore, catalogintake.NewAdapter(catalogService)),
		CatalogService: catalogService,
		ReadyCheck:     func(context.Context) error { return nil },
	})

	createBody := `{
		"title":"Camera offline",
		"description":"The entrance camera is not responding to health checks.",
		"priority":"critical",
		"category":"hardware",
		"requesterName":"Test User",
		"assetId":"CAM-100"
	}`
	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/tickets", strings.NewReader(createBody))
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)

	if createResponse.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body=%s", createResponse.Code, http.StatusCreated, createResponse.Body.String())
	}

	var created struct {
		ID       string  `json:"id"`
		Status   string  `json:"status"`
		EntityID *string `json:"entityId"`
	}
	if err := json.NewDecoder(createResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode created ticket: %v", err)
	}
	if created.Status != "open" {
		t.Fatalf("created status = %q, want open", created.Status)
	}
	if created.EntityID == nil || *created.EntityID == "" {
		t.Fatalf("legacy ticket create did not return a catalog entity: %#v", created)
	}
	if createResponse.Header().Get("Deprecation") != "true" {
		t.Fatalf("legacy endpoint is missing its deprecation contract")
	}
	if successor := createResponse.Header().Get("Link"); !strings.Contains(successor, "/api/v1/entities/INC") {
		t.Fatalf("legacy endpoint successor = %q", successor)
	}
	entities, err := catalogService.ListEntities(context.Background(), "INC")
	if err != nil {
		t.Fatalf("list catalog entities: %v", err)
	}
	if len(entities) != 1 || entities[0].ID != *created.EntityID {
		t.Fatalf("ticket was not created by Catalog: %#v", entities)
	}
	if _, exists := entities[0].Data["category"]; exists {
		t.Fatalf("legacy-only field leaked into the published INC schema: %#v", entities[0].Data)
	}

	updateRequest := httptest.NewRequest(
		http.MethodPatch,
		"/api/v1/tickets/"+created.ID+"/status",
		strings.NewReader(`{"status":"in_progress"}`),
	)
	updateRequest.Header.Set("Content-Type", "application/json")
	updateResponse := httptest.NewRecorder()
	handler.ServeHTTP(updateResponse, updateRequest)

	if updateResponse.Code != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body=%s", updateResponse.Code, http.StatusOK, updateResponse.Body.String())
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/tickets", nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("list status = %d, want %d", listResponse.Code, http.StatusOK)
	}
}

func TestTicketActivityContractNormalizesLegacyMergePayload(t *testing.T) {
	repository := memory.NewRepository([]ticketDomain.Ticket{
		{
			ID:            "INC-LEGACY",
			Title:         "Legacy merged ticket",
			Description:   "Created before the activity contract was versioned.",
			Status:        ticketDomain.StatusOpen,
			Priority:      ticketDomain.PriorityLow,
			RequesterName: "Migration",
		},
	})
	if err := repository.RecordActivity(
		context.Background(),
		"INC-LEGACY",
		ticketDomain.ActivityMerged,
		nil,
		map[string]any{"mergedIds": "INC-000002"},
	); err != nil {
		t.Fatalf("record legacy activity: %v", err)
	}

	handler := New(Dependencies{
		Config: config.Config{
			Environment:    "test",
			FrontendOrigin: "http://localhost:3003",
		},
		Logger:        slog.New(slog.NewTextHandler(io.Discard, nil)),
		TicketService: application.NewService(repository, nil, nil),
		ReadyCheck:    func(context.Context) error { return nil },
	})

	request := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/tickets/INC-LEGACY/activity",
		nil,
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("activity status = %d; body=%s", response.Code, response.Body.String())
	}

	var body struct {
		Items []struct {
			ContractVersion int `json:"contractVersion"`
			Payload         struct {
				MergedIDs []string `json:"mergedIds"`
			} `json:"payload"`
		} `json:"items"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode activity response: %v", err)
	}
	if len(body.Items) != 1 {
		t.Fatalf("activity item count = %d, want 1", len(body.Items))
	}
	if body.Items[0].ContractVersion != ticketDomain.ActivityContractVersion {
		t.Fatalf(
			"contractVersion = %d, want %d",
			body.Items[0].ContractVersion,
			ticketDomain.ActivityContractVersion,
		)
	}
	if len(body.Items[0].Payload.MergedIDs) != 1 ||
		body.Items[0].Payload.MergedIDs[0] != "INC-000002" {
		t.Fatalf("mergedIds = %#v, want [INC-000002]", body.Items[0].Payload.MergedIDs)
	}
}

func TestMetadataRuntimeFlow(t *testing.T) {
	ticketRepository := memory.NewRepository(nil)
	attachmentStore, err := blobstore.NewLocalDisk(t.TempDir())
	if err != nil {
		t.Fatalf("prepare attachment store: %v", err)
	}
	catalogRepository := catalogMemory.NewRepository(catalogMemory.DemoDefinitions()...)
	catalogService := catalogApplication.NewService(
		catalogRepository,
		catalogModules.NewDevelopmentRegistry(),
	)
	handler := New(Dependencies{
		Config: config.Config{
			Environment:    "test",
			FrontendOrigin: "http://localhost:3003",
		},
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		TicketService: application.NewService(
			ticketRepository,
			attachmentStore,
			catalogintake.NewAdapter(catalogService),
		),
		CatalogService: catalogService,
		ReadyCheck:     func(context.Context) error { return nil },
	})

	definitionRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/catalog/definitions/INC",
		nil,
	)
	definitionResponse := httptest.NewRecorder()
	handler.ServeHTTP(definitionResponse, definitionRequest)
	if definitionResponse.Code != http.StatusOK {
		t.Fatalf("definition status = %d; body=%s", definitionResponse.Code, definitionResponse.Body.String())
	}

	createRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/entities/INC",
		strings.NewReader(`{
			"data": {
				"title": "Camera offline",
				"description": "The entrance camera stopped responding.",
				"priority": "critical"
			}
		}`),
	)
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusCreated {
		t.Fatalf("entity create status = %d; body=%s", createResponse.Code, createResponse.Body.String())
	}
	var created struct {
		ID                  string `json:"id"`
		State               string `json:"state"`
		DefinitionVersionID string `json:"definitionVersionId"`
		ManifestChecksum    string `json:"manifestChecksum"`
	}
	if err := json.NewDecoder(createResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode entity: %v", err)
	}
	if created.State != "open" || created.DefinitionVersionID == "" || created.ManifestChecksum == "" {
		t.Fatalf("entity lacks executable definition identity: %#v", created)
	}

	getRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/entities/INC/"+created.ID,
		nil,
	)
	getResponse := httptest.NewRecorder()
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("get entity status = %d; body=%s", getResponse.Code, getResponse.Body.String())
	}
	var fetched struct {
		ID                string         `json:"id"`
		DefinitionVersion int            `json:"definitionVersion"`
		Data              map[string]any `json:"data"`
		UpdatedAt         string         `json:"updatedAt"`
	}
	if err := json.NewDecoder(getResponse.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode fetched entity: %v", err)
	}
	if fetched.ID != created.ID || fetched.DefinitionVersion < 1 || fetched.Data["title"] != "Camera offline" {
		t.Fatalf("fetched entity does not preserve versioned data: %#v", fetched)
	}

	manifestRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/entities/INC/"+created.ID+"/manifest",
		nil,
	)
	manifestResponse := httptest.NewRecorder()
	handler.ServeHTTP(manifestResponse, manifestRequest)
	if manifestResponse.Code != http.StatusOK {
		t.Fatalf("get entity manifest status = %d; body=%s", manifestResponse.Code, manifestResponse.Body.String())
	}
	var manifest struct {
		Version  int    `json:"version"`
		Checksum string `json:"checksum"`
	}
	if err := json.NewDecoder(manifestResponse.Body).Decode(&manifest); err != nil {
		t.Fatalf("decode entity manifest: %v", err)
	}
	if manifest.Version != fetched.DefinitionVersion || manifest.Checksum == "" {
		t.Fatalf("entity manifest is not version locked: %#v", manifest)
	}

	updateBody := fmt.Sprintf(`{
			"data": {
				"title": "Camera offline at main gate",
				"description": "The entrance camera stopped responding.",
				"priority": "critical"
			},
			"expectedUpdatedAt": %q
		}`, fetched.UpdatedAt)
	updateRequest := httptest.NewRequest(
		http.MethodPatch,
		"/api/v1/entities/INC/"+created.ID,
		strings.NewReader(updateBody),
	)
	updateResponse := httptest.NewRecorder()
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("update entity status = %d; body=%s", updateResponse.Code, updateResponse.Body.String())
	}
	staleUpdateResponse := httptest.NewRecorder()
	handler.ServeHTTP(
		staleUpdateResponse,
		httptest.NewRequest(
			http.MethodPatch,
			"/api/v1/entities/INC/"+created.ID,
			strings.NewReader(updateBody),
		),
	)
	if staleUpdateResponse.Code != http.StatusConflict {
		t.Fatalf(
			"stale update status = %d, want 409; body=%s",
			staleUpdateResponse.Code,
			staleUpdateResponse.Body.String(),
		)
	}

	transitionRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/entities/INC/"+created.ID+"/transitions/start",
		nil,
	)
	transitionResponse := httptest.NewRecorder()
	handler.ServeHTTP(transitionResponse, transitionRequest)
	if transitionResponse.Code != http.StatusOK {
		t.Fatalf("transition status = %d; body=%s", transitionResponse.Code, transitionResponse.Body.String())
	}
	var transitioned struct {
		State string `json:"state"`
	}
	if err := json.NewDecoder(transitionResponse.Body).Decode(&transitioned); err != nil {
		t.Fatalf("decode transition: %v", err)
	}
	if transitioned.State != "in_progress" {
		t.Fatalf("transitioned state = %q, want in_progress", transitioned.State)
	}
}
