package postgres

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sig-desk/backend/internal/tickets/domain"
	"sig-desk/backend/internal/tickets/ports"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const ticketColumns = `
	human_id, title, description, status, priority, category,
	requester_name, assignee_name, created_at, asset_id, site, merged_count, merged_into_id, entity_id
`

const defaultPageLimit = 50

func (repository *Repository) List(ctx context.Context, filter domain.TicketFilter) (domain.TicketPage, error) {
	args := make([]any, 0, 8)
	var conditions []string

	add := func(clause string, value any) {
		args = append(args, value)
		conditions = append(conditions, fmt.Sprintf(clause, len(args)))
	}

	if filter.MergedInto != "" {
		args = append(args, filter.MergedInto)
		conditions = []string{fmt.Sprintf("merged_into_id = $%d", len(args))}
	} else {
		conditions = []string{"merged_into_id IS NULL"}
	}

	if filter.Status != "" {
		add("status = $%d", filter.Status)
	}
	if filter.Priority != "" {
		add("priority = $%d", filter.Priority)
	}
	if filter.Category != "" {
		add("category = $%d", filter.Category)
	}
	if filter.Site != "" {
		add("site = $%d", filter.Site)
	}
	if filter.Unassigned {
		conditions = append(conditions, "assignee_name IS NULL")
	} else if filter.Assignee != "" {
		add("assignee_name = $%d", filter.Assignee)
	}
	if filter.Search != "" {
		args = append(args, "%"+filter.Search+"%")
		idx := len(args)
		conditions = append(conditions, fmt.Sprintf(
			"(title ILIKE $%d OR description ILIKE $%d OR human_id ILIKE $%d)", idx, idx, idx,
		))
	}
	if filter.Cursor != "" {
		cursorCreatedAt, cursorID, err := decodeCursor(filter.Cursor)
		if err != nil {
			return domain.TicketPage{}, fmt.Errorf("invalid cursor: %w", err)
		}
		args = append(args, cursorCreatedAt, cursorID)
		conditions = append(conditions, fmt.Sprintf("(created_at, human_id) < ($%d, $%d)", len(args)-1, len(args)))
	}

	limit := filter.Limit
	if limit <= 0 || limit > 200 {
		limit = defaultPageLimit
	}
	args = append(args, limit+1)

	query := `SELECT ` + ticketColumns + ` FROM tickets WHERE ` +
		strings.Join(conditions, " AND ") +
		fmt.Sprintf(" ORDER BY created_at DESC, human_id DESC LIMIT $%d", len(args))

	rows, err := repository.pool.Query(ctx, query, args...)
	if err != nil {
		return domain.TicketPage{}, err
	}
	defer rows.Close()

	tickets := make([]domain.Ticket, 0, limit+1)
	for rows.Next() {
		ticket, scanErr := scanTicket(rows)
		if scanErr != nil {
			return domain.TicketPage{}, scanErr
		}
		tickets = append(tickets, ticket)
	}
	if err := rows.Err(); err != nil {
		return domain.TicketPage{}, err
	}

	page := domain.TicketPage{Items: tickets}
	if len(tickets) > limit {
		page.Items = tickets[:limit]
		page.HasMore = true
		last := page.Items[len(page.Items)-1]
		page.NextCursor = encodeCursor(last.CreatedAt, last.ID)
	}
	return page, nil
}

