package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const definitionColumns = `
	id::text, entity_key, name, version, metamodel_version, status,
	specification, manifest, checksum, created_at, published_at
`

func (repository *Repository) ListDefinitions(ctx context.Context, publishedOnly bool) ([]domain.Definition, error) {
	query := `SELECT ` + definitionColumns + ` FROM catalog_definitions`
	if publishedOnly {
		query += ` WHERE status = 'published'`
	}
	query += ` ORDER BY entity_key, version DESC`
	rows, err := repository.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	definitions := make([]domain.Definition, 0)
	for rows.Next() {
		definition, scanErr := scanDefinition(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		definitions = append(definitions, definition)
	}
	return definitions, rows.Err()
}

func (repository *Repository) GetPublishedDefinition(ctx context.Context, entityKey string) (domain.Definition, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT `+definitionColumns+`
		FROM catalog_definitions
		WHERE entity_key = $1 AND status = 'published'
	`, entityKey)
	definition, err := scanDefinition(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Definition{}, ports.ErrNotFound
	}
	return definition, err
}

func (repository *Repository) GetDefinition(
	ctx context.Context,
	entityKey string,
	version int,
) (domain.Definition, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT `+definitionColumns+`
		FROM catalog_definitions
		WHERE entity_key = $1 AND version = $2
	`, entityKey, version)
	definition, err := scanDefinition(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Definition{}, ports.ErrNotFound
	}
	return definition, err
}

func (repository *Repository) CreateDraft(ctx context.Context, definition domain.Definition) (domain.Definition, error) {
	specification, err := json.Marshal(definition.Specification)
	if err != nil {
		return domain.Definition{}, err
	}
	// $1 is used both as an inserted value and in the WHERE comparison, so
	// PostgreSQL cannot deduce a single type for it and fails the statement
	// with "inconsistent types deduced for parameter $1". The in-memory
	// repository does not exercise this path, so without the explicit casts
	// creating a draft only breaks against a real database.
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO catalog_definitions (
			entity_key, name, version, metamodel_version, status, specification
		)
		SELECT $1::varchar, $2::varchar, COALESCE(MAX(version), 0) + 1, $3::varchar, 'draft', $4::jsonb
		FROM catalog_definitions
		WHERE entity_key = $1::varchar
		ON CONFLICT (entity_key) WHERE status = 'draft'
		DO UPDATE SET
			name = EXCLUDED.name,
			metamodel_version = EXCLUDED.metamodel_version,
			specification = EXCLUDED.specification,
			manifest = NULL,
			checksum = '',
			published_at = NULL
		RETURNING `+definitionColumns,
		definition.EntityKey,
		definition.Name,
		definition.MetamodelVersion,
		specification,
	)
	return scanDefinition(row)
}

func (repository *Repository) Publish(
	ctx context.Context,
	requested domain.Definition,
	manifest domain.ExecutableDefinitionManifest,
) (domain.Definition, error) {
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Definition{}, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	var exists bool
	err = transaction.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM catalog_definitions
			WHERE id = $1::uuid AND entity_key = $2 AND version = $3 AND status = 'draft'
		)
	`, requested.ID, requested.EntityKey, requested.Version).Scan(&exists)
	if err != nil {
		return domain.Definition{}, err
	}
	if !exists {
		return domain.Definition{}, ports.ErrNotFound
	}
	if _, err = transaction.Exec(ctx, `
		UPDATE catalog_definitions
		SET status = 'deprecated'
		WHERE entity_key = $1 AND status = 'published'
	`, requested.EntityKey); err != nil {
		return domain.Definition{}, err
	}
	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return domain.Definition{}, err
	}
	row := transaction.QueryRow(ctx, `
		UPDATE catalog_definitions
		SET status = 'published',
			metamodel_version = $4,
			manifest = $5,
			checksum = $6,
			published_at = now()
		WHERE id = $1::uuid AND entity_key = $2 AND version = $3 AND status = 'draft'
		RETURNING `+definitionColumns,
		requested.ID,
		requested.EntityKey,
		requested.Version,
		manifest.MetamodelVersion,
		manifestJSON,
		manifest.Checksum,
	)
	definition, err := scanDefinition(row)
	if err != nil {
		return domain.Definition{}, err
	}
	if err = transaction.Commit(ctx); err != nil {
		return domain.Definition{}, err
	}
	return definition, nil
}

