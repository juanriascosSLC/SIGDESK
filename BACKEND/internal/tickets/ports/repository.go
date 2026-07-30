package ports

import (
	"context"
	"errors"
	"io"

	"sig-desk/backend/internal/tickets/domain"
)

var ErrNotFound = errors.New("ticket not found")

// Repository persists the Ticket aggregate root and its child entities
// (comments, attachments, watchers, activity). All of them share the
// ticket's lifecycle (e.g. deleted alongside it), so a single port keeps
// that aggregate boundary explicit instead of splitting it into
// per-table interfaces.
type Repository interface {
	List(ctx context.Context, filter domain.TicketFilter) (domain.TicketPage, error)
	GetByID(ctx context.Context, id string) (domain.Ticket, error)
	UpdateStatus(ctx context.Context, id string, status domain.Status) (domain.Ticket, error)
	Assign(ctx context.Context, id string, assigneeName *string) (domain.Ticket, error)

	Merge(ctx context.Context, primaryID string, mergedIDs []string, actorName *string) (domain.Ticket, error)
	Unmerge(ctx context.Context, primaryID string, mergedID string, actorName *string) (domain.Ticket, error)

	AddComment(ctx context.Context, ticketID string, comment domain.NewComment) (domain.Comment, error)
	ListComments(ctx context.Context, ticketID string) ([]domain.Comment, error)

	AddAttachment(ctx context.Context, ticketID string, attachment domain.NewAttachment, storageKey string) (domain.Attachment, error)
	ListAttachments(ctx context.Context, ticketID string) ([]domain.Attachment, error)
	GetAttachment(ctx context.Context, attachmentID string) (domain.Attachment, error)

	AddWatcher(ctx context.Context, ticketID string, watcherName string) error
	RemoveWatcher(ctx context.Context, ticketID string, watcherName string) error
	ListWatchers(ctx context.Context, ticketID string) ([]domain.Watcher, error)

	ListActivity(ctx context.Context, ticketID string) ([]domain.ActivityEntry, error)
	RecordActivity(ctx context.Context, ticketID string, kind domain.ActivityKind, actorName *string, payload map[string]any) error

	// Projection and idempotency are one atomic repository operation. A crash
	// cannot record an event as processed without updating the read model.
	ProjectCatalogCreated(
		ctx context.Context,
		eventID string,
		projection domain.ProjectedTicket,
	) (alreadyProcessed bool, err error)
	ProjectCatalogTransitioned(
		ctx context.Context,
		eventID string,
		entityID string,
		state string,
	) (alreadyProcessed bool, err error)
	ProjectCatalogUpdated(
		ctx context.Context,
		eventID string,
		projection domain.ProjectedTicket,
		changedFields []string,
		actorID string,
	) (alreadyProcessed bool, err error)
}

// CatalogProjectionPort is what Tickets exposes to whatever will eventually
// deliver catalog runtime events (a transactional-outbox consumer, most
// likely). It is implemented by application.Service. Tickets only reads
// entityKey/state/data off these events and projects them into its own
// read model for entityKey == "INC" — it never re-validates fields, states
// or transitions, since that authority belongs to the catalog's executable
// manifest.
type CatalogProjectionPort interface {
	ApplyEntityCreated(ctx context.Context, event domain.CatalogEntityCreatedEvent) error
	ApplyEntityUpdated(ctx context.Context, event domain.CatalogEntityUpdatedEvent) error
	ApplyEntityTransitioned(ctx context.Context, event domain.CatalogEntityTransitionedEvent) error
}

// AttachmentStore persists the raw bytes of an attachment. It is kept
// separate from Repository because blob storage (local disk today, object
// storage later) is a different infrastructure concern than relational
// metadata, even though both back the same Attachment child entity.
type AttachmentStore interface {
	Save(ctx context.Context, storageKey string, content io.Reader) error
	Open(ctx context.Context, storageKey string) (io.ReadCloser, error)
}

// CatalogIntakePort is the command boundary from Tickets into the generic
// Catalog runtime. New incidents are created as catalog entities; Tickets
// only projects the returned versioned event into its query model.
type CatalogIntakePort interface {
	CreateEntity(
		ctx context.Context,
		entityKey string,
		data map[string]any,
		idempotencyKey string,
	) (domain.CatalogEntityCreatedEvent, error)
	TransitionEntity(ctx context.Context, entityKey string, entityID string, targetState string) error
}
