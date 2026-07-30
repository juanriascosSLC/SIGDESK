package memory

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"sig-desk/backend/internal/tickets/domain"
	"sig-desk/backend/internal/tickets/ports"
)

type Repository struct {
	mu              sync.RWMutex
	tickets         map[string]domain.Ticket
	comments        map[string][]domain.Comment
	attachments     map[string]domain.Attachment
	watchers        map[string]map[string]domain.Watcher
	activity        map[string][]domain.ActivityEntry
	processedEvents map[string]bool
}

func NewRepository(initial []domain.Ticket) *Repository {
	tickets := make(map[string]domain.Ticket, len(initial))
	for _, ticket := range initial {
		tickets[ticket.ID] = ticket
	}
	return &Repository{
		tickets:         tickets,
		comments:        make(map[string][]domain.Comment),
		attachments:     make(map[string]domain.Attachment),
		watchers:        make(map[string]map[string]domain.Watcher),
		activity:        make(map[string][]domain.ActivityEntry),
		processedEvents: make(map[string]bool),
	}
}

func (repository *Repository) List(_ context.Context, filter domain.TicketFilter) (domain.TicketPage, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()

	matches := make([]domain.Ticket, 0, len(repository.tickets))
	for _, ticket := range repository.tickets {
		if filter.MergedInto != "" {
			if ticket.MergedIntoID == nil || *ticket.MergedIntoID != filter.MergedInto {
				continue
			}
		} else if ticket.IsMerged() {
			continue
		}
		if filter.Status != "" && ticket.Status != filter.Status {
			continue
		}
		if filter.Priority != "" && ticket.Priority != filter.Priority {
			continue
		}
		if filter.Category != "" && ticket.Category != filter.Category {
			continue
		}
		if filter.Site != "" && (ticket.Site == nil || *ticket.Site != filter.Site) {
			continue
		}
		if filter.Unassigned {
			if ticket.AssigneeName != nil {
				continue
			}
		} else if filter.Assignee != "" && (ticket.AssigneeName == nil || *ticket.AssigneeName != filter.Assignee) {
			continue
		}
		if filter.Search != "" {
			term := strings.ToLower(filter.Search)
			haystack := strings.ToLower(ticket.ID + " " + ticket.Title + " " + ticket.Description)
			if !strings.Contains(haystack, term) {
				continue
			}
		}
		matches = append(matches, ticket)
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].CreatedAt.Equal(matches[j].CreatedAt) {
			return matches[i].ID > matches[j].ID
		}
		return matches[i].CreatedAt.After(matches[j].CreatedAt)
	})

	if filter.Cursor != "" {
		cursorCreatedAt, cursorID, err := decodeCursor(filter.Cursor)
		if err != nil {
			return domain.TicketPage{}, fmt.Errorf("invalid cursor: %w", err)
		}
		start := 0
		for start < len(matches) {
			ticket := matches[start]
			if ticket.CreatedAt.Before(cursorCreatedAt) || (ticket.CreatedAt.Equal(cursorCreatedAt) && ticket.ID < cursorID) {
				break
			}
			start++
		}
		matches = matches[start:]
	}

	limit := filter.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	page := domain.TicketPage{}
	if len(matches) > limit {
		page.Items = matches[:limit]
		page.HasMore = true
		last := page.Items[len(page.Items)-1]
		page.NextCursor = encodeCursor(last.CreatedAt, last.ID)
	} else {
		page.Items = matches
	}
	return page, nil
}

func (repository *Repository) GetByID(_ context.Context, id string) (domain.Ticket, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()

	ticket, ok := repository.tickets[id]
	if !ok {
		return domain.Ticket{}, ports.ErrNotFound
	}
	return ticket, nil
}

func (repository *Repository) UpdateStatus(_ context.Context, id string, status domain.Status) (domain.Ticket, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	ticket, ok := repository.tickets[id]
	if !ok {
		return domain.Ticket{}, ports.ErrNotFound
	}
	ticket.Status = status
	repository.tickets[id] = ticket
	return ticket, nil
}