func (repository *Repository) CreateEntity(
	ctx context.Context,
	definition domain.Definition,
	data map[string]any,
	idempotency ports.IdempotencyRequest,
) (domain.EntityRecord, bool, error) {
	payload, err := json.Marshal(data)
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	if idempotency.Key != "" {
		lockKey := idempotency.Scope + ":" + idempotency.Key
		if _, err := transaction.Exec(
			ctx,
			`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
			lockKey,
		); err != nil {
			return domain.EntityRecord{}, false, err
		}
		var storedHash string
		var entityID string
		err := transaction.QueryRow(ctx, `
			SELECT request_hash, entity_id::text
			FROM catalog_idempotency_keys
			WHERE scope = $1 AND idempotency_key = $2
		`, idempotency.Scope, idempotency.Key).Scan(&storedHash, &entityID)
		if err == nil {
			if storedHash != idempotency.RequestHash {
				return domain.EntityRecord{}, false, ports.ErrIdempotencyConflict
			}
			entity, err := scanEntity(transaction.QueryRow(ctx, `
				SELECT
					id::text, human_id, entity_key, definition_id::text, definition_version_id::text,
					definition_version, schema_version, manifest_checksum, state, data,
					created_at, updated_at
				FROM entity_records
				WHERE id = $1::uuid
			`, entityID))
			return entity, true, err
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return domain.EntityRecord{}, false, err
		}
	}

	row := transaction.QueryRow(ctx, `
		INSERT INTO entity_records (
			human_id, entity_key, definition_id, definition_version_id,
			definition_version, schema_version, manifest_checksum, state, data
		)
		VALUES (
			$1 || '-' || lpad(nextval('entity_human_id_seq')::text, 6, '0'),
			$2, $3::uuid, $3::uuid, $4, $5, $6, $7, $8
		)
		RETURNING
			id::text, human_id, entity_key, definition_id::text, definition_version_id::text,
			definition_version, schema_version, manifest_checksum, state, data,
			created_at, updated_at
	`,
		definition.Specification.Identity.Prefix,
		definition.EntityKey,
		definition.ID,
		definition.Version,
		definition.MetamodelVersion,
		definition.Checksum,
		definition.InitialState(),
		payload,
	)
	entity, err := scanEntity(row)
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	resources := []domain.ResourceReference(nil)
	if definition.Manifest != nil {
		resources = definition.Manifest.Resources
	}
	event, err := domain.NewEntityCreatedEvent(entity, resources)
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	if err := insertOutbox(ctx, transaction, event); err != nil {
		return domain.EntityRecord{}, false, err
	}
	if idempotency.Key != "" {
		if _, err := transaction.Exec(ctx, `
			INSERT INTO catalog_idempotency_keys (
				scope, idempotency_key, request_hash, entity_id
			)
			VALUES ($1, $2, $3, $4::uuid)
		`, idempotency.Scope, idempotency.Key, idempotency.RequestHash, entity.ID); err != nil {
			return domain.EntityRecord{}, false, err
		}
	}
	if err := transaction.Commit(ctx); err != nil {
		return domain.EntityRecord{}, false, err
	}
	return entity, false, nil
}

func (repository *Repository) LookupEntityByIdempotency(
	ctx context.Context,
	idempotency ports.IdempotencyRequest,
) (domain.EntityRecord, bool, error) {
	if idempotency.Key == "" {
		return domain.EntityRecord{}, false, nil
	}
	var storedHash string
	var entityID string
	err := repository.pool.QueryRow(ctx, `
		SELECT request_hash, entity_id::text
		FROM catalog_idempotency_keys
		WHERE scope = $1 AND idempotency_key = $2
	`, idempotency.Scope, idempotency.Key).Scan(&storedHash, &entityID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.EntityRecord{}, false, nil
	}
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	if storedHash != idempotency.RequestHash {
		return domain.EntityRecord{}, false, ports.ErrIdempotencyConflict
	}
	entity, err := scanEntity(repository.pool.QueryRow(ctx, `
		SELECT
			id::text, human_id, entity_key, definition_id::text, definition_version_id::text,
			definition_version, schema_version, manifest_checksum, state, data,
			created_at, updated_at
		FROM entity_records
		WHERE id = $1::uuid
	`, entityID))
	if err != nil {
		return domain.EntityRecord{}, false, err
	}
	return entity, true, nil
}

func (repository *Repository) GetEntity(
	ctx context.Context,
	entityKey string,
	entityID string,
) (domain.EntityRecord, error) {
	row := repository.pool.QueryRow(ctx, `
		SELECT
			id::text, human_id, entity_key, definition_id::text, definition_version_id::text,
			definition_version, schema_version, manifest_checksum, state, data,
			created_at, updated_at
		FROM entity_records
		WHERE entity_key = $1 AND (id::text = $2 OR human_id = $2)
	`, entityKey, entityID)
	entity, err := scanEntity(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.EntityRecord{}, ports.ErrNotFound
	}
	return entity, err
}

func (repository *Repository) UpdateEntity(
	ctx context.Context,
	current domain.EntityRecord,
	data map[string]any,
	manifest domain.ExecutableDefinitionManifest,
	principal ports.Principal,
) (domain.EntityRecord, error) {
	payload, err := json.Marshal(data)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.EntityRecord{}, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	entity, err := scanEntity(transaction.QueryRow(ctx, `
		UPDATE entity_records
		SET
			data = $2,
			updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
		WHERE id = $1::uuid AND updated_at = $3
		RETURNING
			id::text, human_id, entity_key, definition_id::text, definition_version_id::text,
			definition_version, schema_version, manifest_checksum, state, data,
			created_at, updated_at
	`, current.ID, payload, current.UpdatedAt))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.EntityRecord{}, ports.ErrVersionConflict
	}
	if err != nil {
		return domain.EntityRecord{}, err
	}
	event, err := domain.NewEntityUpdatedEvent(
		current,
		entity,
		manifest.Resources,
		principal.ID,
	)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	if err := insertOutbox(ctx, transaction, event); err != nil {
		return domain.EntityRecord{}, err
	}
	if err := transaction.Commit(ctx); err != nil {
		return domain.EntityRecord{}, err
	}
	return entity, nil
}

func (repository *Repository) TransitionEntity(
	ctx context.Context,
	current domain.EntityRecord,
	nextState string,
	transitionKey string,
	manifest domain.ExecutableDefinitionManifest,
) (domain.EntityRecord, error) {
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.EntityRecord{}, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	row := transaction.QueryRow(ctx, `
		UPDATE entity_records
		SET state = $3, updated_at = now()
		WHERE id = $1::uuid AND state = $2
		RETURNING
			id::text, human_id, entity_key, definition_id::text, definition_version_id::text,
			definition_version, schema_version, manifest_checksum, state, data,
			created_at, updated_at
	`, current.ID, current.State, nextState)
	entity, err := scanEntity(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.EntityRecord{}, ports.ErrVersionConflict
	}
	if err != nil {
		return domain.EntityRecord{}, err
	}
	event, err := domain.NewEntityTransitionedEvent(
		current,
		entity,
		transitionKey,
		manifest.Resources,
	)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	if err := insertOutbox(ctx, transaction, event); err != nil {
		return domain.EntityRecord{}, err
	}
	if err := transaction.Commit(ctx); err != nil {
		return domain.EntityRecord{}, err
	}
	return entity, nil
}

func (repository *Repository) ListEntities(ctx context.Context, entityKey string) ([]domain.EntityRecord, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT
			id::text, human_id, entity_key, definition_id::text, definition_version_id::text,
			definition_version, schema_version, manifest_checksum, state, data,
			created_at, updated_at
		FROM entity_records
		WHERE entity_key = $1
		ORDER BY created_at DESC
		LIMIT 200
	`, entityKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entities := make([]domain.EntityRecord, 0)
	for rows.Next() {
		entity, scanErr := scanEntity(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		entities = append(entities, entity)
	}
	return entities, rows.Err()
}

const relationColumns = `
	id::text, contract_version, relation_key, relation_label, inverse_key, inverse_label,
	source_entity_id::text, source_entity_key, source_human_id,
	source_definition_version_id::text,
	target_entity_id::text, target_entity_key, target_human_id,
	target_definition_version_id::text, created_by, created_at
`

func (repository *Repository) ListEntityRelations(
	ctx context.Context,
	entityID string,
) ([]domain.EntityRelation, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT `+relationColumns+`
		FROM catalog_entity_relations
		WHERE source_entity_id = $1::uuid OR target_entity_id = $1::uuid
		ORDER BY created_at
	`, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	relations := make([]domain.EntityRelation, 0)
	for rows.Next() {
		relation, scanErr := scanRelation(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		relations = append(relations, relation)
	}
	return relations, rows.Err()
}

func (repository *Repository) CreateEntityRelation(
	ctx context.Context,
	relation domain.EntityRelation,
) (domain.EntityRelation, bool, error) {
	row := repository.pool.QueryRow(ctx, `
		INSERT INTO catalog_entity_relations (
			contract_version, relation_key, relation_label, inverse_key, inverse_label,
			source_entity_id, source_entity_key, source_human_id, source_definition_version_id,
			target_entity_id, target_entity_key, target_human_id, target_definition_version_id,
			created_by
		)
		VALUES (
			$1, $2, $3, $4, $5,
			$6::uuid, $7, $8, $9::uuid,
			$10::uuid, $11, $12, $13::uuid,
			$14
		)
		ON CONFLICT (source_entity_id, relation_key, target_entity_id) DO NOTHING
		RETURNING `+relationColumns,
		relation.ContractVersion,
		relation.RelationKey,
		relation.RelationLabel,
		relation.InverseKey,
		relation.InverseLabel,
		relation.SourceEntityID,
		relation.SourceEntityKey,
		relation.SourceHumanID,
		relation.SourceDefinitionVersionID,
		relation.TargetEntityID,
		relation.TargetEntityKey,
		relation.TargetHumanID,
		relation.TargetDefinitionVersionID,
		relation.CreatedBy,
	)
	created, err := scanRelation(row)
	if err == nil {
		return created, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return domain.EntityRelation{}, false, err
	}
	existing, err := scanRelation(repository.pool.QueryRow(ctx, `
		SELECT `+relationColumns+`
		FROM catalog_entity_relations
		WHERE source_entity_id = $1::uuid
			AND relation_key = $2
			AND target_entity_id = $3::uuid
	`, relation.SourceEntityID, relation.RelationKey, relation.TargetEntityID))
	if err != nil {
		return domain.EntityRelation{}, false, err
	}
	return existing, true, nil
}

func (repository *Repository) DeleteEntityRelation(
	ctx context.Context,
	relationID string,
	entityID string,
) error {
	tag, err := repository.pool.Exec(ctx, `
		DELETE FROM catalog_entity_relations
		WHERE id = $1::uuid
			AND (source_entity_id = $2::uuid OR target_entity_id = $2::uuid)
	`, relationID, entityID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ports.ErrNotFound
	}
	return nil
}

func (repository *Repository) ClaimOutbox(
	ctx context.Context,
	lockID string,
	limit int,
	now time.Time,
	lease time.Duration,
) ([]domain.OutboxMessage, error) {
	rows, err := repository.pool.Query(ctx, `
		WITH candidates AS (
			SELECT id
			FROM catalog_event_outbox
			WHERE published_at IS NULL
				AND available_at <= $3
				AND (locked_until IS NULL OR locked_until <= $3)
			ORDER BY created_at
			FOR UPDATE SKIP LOCKED
			LIMIT $2
		)
		UPDATE catalog_event_outbox AS outbox
		SET lock_id = $1::uuid,
			locked_until = $4,
			attempts = outbox.attempts + 1
		FROM candidates
		WHERE outbox.id = candidates.id
		RETURNING
			outbox.id::text, outbox.event_id::text, outbox.event_type,
			outbox.occurred_at, outbox.aggregate_id, outbox.entity_key,
			outbox.schema_version, outbox.payload, outbox.attempts,
			outbox.available_at, outbox.created_at
	`, lockID, limit, now.UTC(), now.Add(lease).UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := make([]domain.OutboxMessage, 0, limit)
	for rows.Next() {
		message, err := scanOutbox(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}
	return messages, rows.Err()
}

func (repository *Repository) OutboxStatus(
	ctx context.Context,
	now time.Time,
) (domain.OutboxStatus, error) {
	status := domain.OutboxStatus{CheckedAt: now.UTC()}
	err := repository.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE published_at IS NULL),
			COUNT(*) FILTER (
				WHERE published_at IS NULL
					AND attempts > 0
					AND COALESCE(last_error, '') <> ''
			),
			COALESCE(MAX(attempts) FILTER (WHERE published_at IS NULL), 0),
			MIN(created_at) FILTER (WHERE published_at IS NULL),
			COUNT(*) FILTER (WHERE published_at >= $1)
		FROM catalog_event_outbox
	`, now.Add(-time.Hour).UTC()).Scan(
		&status.Pending,
		&status.Retrying,
		&status.MaxAttempts,
		&status.OldestPendingAt,
		&status.PublishedLastHour,
	)
	if err != nil {
		return domain.OutboxStatus{}, err
	}
	status.Healthy = status.Retrying == 0 && status.MaxAttempts < 5
	return status, nil
}

func (repository *Repository) MarkOutboxPublished(
	ctx context.Context,
	messageID string,
	lockID string,
	publishedAt time.Time,
) error {
	tag, err := repository.pool.Exec(ctx, `
		UPDATE catalog_event_outbox
		SET published_at = $3, lock_id = NULL, locked_until = NULL, last_error = NULL
		WHERE id = $1::uuid AND lock_id = $2::uuid AND published_at IS NULL
	`, messageID, lockID, publishedAt.UTC())
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ports.ErrVersionConflict
	}
	return nil
}

func (repository *Repository) MarkOutboxFailed(
	ctx context.Context,
	messageID string,
	lockID string,
	lastError string,
	nextAttempt time.Time,
) error {
	tag, err := repository.pool.Exec(ctx, `
		UPDATE catalog_event_outbox
		SET available_at = $3,
			last_error = $4,
			lock_id = NULL,
			locked_until = NULL
		WHERE id = $1::uuid AND lock_id = $2::uuid AND published_at IS NULL
	`, messageID, lockID, nextAttempt.UTC(), lastError)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ports.ErrVersionConflict
	}
	return nil
}

