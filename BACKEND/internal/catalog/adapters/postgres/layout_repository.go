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

type LayoutRepository struct {
	pool *pgxpool.Pool
}

func NewLayoutRepository(pool *pgxpool.Pool) *LayoutRepository {
	return &LayoutRepository{pool: pool}
}

const layoutColumns = `
	id::text, entity_key, version, status, document, compatibility, checksum, is_active, created_at, published_at
`

func scanLayout(row pgx.Row) (*domain.CatalogLayoutVersion, error) {
	var l domain.CatalogLayoutVersion
	var statusStr string
	var docBytes, compatBytes []byte
	var checksum sqlNullString
	var publishedAt *time.Time

	err := row.Scan(
		&l.ID,
		&l.EntityKey,
		&l.Version,
		&statusStr,
		&docBytes,
		&compatBytes,
		&checksum,
		&l.IsActive,
		&l.CreatedAt,
		&publishedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrLayoutNotFound
		}
		return nil, err
	}

	l.Status = domain.LayoutStatus(statusStr)
	l.PublishedAt = publishedAt
	l.Checksum = checksum.String

	if len(docBytes) > 0 {
		_ = json.Unmarshal(docBytes, &l.Document)
	}
	if len(compatBytes) > 0 {
		var compat domain.CompatibilityFingerprint
		if err := json.Unmarshal(compatBytes, &compat); err == nil {
			l.Compatibility = &compat
		}
	}

	return &l, nil
}

type sqlNullString struct {
	String string
	Valid  bool
}

func (s *sqlNullString) Scan(value any) error {
	if value == nil {
		s.String, s.Valid = "", false
		return nil
	}
	switch v := value.(type) {
	case string:
		s.String, s.Valid = v, true
	case []byte:
		s.String, s.Valid = string(v), true
	default:
		s.String, s.Valid = fmt.Sprint(value), true
	}
	return nil
}

func (r *LayoutRepository) GetDraft(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error) {
	query := `SELECT ` + layoutColumns + ` FROM catalog_layout_versions WHERE entity_key = $1 AND status = 'draft'`
	row := r.pool.QueryRow(ctx, query, entityKey)
	layout, err := scanLayout(row)
	if errors.Is(err, domain.ErrLayoutNotFound) {
		return nil, domain.ErrDraftNotFound
	}
	return layout, err
}

func (r *LayoutRepository) CreateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Exclusive lock by entityKey
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "catalog_layout:"+entityKey); err != nil {
		return nil, err
	}

	// Check if draft already exists
	var count int
	_ = tx.QueryRow(ctx, "SELECT COUNT(*) FROM catalog_layout_versions WHERE entity_key = $1 AND status = 'draft'", entityKey).Scan(&count)
	if count > 0 {
		return nil, domain.ErrDraftAlreadyExists
	}

	docBytes, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}

	id := domain.NewUUID()
	query := `
		INSERT INTO catalog_layout_versions (id, entity_key, version, status, document, compatibility, checksum, is_active, created_at, published_at)
		VALUES ($1, $2, 0, 'draft', $3, NULL, NULL, false, NOW(), NULL)
		RETURNING ` + layoutColumns

	row := tx.QueryRow(ctx, query, id, entityKey, docBytes)
	layout, err := scanLayout(row)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return layout, nil
}

func (r *LayoutRepository) UpdateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "catalog_layout:"+entityKey); err != nil {
		return nil, err
	}

	docBytes, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}

	query := `
		UPDATE catalog_layout_versions
		SET document = $1
		WHERE entity_key = $2 AND status = 'draft'
		RETURNING ` + layoutColumns

	row := tx.QueryRow(ctx, query, docBytes, entityKey)
	layout, err := scanLayout(row)
	if errors.Is(err, domain.ErrLayoutNotFound) {
		return nil, domain.ErrDraftNotFound
	}
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return layout, nil
}

