package application

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"path/filepath"
	"strings"

	"sig-desk/backend/internal/tickets/domain"
	"sig-desk/backend/internal/tickets/ports"
)

type Service struct {
	repository  ports.Repository
	attachments ports.AttachmentStore
	catalog     ports.CatalogIntakePort
}

func NewService(repository ports.Repository, attachments ports.AttachmentStore, catalog ports.CatalogIntakePort) *Service {
	return &Service{repository: repository, attachments: attachments, catalog: catalog}
}

var _ ports.CatalogProjectionPort = (*Service)(nil)

func (service *Service) List(ctx context.Context, filter domain.TicketFilter) (domain.TicketPage, error) {
	return service.repository.List(ctx, filter)
}

func (service *Service) Get(ctx context.Context, id string) (domain.Ticket, error) {
	return service.repository.GetByID(ctx, strings.ToUpper(strings.TrimSpace(id)))
}

// CreateFromCatalogIntake preserves the legacy Tickets API contract while
// making Catalog the only creation authority. The synchronous projection
// provides read-your-write compatibility; the transactional outbox remains
// the durable delivery path and can safely reapply the event later.
func (service *Service) CreateFromCatalogIntake(
	ctx context.Context,
	entityKey string,
	data map[string]any,
	idempotencyKey string,
) (domain.Ticket, bool, error) {
	if service.catalog == nil {
		return domain.Ticket{}, false, domain.ErrCatalogDefinitionNotFound
	}
	event, err := service.catalog.CreateEntity(ctx, entityKey, data, idempotencyKey)
	if err != nil {
		return domain.Ticket{}, false, err
	}
	if err := service.ApplyEntityCreated(ctx, event); err != nil {
		return domain.Ticket{}, false, err
	}
	ticket, err := service.Get(ctx, event.HumanID)
	return ticket, event.Replayed, err
}

func (service *Service) UpdateStatus(ctx context.Context, id string, status domain.Status, actorName *string) (domain.Ticket, error) {
	current, err := service.Get(ctx, id)
	if err != nil {
		return domain.Ticket{}, err
	}
	if current.IsMerged() {
		return domain.Ticket{}, domain.ErrTicketAlreadyMerged
	}
	if current.EntityID != nil {
		if service.catalog == nil {
			return domain.Ticket{}, domain.ErrInvalidTransition
		}
		if err := service.catalog.TransitionEntity(
			ctx,
			"INC",
			*current.EntityID,
			string(status),
		); err != nil {
			return domain.Ticket{}, err
		}
		updated := current
		updated.Status = status
		_ = service.repository.RecordActivity(
			ctx,
			current.ID,
			domain.ActivityStatusChanged,
			actorName,
			map[string]any{
				"from":   string(current.Status),
				"to":     string(status),
				"source": "catalog-runtime",
			},
		)
		return updated, nil
	}
	if !status.Valid() {
		return domain.Ticket{}, domain.ErrInvalidStatus
	}
	if !domain.CanTransition(current.Status, status) {
		return domain.Ticket{}, domain.ErrInvalidTransition
	}
	updated, err := service.repository.UpdateStatus(ctx, current.ID, status)
	if err != nil {
		return domain.Ticket{}, err
	}
	_ = service.repository.RecordActivity(ctx, updated.ID, domain.ActivityStatusChanged, actorName, map[string]any{
		"from": string(current.Status),
		"to":   string(updated.Status),
	})
	return updated, nil
}

func (service *Service) Assign(ctx context.Context, id string, assigneeName *string, actorName *string) (domain.Ticket, error) {
	current, err := service.Get(ctx, id)
	if err != nil {
		return domain.Ticket{}, err
	}
	if current.IsMerged() {
		return domain.Ticket{}, domain.ErrTicketAlreadyMerged
	}
	normalized := normalizeOptionalName(assigneeName)
	updated, err := service.repository.Assign(ctx, current.ID, normalized)
	if err != nil {
		return domain.Ticket{}, err
	}
	payload := map[string]any{"assigneeName": nil}
	if normalized != nil {
		payload["assigneeName"] = *normalized
	}
	_ = service.repository.RecordActivity(ctx, updated.ID, domain.ActivityAssigned, actorName, payload)
	return updated, nil
}