func (repository *Repository) Assign(_ context.Context, id string, assigneeName *string) (domain.Ticket, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	ticket, ok := repository.tickets[id]
	if !ok {
		return domain.Ticket{}, ports.ErrNotFound
	}
	ticket.AssigneeName = assigneeName
	repository.tickets[id] = ticket
	return ticket, nil
}

func (repository *Repository) Merge(_ context.Context, primaryID string, mergedIDs []string, actorName *string) (domain.Ticket, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	primary, ok := repository.tickets[primaryID]
	if !ok {
		return domain.Ticket{}, ports.ErrNotFound
	}
	for _, mergedID := range mergedIDs {
		if _, ok := repository.tickets[mergedID]; !ok {
			return domain.Ticket{}, ports.ErrNotFound
		}
	}
	for _, mergedID := range mergedIDs {
		merged := repository.tickets[mergedID]
		merged.Status = domain.StatusResolved
		merged.MergedIntoID = &primaryID
		repository.tickets[mergedID] = merged
		repository.appendActivity(mergedID, domain.ActivityMerged, actorName, map[string]any{"mergedInto": primaryID})
	}
	primary.MergedCount += len(mergedIDs)
	repository.tickets[primaryID] = primary
	repository.appendActivity(primaryID, domain.ActivityMerged, actorName, map[string]any{"mergedIds": mergedIDs})
	return primary, nil
}

func (repository *Repository) Unmerge(_ context.Context, primaryID string, mergedID string, actorName *string) (domain.Ticket, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	merged, ok := repository.tickets[mergedID]
	if !ok || merged.MergedIntoID == nil || *merged.MergedIntoID != primaryID {
		return domain.Ticket{}, ports.ErrNotFound
	}
	merged.MergedIntoID = nil
	merged.Status = domain.StatusOpen
	repository.tickets[mergedID] = merged
	repository.appendActivity(mergedID, domain.ActivityUnmerged, actorName, map[string]any{"unmergedFrom": primaryID})

	primary, ok := repository.tickets[primaryID]
	if !ok {
		return domain.Ticket{}, ports.ErrNotFound
	}
	if primary.MergedCount > 0 {
		primary.MergedCount--
	}
	repository.tickets[primaryID] = primary
	repository.appendActivity(primaryID, domain.ActivityUnmerged, actorName, map[string]any{"unmergedId": mergedID})
	return primary, nil
}

func (repository *Repository) AddComment(_ context.Context, ticketID string, comment domain.NewComment) (domain.Comment, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	created := domain.Comment{
		ID:         newMemoryID(),
		TicketID:   ticketID,
		AuthorName: comment.AuthorName,
		Body:       comment.Body,
		IsInternal: comment.IsInternal,
		CreatedAt:  time.Now().UTC(),
	}
	repository.comments[ticketID] = append(repository.comments[ticketID], created)
	return created, nil
}

func (repository *Repository) ListComments(_ context.Context, ticketID string) ([]domain.Comment, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	return append([]domain.Comment(nil), repository.comments[ticketID]...), nil
}

func (repository *Repository) AddAttachment(_ context.Context, ticketID string, attachment domain.NewAttachment, storageKey string) (domain.Attachment, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	created := domain.Attachment{
		ID:           newMemoryID(),
		TicketID:     ticketID,
		UploaderName: attachment.UploaderName,
		FileName:     attachment.FileName,
		ContentType:  attachment.ContentType,
		SizeBytes:    attachment.SizeBytes,
		StorageKey:   storageKey,
		CreatedAt:    time.Now().UTC(),
	}
	repository.attachments[created.ID] = created
	return created, nil
}

