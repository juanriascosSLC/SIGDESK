package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
	"sig-desk/backend/internal/changes/application"
)

type Handler struct {
	service *application.Service
}

func NewHandler(service *application.Service) *Handler {
	return &Handler{service: service}
}

func (handler *Handler) Definition(writer http.ResponseWriter, request *http.Request) {
	definition, err := handler.service.Definition(request.Context())
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, definition)
}

func (handler *Handler) List(writer http.ResponseWriter, request *http.Request) {
	entities, err := handler.service.List(request.Context())
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": entities})
}

func (handler *Handler) Get(writer http.ResponseWriter, request *http.Request) {
	entity, err := handler.service.Get(request.Context(), request.PathValue("id"))
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, entity)
}

func (handler *Handler) Manifest(writer http.ResponseWriter, request *http.Request) {
	manifest, err := handler.service.Manifest(request.Context(), request.PathValue("id"))
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, manifest)
}

func (handler *Handler) Create(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Data map[string]any `json:"data"`
	}
	if err := decodeJSON(writer, request, &body); err != nil || body.Data == nil {
		writeError(writer, http.StatusBadRequest, "body must contain a data object")
		return
	}
	entity, replayed, err := handler.service.Create(
		request.Context(),
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

func (handler *Handler) Update(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Data              map[string]any `json:"data"`
		ExpectedUpdatedAt time.Time      `json:"expectedUpdatedAt"`
	}
	if err := decodeJSON(writer, request, &body); err != nil ||
		body.Data == nil ||
		body.ExpectedUpdatedAt.IsZero() {
		writeError(writer, http.StatusBadRequest, "body must contain data and expectedUpdatedAt")
		return
	}
	entity, err := handler.service.Update(
		request.Context(),
		request.PathValue("id"),
		body.Data,
		body.ExpectedUpdatedAt,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, entity)
}

func (handler *Handler) Transition(writer http.ResponseWriter, request *http.Request) {
	entity, err := handler.service.Transition(
		request.Context(),
		request.PathValue("id"),
		request.PathValue("transitionKey"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, entity)
}

func handleError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, catalogPorts.ErrNotFound):
		writeError(writer, http.StatusNotFound, err.Error())
	case errors.Is(err, catalogPorts.ErrVersionConflict),
		errors.Is(err, catalogPorts.ErrIdempotencyConflict):
		writeError(writer, http.StatusConflict, err.Error())
	case errors.Is(err, catalogPorts.ErrInvalidIdempotencyKey):
		writeError(writer, http.StatusBadRequest, err.Error())
	case errors.Is(err, catalogPorts.ErrCapabilityDenied):
		writeError(writer, http.StatusForbidden, err.Error())
	case errors.Is(err, catalogDomain.ErrInvalidDefinition),
		errors.Is(err, catalogDomain.ErrInvalidEntityData),
		errors.Is(err, catalogDomain.ErrInvalidTransition):
		writeError(writer, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(writer, http.StatusInternalServerError, "internal server error")
	}
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
