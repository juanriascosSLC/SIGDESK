package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"sig-desk/backend/internal/catalog/application"
	"sig-desk/backend/internal/catalog/domain"
	identityDomain "sig-desk/backend/internal/identity/domain"
	identityPorts "sig-desk/backend/internal/identity/ports"
)

type LayoutHandler struct {
	layoutService *application.LayoutService
}

func NewLayoutHandler(layoutService *application.LayoutService) *LayoutHandler {
	return &LayoutHandler{layoutService: layoutService}
}

func (h *LayoutHandler) GetDraft(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")

	draft, err := h.layoutService.GetDraft(r.Context(), actor, entityKey)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

func (h *LayoutHandler) CreateDraft(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")

	var req map[string]any
	if r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	draft, err := h.layoutService.CreateDraft(r.Context(), actor, entityKey, req)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, draft)
}

func (h *LayoutHandler) UpdateDraft(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")

	var req map[string]any
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json payload")
		return
	}

	draft, err := h.layoutService.UpdateDraft(r.Context(), actor, entityKey, req)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

func (h *LayoutHandler) PublishDraft(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")

	published, err := h.layoutService.PublishDraft(r.Context(), actor, entityKey)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, published)
}

func (h *LayoutHandler) ListVersions(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")

	versions, err := h.layoutService.ListVersions(r.Context(), actor, entityKey)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": versions})
}

func (h *LayoutHandler) GetActiveVersion(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")

	active, err := h.layoutService.GetActiveVersion(r.Context(), actor, entityKey)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, active)
}

func (h *LayoutHandler) ActivateVersion(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")
	versionStr := r.PathValue("version")

	version, err := strconv.Atoi(versionStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid version number")
		return
	}

	activated, err := h.layoutService.ActivateVersion(r.Context(), actor, entityKey, version)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, activated)
}

func (h *LayoutHandler) ResolveLayoutForRecord(w http.ResponseWriter, r *http.Request) {
	actor, _ := identityPorts.IdentityFromContext(r.Context())
	entityKey := r.PathValue("entityKey")
	entityID := r.PathValue("entityID")

	resolved, err := h.layoutService.ResolveLayoutForRecord(r.Context(), actor, entityKey, entityID)
	if err != nil {
		handleLayoutError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resolved)
}

func handleLayoutError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, identityDomain.ErrNoCredential):
		writeError(w, http.StatusUnauthorized, err.Error())
	case errors.Is(err, identityDomain.ErrForbidden):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, domain.ErrDraftNotFound), errors.Is(err, domain.ErrLayoutNotFound), errors.Is(err, application.ErrRecordNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, domain.ErrDraftAlreadyExists):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, domain.ErrLayoutIncompatible):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}