func (service *Service) Merge(ctx context.Context, primaryID string, mergedIDs []string, actorName *string) (domain.Ticket, error) {
	primaryID = strings.ToUpper(strings.TrimSpace(primaryID))
	cleaned := make([]string, 0, len(mergedIDs))
	for _, id := range mergedIDs {
		id = strings.ToUpper(strings.TrimSpace(id))
		if id == "" {
			continue
		}
		if id == primaryID {
			return domain.Ticket{}, domain.ErrCannotMergeIntoSelf
		}
		cleaned = append(cleaned, id)
	}
	if len(cleaned) == 0 {
		return domain.Ticket{}, domain.ErrNoTicketsToMerge
	}

	primary, err := service.Get(ctx, primaryID)
	if err != nil {
		return domain.Ticket{}, err
	}
	if primary.IsMerged() {
		return domain.Ticket{}, domain.ErrTicketAlreadyMerged
	}
	for _, id := range cleaned {
		merged, err := service.Get(ctx, id)
		if err != nil {
			return domain.Ticket{}, err
		}
		if merged.IsMerged() {
			return domain.Ticket{}, domain.ErrTicketAlreadyMerged
		}
	}

	return service.repository.Merge(ctx, primaryID, cleaned, actorName)
}

func (service *Service) Unmerge(ctx context.Context, primaryID string, mergedID string, actorName *string) (domain.Ticket, error) {
	primaryID = strings.ToUpper(strings.TrimSpace(primaryID))
	mergedID = strings.ToUpper(strings.TrimSpace(mergedID))

	merged, err := service.Get(ctx, mergedID)
	if err != nil {
		return domain.Ticket{}, err
	}
	if merged.MergedIntoID == nil || strings.ToUpper(*merged.MergedIntoID) != primaryID {
		return domain.Ticket{}, domain.ErrTicketNotMerged
	}
	return service.repository.Unmerge(ctx, primaryID, mergedID, actorName)
}

func (service *Service) AddComment(ctx context.Context, ticketID string, input domain.NewComment) (domain.Comment, error) {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return domain.Comment{}, err
	}
	input.AuthorName = strings.TrimSpace(input.AuthorName)
	input.Body = strings.TrimSpace(input.Body)
	if input.AuthorName == "" {
		input.AuthorName = "Current User"
	}
	if err := input.Validate(); err != nil {
		return domain.Comment{}, err
	}
	comment, err := service.repository.AddComment(ctx, ticket.ID, input)
	if err != nil {
		return domain.Comment{}, err
	}
	author := comment.AuthorName
	_ = service.repository.RecordActivity(ctx, ticket.ID, domain.ActivityCommented, &author, map[string]any{
		"isInternal": comment.IsInternal,
	})
	return comment, nil
}

func (service *Service) ListComments(ctx context.Context, ticketID string) ([]domain.Comment, error) {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	return service.repository.ListComments(ctx, ticket.ID)
}

func (service *Service) AddAttachment(ctx context.Context, ticketID string, input domain.NewAttachment, content io.Reader) (domain.Attachment, error) {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return domain.Attachment{}, err
	}
	input.UploaderName = strings.TrimSpace(input.UploaderName)
	if input.UploaderName == "" {
		input.UploaderName = "Current User"
	}
	if err := input.Validate(); err != nil {
		return domain.Attachment{}, err
	}

	storageKey, err := generateStorageKey(ticket.ID, input.FileName)
	if err != nil {
		return domain.Attachment{}, err
	}
	if err := service.attachments.Save(ctx, storageKey, content); err != nil {
		return domain.Attachment{}, err
	}
	attachment, err := service.repository.AddAttachment(ctx, ticket.ID, input, storageKey)
	if err != nil {
		return domain.Attachment{}, err
	}
	uploader := attachment.UploaderName
	_ = service.repository.RecordActivity(ctx, ticket.ID, domain.ActivityAttached, &uploader, map[string]any{
		"fileName":  attachment.FileName,
		"sizeBytes": attachment.SizeBytes,
	})
	return attachment, nil
}

func (service *Service) ListAttachments(ctx context.Context, ticketID string) ([]domain.Attachment, error) {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	return service.repository.ListAttachments(ctx, ticket.ID)
}

func (service *Service) OpenAttachment(ctx context.Context, attachmentID string) (domain.Attachment, io.ReadCloser, error) {
	attachment, err := service.repository.GetAttachment(ctx, attachmentID)
	if err != nil {
		return domain.Attachment{}, nil, err
	}
	content, err := service.attachments.Open(ctx, attachment.StorageKey)
	if err != nil {
		return domain.Attachment{}, nil, err
	}
	return attachment, content, nil
}

func (service *Service) Watch(ctx context.Context, ticketID string, watcherName string) error {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return err
	}
	watcherName = strings.TrimSpace(watcherName)
	if watcherName == "" {
		return domain.ErrInvalidWatcherName
	}
	if err := service.repository.AddWatcher(ctx, ticket.ID, watcherName); err != nil {
		return err
	}
	return service.repository.RecordActivity(ctx, ticket.ID, domain.ActivityWatcherAdded, &watcherName, map[string]any{})
}

