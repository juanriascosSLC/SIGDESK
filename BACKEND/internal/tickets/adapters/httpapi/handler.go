package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	identityPorts "sig-desk/backend/internal/identity/ports"
	"sig-desk/backend/internal/tickets/application"
	"sig-desk/backend/internal/tickets/domain"
	"sig-desk/backend/internal/tickets/ports"
)

type Handler struct {
	service *application.Service
}

func NewHandler(service *application.Service) *Handler {
	return &Handler{service: service}
}

// localDevActor is recorded when the deployment runs with authentication
// disabled. It is deliberately not read from the request body: letting a
// client name itself is exactly the weakness this replaced, and allowing it
// "only in dev" would quietly return the moment a non-production deployment
// forgot to configure the auth authority.
const localDevActor = "Local Dev"

// actor is the verified caller, for audit fields (activity, comment author,
// uploader, watcher). Any actorName/authorName/uploaderName still present in a
// request body is ignored.
func actor(ctx context.Context) string {
	if name := identityPorts.ActorFromContext(ctx); name != nil {
		return *name
	}
	return localDevActor
}

func actorPointer(ctx context.Context) *string {
	name := actor(ctx)
	return &name
}

type createTicketRequest struct {
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	Priority      domain.Priority `json:"priority"`
	Category      string          `json:"category"`
	RequesterName string          `json:"requesterName"`
	AssetID       *string         `json:"assetId"`
	Site          *string         `json:"site"`
}

// The ActorName / AuthorName / WatcherName fields below are accepted but
// ignored: the actor always comes from the authenticated session. They stay
// declared only because the JSON decoder rejects unknown fields, so removing
// them outright would turn older clients' requests into 400s instead of
// harmlessly disregarding a value we no longer trust.

type updateStatusRequest struct {
	Status    domain.Status `json:"status"`
	ActorName *string       `json:"actorName"` // ignored
}

type assignRequest struct {
	AssigneeName *string `json:"assigneeName"`
	ActorName    *string `json:"actorName"` // ignored
}

type mergeRequest struct {
	MergedIDs []string `json:"mergedIds"`
	ActorName *string  `json:"actorName"` // ignored
}

type addCommentRequest struct {
	AuthorName string `json:"authorName"` // ignored
	Body       string `json:"body"`
	IsInternal bool   `json:"isInternal"`
}

type watcherRequest struct {
	WatcherName string `json:"watcherName"` // ignored: you watch as yourself
}

func (handler *Handler) List(writer http.ResponseWriter, request *http.Request) {
	query := request.URL.Query()
	limit := 0
	if raw := query.Get("limit"); raw != "" {
		limit, _ = strconv.Atoi(raw)
	}
	filter := domain.TicketFilter{
		Status:     domain.Status(query.Get("status")),
		Priority:   domain.Priority(query.Get("priority")),
		Category:   query.Get("category"),
		Site:       query.Get("site"),
		Assignee:   query.Get("assignee"),
		Unassigned: query.Get("unassigned") == "true",
		Search:     query.Get("q"),
		Cursor:     query.Get("cursor"),
		Limit:      limit,
		MergedInto: query.Get("mergedInto"),
	}
	page, err := handler.service.List(request.Context(), filter)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "could not list tickets")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"items":      page.Items,
		"nextCursor": page.NextCursor,
		"hasMore":    page.HasMore,
	})
}

func (handler *Handler) Get(writer http.ResponseWriter, request *http.Request) {
	ticket, err := handler.service.Get(request.Context(), request.PathValue("id"))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, ticket)
}

func (handler *Handler) Create(writer http.ResponseWriter, request *http.Request) {
	var body createTicketRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	data := map[string]any{
		"title":         body.Title,
		"description":   body.Description,
		"priority":      string(body.Priority),
		"category":      body.Category,
		"requesterName": body.RequesterName,
	}
	if body.AssetID != nil {
		data["assetId"] = *body.AssetID
	}
	if body.Site != nil {
		data["site"] = *body.Site
	}
	idempotencyKey := request.Header.Get("Idempotency-Key")
	ticket, replayed, err := handler.service.CreateFromCatalogIntake(
		request.Context(),
		"INC",
		data,
		idempotencyKey,
	)
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writer.Header().Set("Deprecation", "true")
	writer.Header().Set("Link", "</api/v1/entities/INC>; rel=\"successor-version\"")
	if idempotencyKey != "" {
		writer.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
	}
	writeJSON(writer, http.StatusCreated, ticket)
}

func (handler *Handler) UpdateStatus(writer http.ResponseWriter, request *http.Request) {
	var body updateStatusRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ticket, err := handler.service.UpdateStatus(request.Context(), request.PathValue("id"), body.Status, actorPointer(request.Context()))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, ticket)
}

func (handler *Handler) Assign(writer http.ResponseWriter, request *http.Request) {
	var body assignRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ticket, err := handler.service.Assign(request.Context(), request.PathValue("id"), body.AssigneeName, actorPointer(request.Context()))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, ticket)
}

