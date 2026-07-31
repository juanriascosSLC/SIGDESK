package ports

import (
	"context"

	"sig-desk/backend/internal/catalog/domain"
)

// Validate is invoked by PublishDraft with the draft document EXACTLY as it
// stands at the moment publication is committed — after the draft row is
// locked, not from an earlier, unlocked read. Without this, a concurrent
// UpdateDraft racing a PublishDraft could publish version N's document
// alongside a compatibility fingerprint and checksum computed from a
// different (stale) document: the published row would describe a document
// that was never actually validated.
type Validate func(document map[string]any) (*domain.CompatibilityFingerprint, string, error)

type LayoutRepository interface {
	GetDraft(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error)
	CreateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error)
	UpdateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error)
	PublishDraft(
		ctx context.Context,
		entityKey string,
		validate Validate,
	) (*domain.CatalogLayoutVersion, error)
	GetVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error)
	GetActiveVersion(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error)
	ListPublishedVersionsDesc(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error)
	ListVersions(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error)
	ActivateVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error)
}