func (service *Service) Unwatch(ctx context.Context, ticketID string, watcherName string) error {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return err
	}
	watcherName = strings.TrimSpace(watcherName)
	if watcherName == "" {
		return domain.ErrInvalidWatcherName
	}
	if err := service.repository.RemoveWatcher(ctx, ticket.ID, watcherName); err != nil {
		return err
	}
	return service.repository.RecordActivity(ctx, ticket.ID, domain.ActivityWatcherRemoved, &watcherName, map[string]any{})
}

func (service *Service) ListWatchers(ctx context.Context, ticketID string) ([]domain.Watcher, error) {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	return service.repository.ListWatchers(ctx, ticket.ID)
}

func (service *Service) ListActivity(ctx context.Context, ticketID string) ([]domain.ActivityEntry, error) {
	ticket, err := service.Get(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	entries, err := service.repository.ListActivity(ctx, ticket.ID)
	if err != nil {
		return nil, err
	}
	for index := range entries {
		entries[index] = domain.NormalizeActivityEntry(entries[index])
	}
	return entries, nil
}

// entityKeysProjectedAsTickets lists the catalog entityKeys Tickets
// projects into its own read model. Only INC exists today.
var entityKeysProjectedAsTickets = map[string]bool{"INC": true}

// ApplyEntityCreated projects a catalog.entity.created.v1 event into
// Tickets' own read model. It trusts the event's state and data verbatim:
// validation, lifecycle and manifest compliance are the catalog runtime's
// responsibility, not Tickets'.
func (service *Service) ApplyEntityCreated(ctx context.Context, event domain.CatalogEntityCreatedEvent) error {
	if !entityKeysProjectedAsTickets[event.EntityKey] {
		return nil
	}
	projection := domain.ProjectedTicket{
		EntityID:    event.EntityID,
		HumanID:     event.HumanID,
		State:       event.State,
		Title:       domain.StringField(event.Data, "title"),
		Description: domain.StringField(event.Data, "description"),
		Category:    domain.StringField(event.Data, "category"),
		Priority:    domain.StringField(event.Data, "priority"),
	}
	if assetID := domain.StringField(event.Data, "assetId"); assetID != "" {
		projection.AssetID = &assetID
	}
	if site := domain.StringField(event.Data, "site"); site != "" {
		projection.Site = &site
	}
	_, err := service.repository.ProjectCatalogCreated(ctx, event.EventID, projection)
	return err
}

// ApplyEntityUpdated refreshes the legacy Tickets read model from the generic
// entity data. It does not own or revalidate those fields.
func (service *Service) ApplyEntityUpdated(ctx context.Context, event domain.CatalogEntityUpdatedEvent) error {
	if !entityKeysProjectedAsTickets[event.EntityKey] {
		return nil
	}
	projection := domain.ProjectedTicket{
		EntityID:    event.EntityID,
		HumanID:     event.HumanID,
		State:       event.State,
		Title:       domain.StringField(event.Data, "title"),
		Description: domain.StringField(event.Data, "description"),
		Category:    domain.StringField(event.Data, "category"),
		Priority:    domain.StringField(event.Data, "priority"),
	}
	if assetID := domain.StringField(event.Data, "assetId"); assetID != "" {
		projection.AssetID = &assetID
	}
	if site := domain.StringField(event.Data, "site"); site != "" {
		projection.Site = &site
	}
	_, err := service.repository.ProjectCatalogUpdated(
		ctx,
		event.EventID,
		projection,
		event.ChangedFields,
		event.ActorID,
	)
	return err
}

// ApplyEntityTransitioned projects a catalog.entity.transitioned.v1 event.
// Like ApplyEntityCreated, it trusts event.CurrentState verbatim.
func (service *Service) ApplyEntityTransitioned(ctx context.Context, event domain.CatalogEntityTransitionedEvent) error {
	if !entityKeysProjectedAsTickets[event.EntityKey] {
		return nil
	}
	_, err := service.repository.ProjectCatalogTransitioned(
		ctx,
		event.EventID,
		event.EntityID,
		event.CurrentState,
	)
	return err
}

func normalizeOptionalName(name *string) *string {
	if name == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*name)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func generateStorageKey(ticketID, fileName string) (string, error) {
	suffix := make([]byte, 16)
	if _, err := rand.Read(suffix); err != nil {
		return "", err
	}
	ext := filepath.Ext(fileName)
	return strings.ToLower(ticketID) + "-" + hex.EncodeToString(suffix) + ext, nil
}