func (handler *Handler) Merge(writer http.ResponseWriter, request *http.Request) {
	var body mergeRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ticket, err := handler.service.Merge(request.Context(), request.PathValue("id"), body.MergedIDs, actorPointer(request.Context()))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, ticket)
}

func (handler *Handler) Unmerge(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		ActorName *string `json:"actorName"`
	}
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ticket, err := handler.service.Unmerge(request.Context(), request.PathValue("id"), request.PathValue("mergedId"), actorPointer(request.Context()))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, ticket)
}

func (handler *Handler) AddComment(writer http.ResponseWriter, request *http.Request) {
	var body addCommentRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	comment, err := handler.service.AddComment(request.Context(), request.PathValue("id"), domain.NewComment{
		AuthorName: actor(request.Context()),
		Body:       body.Body,
		IsInternal: body.IsInternal,
	})
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusCreated, comment)
}

func (handler *Handler) ListComments(writer http.ResponseWriter, request *http.Request) {
	comments, err := handler.service.ListComments(request.Context(), request.PathValue("id"))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": comments})
}

const maxUploadBytes = domain.MaxAttachmentSizeBytes + (1 << 20) // attachment limit + form overhead

func (handler *Handler) AddAttachment(writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, maxUploadBytes)
	if err := request.ParseMultipartForm(10 << 20); err != nil {
		writeError(writer, http.StatusBadRequest, "could not parse multipart form")
		return
	}
	file, header, err := request.FormFile("file")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "form field 'file' is required")
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	attachment, err := handler.service.AddAttachment(request.Context(), request.PathValue("id"), domain.NewAttachment{
		UploaderName: actor(request.Context()),
		FileName:     header.Filename,
		ContentType:  contentType,
		SizeBytes:    header.Size,
	}, file)
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusCreated, attachment)
}

func (handler *Handler) ListAttachments(writer http.ResponseWriter, request *http.Request) {
	attachments, err := handler.service.ListAttachments(request.Context(), request.PathValue("id"))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": attachments})
}

func (handler *Handler) DownloadAttachment(writer http.ResponseWriter, request *http.Request) {
	attachment, content, err := handler.service.OpenAttachment(request.Context(), request.PathValue("attachmentId"))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	defer content.Close()

	writer.Header().Set("Content-Type", attachment.ContentType)
	writer.Header().Set("Content-Disposition", `attachment; filename="`+attachment.FileName+`"`)
	writer.Header().Set("Content-Length", strconv.FormatInt(attachment.SizeBytes, 10))
	_, _ = io.Copy(writer, content)
}

// AddWatcher subscribes the authenticated caller. Watching on someone else's
// behalf is not offered: a watcher list that anyone could add anyone to is a
// notification-spam vector, and the UI only ever watches as the current user.
func (handler *Handler) AddWatcher(writer http.ResponseWriter, request *http.Request) {
	var body watcherRequest
	if err := decodeJSON(writer, request, &body); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := handler.service.Watch(request.Context(), request.PathValue("id"), actor(request.Context())); err != nil {
		handleServiceError(writer, err)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (handler *Handler) RemoveWatcher(writer http.ResponseWriter, request *http.Request) {
	if err := handler.service.Unwatch(request.Context(), request.PathValue("id"), request.PathValue("watcherName")); err != nil {
		handleServiceError(writer, err)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (handler *Handler) ListWatchers(writer http.ResponseWriter, request *http.Request) {
	watchers, err := handler.service.ListWatchers(request.Context(), request.PathValue("id"))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": watchers})
}

func (handler *Handler) ListActivity(writer http.ResponseWriter, request *http.Request) {
	activity, err := handler.service.ListActivity(request.Context(), request.PathValue("id"))
	if err != nil {
		handleServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": activity})
}

func handleServiceError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ports.ErrNotFound), errors.Is(err, domain.ErrCatalogDefinitionNotFound):
		writeError(writer, http.StatusNotFound, err.Error())
	case errors.Is(err, domain.ErrHumanIDConflict):
		writeError(writer, http.StatusConflict, err.Error())
	case errors.Is(err, domain.ErrIdempotencyConflict):
		writeError(writer, http.StatusConflict, err.Error())
	case errors.Is(err, domain.ErrInvalidIdempotencyKey):
		writeError(writer, http.StatusBadRequest, err.Error())
	case errors.Is(err, domain.ErrInvalidStatus),
		errors.Is(err, domain.ErrInvalidTransition),
		errors.Is(err, domain.ErrInvalidComment),
		errors.Is(err, domain.ErrAttachmentTooLarge),
		errors.Is(err, domain.ErrAttachmentEmpty),
		errors.Is(err, domain.ErrInvalidWatcherName),
		errors.Is(err, domain.ErrCannotMergeIntoSelf),
		errors.Is(err, domain.ErrTicketAlreadyMerged),
		errors.Is(err, domain.ErrTicketNotMerged),
		errors.Is(err, domain.ErrNoTicketsToMerge),
		errors.Is(err, domain.ErrCatalogValidation):
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
