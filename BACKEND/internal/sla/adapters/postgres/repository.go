package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sig-desk/backend/internal/sla/domain"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const policyColumns = `
	id::text, resource_id, version, status, contract_version,
	policy, created_at, published_at
`

func (repository *Repository) ListPolicies(ctx context.Context) ([]domain.Policy, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT `+policyColumns+`
		FROM sla_policies
		ORDER BY resource_id, version DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.Policy, 0)
	for rows.Next() {
		policy, err := scanPolicy(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, policy)
	}
	return result, rows.Err()
}

func (repository *Repository) GetPolicy(
	ctx context.Context,
	resourceID string,
	version int,
) (domain.Policy, error) {
	policy, err := scanPolicy(repository.pool.QueryRow(ctx, `
		SELECT `+policyColumns+`
		FROM sla_policies
		WHERE resource_id = $1 AND version = $2
	`, resourceID, version))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Policy{}, domain.ErrPolicyNotFound
	}
	return policy, err
}

func (repository *Repository) GetPublishedPolicy(
	ctx context.Context,
	resourceID string,
) (domain.Policy, error) {
	policy, err := scanPolicy(repository.pool.QueryRow(ctx, `
		SELECT `+policyColumns+`
		FROM sla_policies
		WHERE resource_id = $1 AND status = 'published'
	`, resourceID))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Policy{}, domain.ErrPolicyNotFound
	}
	return policy, err
}

func (repository *Repository) CreateDraft(
	ctx context.Context,
	policy domain.Policy,
) (domain.Policy, error) {
	payload, err := json.Marshal(policy)
	if err != nil {
		return domain.Policy{}, err
	}
	return scanPolicy(repository.pool.QueryRow(ctx, `
		INSERT INTO sla_policies (
			resource_id, version, status, contract_version, policy
		)
		SELECT $1::varchar, COALESCE(MAX(version), 0) + 1, 'draft',
			$2::varchar, $3::jsonb
		FROM sla_policies
		WHERE resource_id = $1::varchar
		RETURNING `+policyColumns,
		policy.ResourceID,
		policy.ContractVersion,
		payload,
	))
}

func (repository *Repository) UpdateDraft(
	ctx context.Context,
	policy domain.Policy,
) (domain.Policy, error) {
	payload, err := json.Marshal(policy)
	if err != nil {
		return domain.Policy{}, err
	}
	updated, err := scanPolicy(repository.pool.QueryRow(ctx, `
		UPDATE sla_policies
		SET contract_version = $3, policy = $4
		WHERE resource_id = $1 AND version = $2 AND status = 'draft'
		RETURNING `+policyColumns,
		policy.ResourceID,
		policy.Version,
		policy.ContractVersion,
		payload,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Policy{}, domain.ErrPolicyNotFound
	}
	return updated, err
}

func (repository *Repository) Publish(
	ctx context.Context,
	resourceID string,
	version int,
) (domain.Policy, error) {
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Policy{}, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()
	if _, err = transaction.Exec(ctx, `
		UPDATE sla_policies SET status = 'deprecated'
		WHERE resource_id = $1 AND status = 'published'
	`, resourceID); err != nil {
		return domain.Policy{}, err
	}
	policy, err := scanPolicy(transaction.QueryRow(ctx, `
		UPDATE sla_policies
		SET status = 'published', published_at = now()
		WHERE resource_id = $1 AND version = $2 AND status = 'draft'
		RETURNING `+policyColumns,
		resourceID,
		version,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Policy{}, domain.ErrPolicyNotFound
	}
	if err != nil {
		return domain.Policy{}, err
	}
	if err := transaction.Commit(ctx); err != nil {
		return domain.Policy{}, err
	}
	return policy, nil
}

func (repository *Repository) ListAssessments(ctx context.Context) ([]domain.Assessment, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT assessment FROM sla_assessments ORDER BY started_at DESC LIMIT 500
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.Assessment, 0)
	for rows.Next() {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}
		var assessment domain.Assessment
		if err := json.Unmarshal(payload, &assessment); err != nil {
			return nil, fmt.Errorf("decode SLA assessment: %w", err)
		}
		result = append(result, assessment)
	}
	return result, rows.Err()
}

func (repository *Repository) GetAssessment(
	ctx context.Context,
	entityID string,
) (domain.Assessment, error) {
	var payload []byte
	err := repository.pool.QueryRow(ctx, `
		SELECT assessment FROM sla_assessments WHERE entity_id = $1
	`, entityID).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Assessment{}, domain.ErrPolicyNotFound
	}
	if err != nil {
		return domain.Assessment{}, err
	}
	var assessment domain.Assessment
	if err := json.Unmarshal(payload, &assessment); err != nil {
		return domain.Assessment{}, fmt.Errorf("decode SLA assessment: %w", err)
	}
	return assessment, nil
}

func (repository *Repository) SaveAssessment(
	ctx context.Context,
	eventID string,
	assessment domain.Assessment,
) (bool, error) {
	payload, err := json.Marshal(assessment)
	if err != nil {
		return false, err
	}
	transaction, err := repository.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, err
	}
	defer func() { _ = transaction.Rollback(ctx) }()
	tag, err := transaction.Exec(ctx, `
		INSERT INTO sla_processed_events (event_id) VALUES ($1::uuid)
		ON CONFLICT (event_id) DO NOTHING
	`, eventID)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, nil
	}
	_, err = transaction.Exec(ctx, `
		INSERT INTO sla_assessments (
			entity_id, human_id, policy_id, policy_version, priority,
			started_at, response_due_at, resolution_due_at, assessment, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
		ON CONFLICT (entity_id) DO UPDATE SET
			human_id = EXCLUDED.human_id,
			policy_id = EXCLUDED.policy_id,
			policy_version = EXCLUDED.policy_version,
			priority = EXCLUDED.priority,
			response_due_at = EXCLUDED.response_due_at,
			resolution_due_at = EXCLUDED.resolution_due_at,
			assessment = EXCLUDED.assessment,
			updated_at = now()
	`,
		assessment.EntityID,
		assessment.HumanID,
		assessment.PolicyID,
		assessment.PolicyVersion,
		assessment.Priority,
		assessment.StartedAt,
		assessment.ResponseDueAt,
		assessment.ResolutionDueAt,
		payload,
	)
	if err != nil {
		return false, err
	}
	if err := transaction.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanPolicy(row scanner) (domain.Policy, error) {
	var policy domain.Policy
	var payload []byte
	err := row.Scan(
		&policy.ID,
		&policy.ResourceID,
		&policy.Version,
		&policy.Status,
		&policy.ContractVersion,
		&payload,
		&policy.CreatedAt,
		&policy.PublishedAt,
	)
	if err != nil {
		return domain.Policy{}, err
	}
	status := policy.Status
	id := policy.ID
	version := policy.Version
	resourceID := policy.ResourceID
	contractVersion := policy.ContractVersion
	createdAt := policy.CreatedAt
	publishedAt := policy.PublishedAt
	if err := json.Unmarshal(payload, &policy); err != nil {
		return domain.Policy{}, fmt.Errorf("decode SLA policy: %w", err)
	}
	policy.ID = id
	policy.ResourceID = resourceID
	policy.Version = version
	policy.Status = status
	policy.ContractVersion = contractVersion
	policy.CreatedAt = createdAt
	policy.PublishedAt = publishedAt
	return policy, nil
}