func (repository *Repository) GetByID(ctx context.Context, id string) (domain.Ticket, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT `+ticketColumns+`
		FROM tickets
		WHERE human_id = $1
	`, id)
	ticket, err := scanTicket(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Ticket{}, ports.ErrNotFound
	}
	return ticket, err
}

func (repository *Repository) UpdateStatus(ctx context.Context, id string, status domain.Status) (domain.Ticket, error) {
	row := repository.pool.QueryRow(ctx, `
		UPDATE tickets
		SET status = $2, updated_at = now()
		WHERE human_id = $1
		RETURNING `+ticketColumns,
		id,
		status,
	)
	ticket, err := scanTicket(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Ticket{}, ports.ErrNotFound
	}
	return ticket, err
}

func (repository *Repository) Assign(ctx context.Context, id string, assigneeName *string) (domain.Ticket, error) {
	row := repository.pool.QueryRow(ctx, `
		UPDATE tickets
		SET assignee_name = $2, updated_at = now()
		WHERE human_id = $1
		RETURNING `+ticketColumns,
		id,
		assigneeName,
	)
	ticket, err := scanTicket(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Ticket{}, ports.ErrNotFound
	}
	return ticket, err
}

func (repository *Repository) Merge(ctx context.Context, primaryID string, mergedIDs []string, actorName *string) (domain.Ticket, error) {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return domain.Ticket{}, err
	}
	defer tx.Rollback(ctx)

	commandTag, err := tx.Exec(ctx, `
		UPDATE tickets
		SET status = 'resolved', merged_into_id = $1, updated_at = now()
		WHERE human_id = ANY($2) AND merged_into_id IS NULL
	`, primaryID, mergedIDs)
	if err != nil {
		return domain.Ticket{}, err
	}
	if int(commandTag.RowsAffected()) != len(mergedIDs) {
		return domain.Ticket{}, ports.ErrNotFound
	}

	row := tx.QueryRow(ctx, `
		UPDATE tickets
		SET merged_count = merged_count + $2, updated_at = now()
		WHERE human_id = $1
		RETURNING `+ticketColumns,
		primaryID, len(mergedIDs),
	)
	primary, err := scanTicket(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Ticket{}, ports.ErrNotFound
		}
		return domain.Ticket{}, err
	}

	if err := insertActivity(ctx, tx, primaryID, domain.ActivityMerged, actorName, map[string]any{"mergedIds": mergedIDs}); err != nil {
		return domain.Ticket{}, err
	}
	for _, mergedID := range mergedIDs {
		if err := insertActivity(ctx, tx, mergedID, domain.ActivityMerged, actorName, map[string]any{"mergedInto": primaryID}); err != nil {
			return domain.Ticket{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Ticket{}, err
	}
	return primary, nil
}

func (repository *Repository) Unmerge(ctx context.Context, primaryID string, mergedID string, actorName *string) (domain.Ticket, error) {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return domain.Ticket{}, err
	}
	defer tx.Rollback(ctx)

	commandTag, err := tx.Exec(ctx, `
		UPDATE tickets
		SET status = 'open', merged_into_id = NULL, updated_at = now()
		WHERE human_id = $1 AND merged_into_id = $2
	`, mergedID, primaryID)
	if err != nil {
		return domain.Ticket{}, err
	}
	if commandTag.RowsAffected() == 0 {
		return domain.Ticket{}, ports.ErrNotFound
	}

	row := tx.QueryRow(ctx, `
		UPDATE tickets
		SET merged_count = GREATEST(merged_count - 1, 0), updated_at = now()
		WHERE human_id = $1
		RETURNING `+ticketColumns,
		primaryID,
	)
	primary, err := scanTicket(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Ticket{}, ports.ErrNotFound
		}
		return domain.Ticket{}, err
	}

	if err := insertActivity(ctx, tx, primaryID, domain.ActivityUnmerged, actorName, map[string]any{"unmergedId": mergedID}); err != nil {
		return domain.Ticket{}, err
	}
	if err := insertActivity(ctx, tx, mergedID, domain.ActivityUnmerged, actorName, map[string]any{"unmergedFrom": primaryID}); err != nil {
		return domain.Ticket{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Ticket{}, err
	}
	return primary, nil
}

func (repository *Repository) AddComment(ctx context.Context, ticketID string, comment domain.NewComment) (domain.Comment, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO ticket_comments (ticket_id, author_name, body, is_internal)
		VALUES ($1, $2, $3, $4)
		RETURNING id, ticket_id, author_name, body, is_internal, created_at
	`, ticketID, comment.AuthorName, comment.Body, comment.IsInternal)
	return scanComment(row)
}

func (repository *Repository) ListComments(ctx context.Context, ticketID string) ([]domain.Comment, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id, ticket_id, author_name, body, is_internal, created_at
		FROM ticket_comments
		WHERE ticket_id = $1
		ORDER BY created_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	comments := make([]domain.Comment, 0)
	for rows.Next() {
		comment, err := scanComment(rows)
		if err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}
	return comments, rows.Err()
}