func insertOutbox(
	ctx context.Context,
	transaction pgx.Tx,
	event domain.EventEnvelope,
) error {
	_, err := transaction.Exec(ctx, `
		INSERT INTO catalog_event_outbox (
			event_id, event_type, occurred_at, aggregate_id,
			entity_key, schema_version, payload, available_at
		)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $3)
	`,
		event.EventID,
		event.EventType,
		event.OccurredAt,
		event.AggregateID,
		event.EntityKey,
		event.SchemaVersion,
		event.Payload,
	)
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanDefinition(row scanner) (domain.Definition, error) {
	var definition domain.Definition
	var specification []byte
	var manifest []byte
	err := row.Scan(
		&definition.ID,
		&definition.EntityKey,
		&definition.Name,
		&definition.Version,
		&definition.MetamodelVersion,
		&definition.Status,
		&specification,
		&manifest,
		&definition.Checksum,
		&definition.CreatedAt,
		&definition.PublishedAt,
	)
	if err != nil {
		return domain.Definition{}, err
	}
	if err := json.Unmarshal(specification, &definition.Specification); err != nil {
		return domain.Definition{}, fmt.Errorf("decode catalog specification: %w", err)
	}
	if len(manifest) > 0 {
		var executable domain.ExecutableDefinitionManifest
		if err := json.Unmarshal(manifest, &executable); err != nil {
			return domain.Definition{}, fmt.Errorf("decode executable manifest: %w", err)
		}
		definition.Manifest = &executable
	}
	return definition, nil
}

func scanEntity(row scanner) (domain.EntityRecord, error) {
	var entity domain.EntityRecord
	var data []byte
	err := row.Scan(
		&entity.ID,
		&entity.HumanID,
		&entity.EntityKey,
		&entity.DefinitionID,
		&entity.DefinitionVersionID,
		&entity.DefinitionVersion,
		&entity.SchemaVersion,
		&entity.ManifestChecksum,
		&entity.State,
		&data,
		&entity.CreatedAt,
		&entity.UpdatedAt,
	)
	if err != nil {
		return domain.EntityRecord{}, err
	}
	if err := json.Unmarshal(data, &entity.Data); err != nil {
		return domain.EntityRecord{}, fmt.Errorf("decode entity data: %w", err)
	}
	return entity, nil
}

func scanRelation(row scanner) (domain.EntityRelation, error) {
	var relation domain.EntityRelation
	err := row.Scan(
		&relation.ID,
		&relation.ContractVersion,
		&relation.RelationKey,
		&relation.RelationLabel,
		&relation.InverseKey,
		&relation.InverseLabel,
		&relation.SourceEntityID,
		&relation.SourceEntityKey,
		&relation.SourceHumanID,
		&relation.SourceDefinitionVersionID,
		&relation.TargetEntityID,
		&relation.TargetEntityKey,
		&relation.TargetHumanID,
		&relation.TargetDefinitionVersionID,
		&relation.CreatedBy,
		&relation.CreatedAt,
	)
	if err != nil {
		return domain.EntityRelation{}, err
	}
	return relation, nil
}

func scanOutbox(row scanner) (domain.OutboxMessage, error) {
	var message domain.OutboxMessage
	var payload []byte
	err := row.Scan(
		&message.ID,
		&message.Event.EventID,
		&message.Event.EventType,
		&message.Event.OccurredAt,
		&message.Event.AggregateID,
		&message.Event.EntityKey,
		&message.Event.SchemaVersion,
		&payload,
		&message.Attempts,
		&message.AvailableAt,
		&message.CreatedAt,
	)
	if err != nil {
		return domain.OutboxMessage{}, err
	}
	message.Event.Payload = json.RawMessage(payload)
	return message, nil
}