func (repository *Repository) ListAttachments(_ context.Context, ticketID string) ([]domain.Attachment, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()

	attachments := make([]domain.Attachment, 0)
	for _, attachment := range repository.attachments {
		if attachment.TicketID == ticketID {
			attachments = append(attachments, attachment)
		}
	}
	sort.Slice(attachments, func(i, j int) bool { return attachments[i].CreatedAt.Before(attachments[j].CreatedAt) })
	return attachments, nil
}

func (repository *Repository) GetAttachment(_ context.Context, attachmentID string) (domain.Attachment, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()

	attachment, ok := repository.attachments[attachmentID]
	if !ok {
		return domain.Attachment{}, ports.ErrNotFound
	}
	return attachment, nil
}

func (repository *Repository) AddWatcher(_ context.Context, ticketID string, watcherName string) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	if repository.watchers[ticketID] == nil {
		repository.watchers[ticketID] = make(map[string]domain.Watcher)
	}
	repository.watchers[ticketID][watcherName] = domain.Watcher{
		TicketID: ticketID, WatcherName: watcherName, CreatedAt: time.Now().UTC(),
	}
	return nil
}

func (repository *Repository) RemoveWatcher(_ context.Context, ticketID string, watcherName string) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	delete(repository.watchers[ticketID], watcherName)
	return nil
}

func (repository *Repository) ListWatchers(_ context.Context, ticketID string) ([]domain.Watcher, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()

	watchers := make([]domain.Watcher, 0, len(repository.watchers[ticketID]))
	for _, watcher := range repository.watchers[ticketID] {
		watchers = append(watchers, watcher)
	}
	sort.Slice(watchers, func(i, j int) bool { return watchers[i].CreatedAt.Before(watchers[j].CreatedAt) })
	return watchers, nil
}

func (repository *Repository) ListActivity(_ context.Context, ticketID string) ([]domain.ActivityEntry, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	return append([]domain.ActivityEntry(nil), repository.activity[ticketID]...), nil
}

func (repository *Repository) ProjectCatalogCreated(
	_ context.Context,
	eventID string,
	projection domain.ProjectedTicket,
) (bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	if repository.processedEvents[eventID] {
		return true, nil
	}
	entityID := projection.EntityID
	existing, ok := repository.tickets[projection.HumanID]
	if ok && (existing.EntityID == nil || *existing.EntityID != entityID) {
		return false, fmt.Errorf("%w: %s", domain.ErrHumanIDConflict, projection.HumanID)
	}
	ticket := domain.Ticket{
		ID:            projection.HumanID,
		Title:         projection.Title,
		Description:   projection.Description,
		Status:        domain.Status(projection.State),
		Priority:      domain.Priority(projection.Priority),
		Category:      projection.Category,
		RequesterName: "Portal",
		AssetID:       projection.AssetID,
		Site:          projection.Site,
		EntityID:      &entityID,
		CreatedAt:     time.Now().UTC(),
	}
	if ok {
		ticket.CreatedAt = existing.CreatedAt
		ticket.MergedCount = existing.MergedCount
		ticket.MergedIntoID = existing.MergedIntoID
	}
	repository.tickets[projection.HumanID] = ticket
	repository.processedEvents[eventID] = true
	return false, nil
}

func (repository *Repository) ProjectCatalogTransitioned(
	_ context.Context,
	eventID string,
	entityID string,
	state string,
) (bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	if repository.processedEvents[eventID] {
		return true, nil
	}
	for humanID, ticket := range repository.tickets {
		if ticket.EntityID != nil && *ticket.EntityID == entityID {
			ticket.Status = domain.Status(state)
			repository.tickets[humanID] = ticket
			repository.processedEvents[eventID] = true
			return false, nil
		}
	}
	return false, ports.ErrNotFound
}