func (repository *Repository) AddAttachment(ctx context.Context, ticketID string, attachment domain.NewAttachment, storageKey string) (domain.Attachment, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO ticket_attachments (ticket_id, uploader_name, file_name, content_type, size_bytes, storage_key)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, ticket_id, uploader_name, file_name, content_type, size_bytes, storage_key, created_at
	`, ticketID, attachment.UploaderName, attachment.FileName, attachment.ContentType, attachment.SizeBytes, storageKey)
	return scanAttachment(row)
}

func (repository *Repository) ListAttachments(ctx context.Context, ticketID string) ([]domain.Attachment, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id, ticket_id, uploader_name, file_name, content_type, size_bytes, storage_key, created_at
		FROM ticket_attachments
		WHERE ticket_id = $1
		ORDER BY created_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attachments := make([]domain.Attachment, 0)
	for rows.Next() {
		attachment, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		attachments = append(attachments, attachment)
	}
	return attachments, rows.Err()
}

func (repository *Repository) GetAttachment(ctx context.Context, attachmentID string) (domain.Attachment, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT id, ticket_id, uploader_name, file_name, content_type, size_bytes, storage_key, created_at
		FROM ticket_attachments
		WHERE id = $1
	`, attachmentID)
	attachment, err := scanAttachment(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Attachment{}, ports.ErrNotFound
	}
	return attachment, err
}

func (repository *Repository) AddWatcher(ctx context.Context, ticketID string, watcherName string) error {
	_, err := repository.pool.Exec(ctx, `
		INSERT INTO ticket_watchers (ticket_id, watcher_name)
		VALUES ($1, $2)
		ON CONFLICT (ticket_id, watcher_name) DO NOTHING
	`, ticketID, watcherName)
	return err
}

func (repository *Repository) RemoveWatcher(ctx context.Context, ticketID string, watcherName string) error {
	_, err := repository.pool.Exec(ctx, `
		DELETE FROM ticket_watchers WHERE ticket_id = $1 AND watcher_name = $2
	`, ticketID, watcherName)
	return err
}

func (repository *Repository) ListWatchers(ctx context.Context, ticketID string) ([]domain.Watcher, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT ticket_id, watcher_name, created_at
		FROM ticket_watchers
		WHERE ticket_id = $1
		ORDER BY created_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	watchers := make([]domain.Watcher, 0)
	for rows.Next() {
		var watcher domain.Watcher
		if err := rows.Scan(&watcher.TicketID, &watcher.WatcherName, &watcher.CreatedAt); err != nil {
			return nil, err
		}
		watchers = append(watchers, watcher)
	}
	return watchers, rows.Err()
}

