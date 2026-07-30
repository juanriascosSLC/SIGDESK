package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"sig-desk/backend/internal/catalog/application"
	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type Handler struct {
	service *application.Service
}

func NewHandler(service *application.Service) *Handler {
	return &Handler{service: service}
}

func (handler *Handler) ListDefinitions(writer http.ResponseWriter, request *http.Request) {
	publishedOnly := request.URL.Query().Get("status") == "published"
	definitions, err := handler.service.ListDefinitions(request.Context(), publishedOnly)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "could not list catalog definitions")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": definitions})
}

func (handler *Handler) ListAvailableResources(writer http.ResponseWriter, request *http.Request) {
	resources, err := handler.service.ListAvailableResources(
		request.Context(),
		request.URL.Query().Get("module"),
		request.URL.Query().Get("resourceType"),
	)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "could not list module resources")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": resources})
}

func (handler *Handler) GetOutboxStatus(writer http.ResponseWriter, request *http.Request) {
	status, err := handler.service.OutboxStatus(request.Context())
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "could not inspect catalog outbox")
		return
	}
	writeJSON(writer, http.StatusOK, status)
}

func (handler *Handler) GetPublishedDefinition(writer http.ResponseWriter, request *http.Request) {
	definition, err := handler.service.GetPublishedDefinition(request.Context(), request.PathValue("entityKey"))
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, definition)
}

func (handler *Handler) CreateDraft(writer http.ResponseWriter, request *http.Request) {
	var definition domain.Definition
	if err := decodeJSON(writer, request, &definition); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	created, err := handler.service.CreateDraft(request.Context(), definition)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusCreated, created)
}

func (handler *Handler) Publish(writer http.ResponseWriter, request *http.Request) {
	version, ok := parseVersion(writer, request)
	if !ok {
		return
	}
	definition, err := handler.service.Publish(request.Context(), request.PathValue("entityKey"), version)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, definition)
}

func (handler *Handler) ValidatePublication(writer http.ResponseWriter, request *http.Request) {
	version, ok := parseVersion(writer, request)
	if !ok {
		return
	}
	validation, err := handler.service.ValidatePublication(
		request.Context(),
		request.PathValue("entityKey"),
		version,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, validation)
}

func (handler *Handler) GetManifest(writer http.ResponseWriter, request *http.Request) {
	version, ok := parseVersion(writer, request)
	if !ok {
		return
	}
	manifest, err := handler.service.GetManifest(
		request.Context(),
		request.PathValue("entityKey"),
		version,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, manifest)
}

func (handler *Handler) CreateEntity(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Data map[string]any `json:"data"`
	}
	if err := decodeJSON(writer, request, &body); err != nil || body.Data == nil {
		writeError(writer, http.StatusBadRequest, "body must contain a data object")
		return
	}
	entity, replayed, err := handler.service.CreateEntityIdempotent(
		request.Context(),
		request.PathValue("entityKey"),
		body.Data,
		request.Header.Get("Idempotency-Key"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	if request.Header.Get("Idempotency-Key") != "" {
		writer.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
	}
	writeJSON(writer, http.StatusCreated, entity)
}

func (handler *Handler) ListEntities(writer http.ResponseWriter, request *http.Request) {
	entities, err := handler.service.ListEntities(request.Context(), request.PathValue("entityKey"))
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": entities})
}

func (handler *Handler) GetEntity(writer http.ResponseWriter, request *http.Request) {
	entity, err := handler.service.GetEntity(
		request.Context(),
		request.PathValue("entityKey"),
		request.PathValue("entityID"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, entity)
}

func (handler *Handler) GetEntityManifest(writer http.ResponseWriter, request *http.Request) {
	manifest, err := handler.service.GetEntityManifest(
		request.Context(),
		request.PathValue("entityKey"),
		request.PathValue("entityID"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, manifest)
}

func (handler *Handler) UpdateEntity(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Data              map[string]any `json:"data"`
		ExpectedUpdatedAt time.Time      `json:"expectedUpdatedAt"`
	}
	if err := decodeJSON(writer, request, &body); err != nil ||
		body.Data == nil ||
		body.ExpectedUpdatedAt.IsZero() {
		writeError(
			writer,
			http.StatusBadRequest,
			"body must contain data and expectedUpdatedAt",
		)
		return
	}
	entity, err := handler.service.UpdateEntity(
		request.Context(),
		request.PathValue("entityKey"),
		request.PathValue("entityID"),
		body.Data,
		body.ExpectedUpdatedAt,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, entity)
}

func (handler *Handler) TransitionEntity(writer http.ResponseWriter, request *http.Request) {
	entity, err := handler.service.TransitionEntity(
		request.Context(),
		request.PathValue("entityKey"),
		request.PathValue("entityID"),
		request.PathValue("transitionKey"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, entity)
}

func (handler *Handler) ListEntityRelations(writer http.ResponseWriter, request *http.Request) {
	relations, err := handler.service.ListEntityRelations(
		request.Context(),
		request.PathValue("entityKey"),
		request.PathValue("entityID"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": relations})
}

func (handler *Handler) CreateEntityRelation(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		RelationKey     string `json:"relationKey"`
		TargetEntityKey string `json:"targetEntityKey"`
		TargetEntityID  string `json:"targetEntityId"`
	}
	if err := decodeJSON(writer, request, &body); err != nil ||
		body.RelationKey == "" ||
		body.TargetEntityKey == "" ||
		body.TargetEntityID == "" {
		writeError(
			writer,
			http.StatusBadRequest,
			"body must contain relationKey, targetEntityKey and targetEntityId",
		)
		return
	}
	relation, replayed, err := handler.service.CreateEntityRelation(
		request.Context(),
		request.PathValue("entityKey"),
		request.PathValue("entityID"),
		body.RelationKey,
		body.TargetEntityKey,
		body.TargetEntityID,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	status := http.StatusCreated
	if replayed {
		status = http.StatusOK
	}
	writeJSON(writer, status, relation)
}

func (handler *Handler) DeleteEntityRelation(writer http.ResponseWriter, request *http.Request) {
	err := handler.service.DeleteEntityRelation(
		request.Context(),
		request.PathValue("entityKey"),
		request.PathValue("entityID"),
		request.PathValue("relationID"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func handleError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ports.ErrNotFound):
		writeError(writer, http.StatusNotFound, err.Error())
	case errors.Is(err, ports.ErrVersionConflict):
		writeError(writer, http.StatusConflict, err.Error())
	case errors.Is(err, ports.ErrIdempotencyConflict):
		writeError(writer, http.StatusConflict, err.Error())
	case errors.Is(err, ports.ErrInvalidIdempotencyKey):
		writeError(writer, http.StatusBadRequest, err.Error())
	case errors.Is(err, ports.ErrCapabilityDenied):
		writeError(writer, http.StatusForbidden, err.Error())
	case errors.Is(err, domain.ErrInvalidDefinition),
		errors.Is(err, domain.ErrInvalidEntityData),
		errors.Is(err, domain.ErrInvalidTransition),
		errors.Is(err, domain.ErrInvalidRelation):
		writeError(writer, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(writer, http.StatusInternalServerError, "internal server error")
	}
}

func parseVersion(writer http.ResponseWriter, request *http.Request) (int, bool) {
	version, err := strconv.Atoi(request.PathValue("version"))
	if err != nil || version < 1 {
		writeError(writer, http.StatusBadRequest, "invalid definition version")
		return 0, false
	}
	return version, true
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, destination any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 2<<20))
	decoder.DisallowUnknownFields()
	return decoder.Decode(destination)
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}
