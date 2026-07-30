package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	identityPorts "sig-desk/backend/internal/identity/ports"
	"sig-desk/backend/internal/rbac/application"
	"sig-desk/backend/internal/rbac/domain"
)

type Handler struct {
	service *application.Service
}

func NewHandler(service *application.Service) *Handler {
	return &Handler{service: service}
}

// ListPermissionCatalog returns the permission keys SIG-DESK defines and
// enforces. The admin UI reads it so it offers exactly what the routes check.
func (handler *Handler) ListPermissionCatalog(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{
		"items": handler.service.PermissionCatalog(),
	})
}

func (handler *Handler) ListRoles(writer http.ResponseWriter, request *http.Request) {
	roles, err := handler.service.ListRoles(request.Context())
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": roles})
}

type roleRequest struct {
	Name           string   `json:"name"`
	Label          string   `json:"label"`
	Description    string   `json:"description"`
	PermissionKeys []string `json:"permissionKeys"`
}

func (handler *Handler) CreateRole(writer http.ResponseWriter, request *http.Request) {
	var body roleRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	role, err := handler.service.CreateRole(request.Context(), domain.NewRole{
		Name:        body.Name,
		Label:       body.Label,
		Description: body.Description,
	}, body.PermissionKeys)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusCreated, role)
}

func (handler *Handler) UpdateRole(writer http.ResponseWriter, request *http.Request) {
	var body roleRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	role, err := handler.service.UpdateRole(request.Context(), request.PathValue("roleID"), domain.NewRole{
		Name:        body.Name,
		Label:       body.Label,
		Description: body.Description,
	})
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, role)
}

func (handler *Handler) DeleteRole(writer http.ResponseWriter, request *http.Request) {
	if err := handler.service.DeleteRole(request.Context(), request.PathValue("roleID")); err != nil {
		handleError(writer, err)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

// SetRolePermissions replaces the role's grants with exactly the keys sent.
func (handler *Handler) SetRolePermissions(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		PermissionKeys []string `json:"permissionKeys"`
	}
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	role, err := handler.service.SetRolePermissions(
		request.Context(), request.PathValue("roleID"), body.PermissionKeys,
	)
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, role)
}

// ListUsers returns people who have signed in to SIG-DESK, plus anyone already
// granted a role. Accounts themselves live in Active Directory / SIGTools —
// this app never creates or deletes them.
func (handler *Handler) ListUsers(writer http.ResponseWriter, request *http.Request) {
	users, err := handler.service.ListKnownUsers(request.Context())
	if err != nil {
		handleError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": users})
}

// SetUserRoles replaces which SIG-DESK roles a username holds.
func (handler *Handler) SetUserRoles(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		RoleIDs []string `json:"roleIds"`
	}
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	// Recorded for the audit trail from the verified session, never from the body.
	grantedBy := identityPorts.ActorFromContext(request.Context())
	if err := handler.service.SetUserRoles(
		request.Context(), request.PathValue("username"), body.RoleIDs, grantedBy,
	); err != nil {
		handleError(writer, err)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func handleError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrRoleNotFound):
		writeError(writer, http.StatusNotFound, err.Error())
	case errors.Is(err, domain.ErrRoleNameTaken):
		writeError(writer, http.StatusConflict, err.Error())
	case errors.Is(err, domain.ErrSystemRoleLocked):
		writeError(writer, http.StatusForbidden, err.Error())
	case errors.Is(err, domain.ErrInvalidRoleName),
		errors.Is(err, domain.ErrInvalidRoleLabel),
		errors.Is(err, domain.ErrUnknownPermission),
		errors.Is(err, domain.ErrUnknownRole):
		writeError(writer, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(writer, http.StatusInternalServerError, "internal server error")
	}
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, destination any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1<<20))
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