func (repository *Repository) ListActivity(ctx context.Context, ticketID string) ([]domain.ActivityEntry, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT id, ticket_id, kind, actor_name, payload, created_at
		FROM ticket_activity
		WHERE ticket_id = $1
		ORDER BY created_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]domain.ActivityEntry, 0)
	for rows.Next() {
		entry, err := scanActivity(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (repository *Repository) ProjectCatalogCreated(
	ctx context.Context,
	eventID string,
	projection domain.ProjectedTicket,
) (bool, error) {
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	commandTag, err := transaction.Exec(ctx, `
		INSERT INTO catalog_projected_events (event_id, entity_id)
		VALUES ($1, $2)
		ON CONFLICT (event_id) DO NOTHING
	`, eventID, projection.EntityID)
	if err != nil {
		return false, err
	}
	if commandTag.RowsAffected() == 0 {
		return true, transaction.Commit(ctx)
	}
	// The shared sequence prevents new collisions. This guard still protects
	// historical/manual rows: reapplication may update only the ticket that
	// already belongs to this same catalog entity.
	commandTag, err = transaction.Exec(ctx, `
		INSERT INTO tickets (
			human_id, title, description, status, priority, category,
			requester_name, asset_id, site, entity_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (human_id) DO UPDATE SET
			title = EXCLUDED.title,
			description = EXCLUDED.description,
			status = EXCLUDED.status,
			priority = EXCLUDED.priority,
			category = EXCLUDED.category,
			asset_id = EXCLUDED.asset_id,
			site = EXCLUDED.site,
			entity_id = EXCLUDED.entity_id,
			updated_at = now()
		WHERE tickets.entity_id = EXCLUDED.entity_id
	`,
		projection.HumanID,
		projection.Title,
		projection.Description,
		projection.State,
		projection.Priority,
		projection.Category,
		"Portal",
		projection.AssetID,
		projection.Site,
		projection.EntityID,
	)
	if err != nil {
		return false, err
	}
	if commandTag.RowsAffected() == 0 {
		return false, fmt.Errorf("%w: %s", domain.ErrHumanIDConflict, projection.HumanID)
	}
	return false, transaction.Commit(ctx)
}

func (repository *Repository) ProjectCatalogTransitioned(
	ctx context.Context,
	eventID string,
	entityID string,
	state string,
) (bool, error) {
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	commandTag, err := transaction.Exec(ctx, `
		INSERT INTO catalog_projected_events (event_id, entity_id)
		VALUES ($1, $2)
		ON CONFLICT (event_id) DO NOTHING
	`, eventID, entityID)
	if err != nil {
		return false, err
	}
	if commandTag.RowsAffected() == 0 {
		return true, transaction.Commit(ctx)
	}
	commandTag, err = transaction.Exec(ctx, `
		UPDATE tickets SET status = $2, updated_at = now() WHERE entity_id = $1
	`, entityID, state)
	if err != nil {
		return false, err
	}
	if commandTag.RowsAffected() == 0 {
		return false, ports.ErrNotFound
	}
	return false, transaction.Commit(ctx)
}

func (repository *Repository) ProjectCatalogUpdated(
	ctx context.Context,
	eventID string,
	projection domain.ProjectedTicket,
	changedFields []string,
	actorID string,
) (bool, error) {
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	commandTag, err := transaction.Exec(ctx, `
		INSERT INTO catalog_projected_events (event_id, entity_id)
		VALUES ($1, $2)
		ON CONFLICT (event_id) DO NOTHING
	`, eventID, projection.EntityID)
	if err != nil {
		return false, err
	}
	if commandTag.RowsAffected() == 0 {
		return true, transaction.Commit(ctx)
	}
	commandTag, err = transaction.Exec(ctx, `
		UPDATE tickets
		SET
			title = $2,
			description = $3,
			status = $4,
			priority = $5,
			category = $6,
			asset_id = $7,
			site = $8,
			updated_at = now()
		WHERE entity_id = $1
	`,
		projection.EntityID,
		projection.Title,
		projection.Description,
		projection.State,
		projection.Priority,
		projection.Category,
		projection.AssetID,
		projection.Site,
	)
	if err != nil {
		return false, err
	}
	if commandTag.RowsAffected() == 0 {
		return false, ports.ErrNotFound
	}
	var actorName *string
	if actorID != "" {
		actorName = &actorID
	}
	if err := insertActivity(
		ctx,
		transaction,
		projection.HumanID,
		domain.ActivityFieldsUpdated,
		actorName,
		map[string]any{"fields": changedFields},
	); err != nil {
		return false, err
	}
	return false, transaction.Commit(ctx)
}

func (repository *Repository) RecordActivity(ctx context.Context, ticketID string, kind domain.ActivityKind, actorName *string, payload map[string]any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = repository.pool.Exec(ctx, `
		INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload)
		VALUES ($1, $2, $3, $4)
	`, ticketID, kind, actorName, encoded)
	return err
}

func insertActivity(ctx context.Context, tx pgx.Tx, ticketID string, kind domain.ActivityKind, actorName *string, payload map[string]any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload)
		VALUES ($1, $2, $3, $4)
	`, ticketID, kind, actorName, encoded)
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanTicket(row scanner) (domain.Ticket, error) {
	var ticket domain.Ticket
	err := row.Scan(
		&ticket.ID,
		&ticket.Title,
		&ticket.Description,
		&ticket.Status,
		&ticket.Priority,
		&ticket.Category,
		&ticket.RequesterName,
		&ticket.AssigneeName,
		&ticket.CreatedAt,
		&ticket.AssetID,
		&ticket.Site,
		&ticket.MergedCount,
		&ticket.MergedIntoID,
		&ticket.EntityID,
	)
	return ticket, err
}

func scanComment(row scanner) (domain.Comment, error) {
	var comment domain.Comment
	err := row.Scan(
		&comment.ID, &comment.TicketID, &comment.AuthorName,
		&comment.Body, &comment.IsInternal, &comment.CreatedAt,
	)
	return comment, err
}

func scanAttachment(row scanner) (domain.Attachment, error) {
	var attachment domain.Attachment
	err := row.Scan(
		&attachment.ID, &attachment.TicketID, &attachment.UploaderName,
		&attachment.FileName, &attachment.ContentType, &attachment.SizeBytes,
		&attachment.StorageKey, &attachment.CreatedAt,
	)
	return attachment, err
}

func scanActivity(row scanner) (domain.ActivityEntry, error) {
	var entry domain.ActivityEntry
	var payload []byte
	err := row.Scan(
		&entry.ID, &entry.TicketID, &entry.Kind, &entry.ActorName,
		&payload, &entry.CreatedAt,
	)
	if err != nil {
		return domain.ActivityEntry{}, err
	}
	if err := json.Unmarshal(payload, &entry.Payload); err != nil {
		return domain.ActivityEntry{}, fmt.Errorf("decode activity payload: %w", err)
	}
	return entry, nil
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