func (repository *Repository) ProjectCatalogUpdated(
	_ context.Context,
	eventID string,
	projection domain.ProjectedTicket,
	changedFields []string,
	actorID string,
) (bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	if repository.processedEvents[eventID] {
		return true, nil
	}
	for humanID, ticket := range repository.tickets {
		if ticket.EntityID == nil || *ticket.EntityID != projection.EntityID {
			continue
		}
		ticket.Title = projection.Title
		ticket.Description = projection.Description
		ticket.Status = domain.Status(projection.State)
		ticket.Priority = domain.Priority(projection.Priority)
		ticket.Category = projection.Category
		ticket.AssetID = projection.AssetID
		ticket.Site = projection.Site
		repository.tickets[humanID] = ticket
		var actorName *string
		if actorID != "" {
			actorName = &actorID
		}
		repository.appendActivity(
			humanID,
			domain.ActivityFieldsUpdated,
			actorName,
			map[string]any{"fields": append([]string(nil), changedFields...)},
		)
		repository.processedEvents[eventID] = true
		return false, nil
	}
	return false, ports.ErrNotFound
}

func (repository *Repository) RecordActivity(_ context.Context, ticketID string, kind domain.ActivityKind, actorName *string, payload map[string]any) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	repository.appendActivity(ticketID, kind, actorName, payload)
	return nil
}

// appendActivity must be called with mu already held.
func (repository *Repository) appendActivity(ticketID string, kind domain.ActivityKind, actorName *string, payload map[string]any) {
	repository.activity[ticketID] = append(repository.activity[ticketID], domain.ActivityEntry{
		ID:        newMemoryID(),
		TicketID:  ticketID,
		Kind:      kind,
		ActorName: actorName,
		Payload:   payload,
		CreatedAt: time.Now().UTC(),
	})
}

func newMemoryID() string {
	raw := make([]byte, 12)
	_, _ = rand.Read(raw)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func encodeCursor(createdAt time.Time, id string) string {
	raw := createdAt.UTC().Format(time.RFC3339Nano) + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(cursor string) (time.Time, string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", err
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", errors.New("malformed cursor")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", err
	}
	return createdAt, parts[1], nil
}

func DemoTickets() []domain.Ticket {
	now := time.Now().UTC()
	assignee := "Laura Kim"
	siteHQ := "HQ"
	site401 := "Site #401"
	camera := "CAM-12607"

	// Historical demo rows stay in a reserved range; new INC identifiers are
	// minted exclusively by the Catalog runtime.
	return []domain.Ticket{
		{
			ID: "INC-900001", Title: "Camera offline at Site #401",
			Description: "The main entrance camera is not responding to health checks.",
			Status:      domain.StatusOpen, Priority: domain.PriorityCritical, Category: "hardware",
			RequesterName: "John Doe", CreatedAt: now.Add(-2 * time.Hour),
			AssetID: &camera, Site: &site401, MergedCount: 0,
		},
		{
			ID: "INC-900002", Title: "Need access to SIGInstallations",
			Description: "Please grant administrator access to the installations portal.",
			Status:      domain.StatusInProgress, Priority: domain.PriorityMedium, Category: "software",
			RequesterName: "Jane Smith", AssigneeName: &assignee, CreatedAt: now.Add(-24 * time.Hour),
			Site: &siteHQ,
		},
		{
			ID: "INC-900003", Title: "Network latency issues in Building A",
			Description: "Users are reporting intermittent latency when accessing internal services.",
			Status:      domain.StatusPendingReview, Priority: domain.PriorityHigh, Category: "network",
			RequesterName: "Mike Ross", AssigneeName: &assignee, CreatedAt: now.Add(-5 * time.Hour),
		},
		{
			ID: "INC-900004", Title: "Password reset for badge portal",
			Description: "User is locked out of the access-control badge portal.",
			Status:      domain.StatusResolved, Priority: domain.PriorityLow, Category: "software",
			RequesterName: "Emily Chen", AssigneeName: &assignee, CreatedAt: now.Add(-72 * time.Hour),
			Site: &siteHQ,
		},
	}
}
