package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"sig-desk/backend/internal/sla/application"
	"sig-desk/backend/internal/sla/domain"
)

type Handler struct {
	service *application.Service
}

func NewHandler(service *application.Service) *Handler {
	return &Handler{service: service}
}

func (handler *Handler) ListPolicies(writer http.ResponseWriter, request *http.Request) {
	policies, err := handler.service.ListPolicies(request.Context())
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "could not list SLA policies")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": policies})
}

func (handler *Handler) CreateDraft(writer http.ResponseWriter, request *http.Request) {
	var policy domain.Policy
	if err := decodeJSON(writer, request, &policy); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	created, err := handler.service.CreateDraft(request.Context(), policy)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusCreated, created)
}

func (handler *Handler) UpdateDraft(writer http.ResponseWriter, request *http.Request) {
	version, err := strconv.Atoi(request.PathValue("version"))
	if err != nil || version < 1 {
		writeError(writer, http.StatusBadRequest, "invalid SLA policy version")
		return
	}
	var policy domain.Policy
	if err := decodeJSON(writer, request, &policy); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	policy.ResourceID = request.PathValue("resourceID")
	policy.Version = version
	policy.Status = domain.StatusDraft
	updated, err := handler.service.UpdateDraft(request.Context(), policy)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, updated)
}

func (handler *Handler) Publish(writer http.ResponseWriter, request *http.Request) {
	version, err := strconv.Atoi(request.PathValue("version"))
	if err != nil || version < 1 {
		writeError(writer, http.StatusBadRequest, "invalid SLA policy version")
		return
	}
	policy, err := handler.service.Publish(
		request.Context(),
		request.PathValue("resourceID"),
		version,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, policy)
}

func (handler *Handler) Preview(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		ResourceID string    `json:"resourceId"`
		Version    int       `json:"version"`
		Priority   string    `json:"priority"`
		StartedAt  time.Time `json:"startedAt"`
	}
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	preview, err := handler.service.Preview(
		request.Context(),
		body.ResourceID,
		body.Version,
		body.Priority,
		body.StartedAt,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, preview)
}

func (handler *Handler) ListAssessments(writer http.ResponseWriter, request *http.Request) {
	assessments, err := handler.service.ListAssessments(request.Context())
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "could not list SLA assessments")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": assessments})
}

func (handler *Handler) GetAssessment(writer http.ResponseWriter, request *http.Request) {
	assessment, err := handler.service.GetAssessment(
		request.Context(),
		request.PathValue("entityID"),
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, assessment)
}

func handleError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrPolicyNotFound):
		writeError(writer, http.StatusNotFound, err.Error())
	case errors.Is(err, domain.ErrInvalidPolicy):
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