func (r *LayoutRepository) PublishDraft(
	ctx context.Context,
	entityKey string,
	validate ports.Validate,
) (*domain.CatalogLayoutVersion, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// 1. Lock entityKey
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "catalog_layout:"+entityKey); err != nil {
		return nil, err
	}

	// 2. Lock draft row FOR UPDATE — every read of the document after this
	// point (including the one `validate` receives below) reflects the
	// LATEST committed UpdateDraft, never a stale snapshot taken before this
	// lock was acquired.
	queryDraft := `SELECT ` + layoutColumns + ` FROM catalog_layout_versions WHERE entity_key = $1 AND status = 'draft' FOR UPDATE`
	rowDraft := tx.QueryRow(ctx, queryDraft, entityKey)
	draft, err := scanLayout(rowDraft)
	if errors.Is(err, domain.ErrLayoutNotFound) {
		return nil, domain.ErrDraftNotFound
	}
	if err != nil {
		return nil, err
	}

	// 3. Validate and derive compatibility/checksum from the EXACT document
	// just locked, not from any earlier read the caller may have made.
	compat, checksum, err := validate(draft.Document)
	if err != nil {
		return nil, err
	}

	// 4. Compute next version number
	var maxVersion int
	_ = tx.QueryRow(ctx, "SELECT COALESCE(MAX(version), 0) FROM catalog_layout_versions WHERE entity_key = $1", entityKey).Scan(&maxVersion)
	nextVersion := maxVersion + 1

	compatBytes, err := json.Marshal(compat)
	if err != nil {
		return nil, err
	}

	// 5. Deactivate previous active version
	if _, err := tx.Exec(ctx, "UPDATE catalog_layout_versions SET is_active = false WHERE entity_key = $1 AND is_active = true", entityKey); err != nil {
		return nil, err
	}

	// 6. Update draft to published using RETURNING to return the exact persisted version
	updateQuery := `
		UPDATE catalog_layout_versions
		SET status = 'published', version = $1, published_at = NOW(), compatibility = $2, checksum = $3, is_active = true
		WHERE id = $4
		RETURNING ` + layoutColumns

	publishedRow := tx.QueryRow(ctx, updateQuery, nextVersion, compatBytes, checksum, draft.ID)
	publishedLayout, err := scanLayout(publishedRow)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return publishedLayout, nil
}

func (r *LayoutRepository) GetVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error) {
	query := `SELECT ` + layoutColumns + ` FROM catalog_layout_versions WHERE entity_key = $1 AND version = $2`
	row := r.pool.QueryRow(ctx, query, entityKey, version)
	return scanLayout(row)
}

func (r *LayoutRepository) GetActiveVersion(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error) {
	query := `SELECT ` + layoutColumns + ` FROM catalog_layout_versions WHERE entity_key = $1 AND is_active = true`
	row := r.pool.QueryRow(ctx, query, entityKey)
	return scanLayout(row)
}

func (r *LayoutRepository) ListPublishedVersionsDesc(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error) {
	query := `SELECT ` + layoutColumns + ` FROM catalog_layout_versions WHERE entity_key = $1 AND status = 'published' ORDER BY version DESC`
	rows, err := r.pool.Query(ctx, query, entityKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []domain.CatalogLayoutVersion
	for rows.Next() {
		l, err := scanLayout(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *l)
	}
	return result, rows.Err()
}

func (r *LayoutRepository) ListVersions(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error) {
	query := `SELECT ` + layoutColumns + ` FROM catalog_layout_versions WHERE entity_key = $1 ORDER BY version ASC`
	rows, err := r.pool.Query(ctx, query, entityKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []domain.CatalogLayoutVersion
	for rows.Next() {
		l, err := scanLayout(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *l)
	}
	return result, rows.Err()
}

func (r *LayoutRepository) ActivateVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "catalog_layout:"+entityKey); err != nil {
		return nil, err
	}

	// Verify target version is published
	var targetStatus string
	err = tx.QueryRow(ctx, "SELECT status FROM catalog_layout_versions WHERE entity_key = $1 AND version = $2", entityKey, version).Scan(&targetStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrLayoutNotFound
	}
	if err != nil {
		return nil, err
	}

	if targetStatus != "published" {
		return nil, fmt.Errorf("%w: target version must be published to activate", domain.ErrLayoutIncompatible)
	}

	// Deactivate current active version
	if _, err := tx.Exec(ctx, "UPDATE catalog_layout_versions SET is_active = false WHERE entity_key = $1 AND is_active = true", entityKey); err != nil {
		return nil, err
	}

	// Activate target version
	query := `
		UPDATE catalog_layout_versions
		SET is_active = true
		WHERE entity_key = $1 AND version = $2
		RETURNING ` + layoutColumns

	row := tx.QueryRow(ctx, query, entityKey, version)
	layout, err := scanLayout(row)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return layout, nil
}

var _ ports.LayoutRepository = (*LayoutRepository)(nil)
