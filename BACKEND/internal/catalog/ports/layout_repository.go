package ports

import (
	"context"

	"sig-desk/backend/internal/catalog/domain"
)

type LayoutRepository interface {
	GetDraft(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error)
	CreateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error)
	UpdateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error)
	PublishDraft(
		ctx context.Context,
		entityKey string,
		compat *domain.CompatibilityFingerprint,
		checksum string,
	) (*domain.CatalogLayoutVersion, error)
	GetVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error)
	GetActiveVersion(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error)
	ListPublishedVersionsDesc(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error)
	ListVersions(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error)
	ActivateVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error)
}
