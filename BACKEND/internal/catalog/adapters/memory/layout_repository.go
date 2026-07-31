package memory

import (
	"context"
	"sort"
	"sync"
	"time"

	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type LayoutRepository struct {
	mu       sync.Mutex
	versions map[string][]domain.CatalogLayoutVersion
}

func NewLayoutRepository() *LayoutRepository {
	return &LayoutRepository{
		versions: make(map[string][]domain.CatalogLayoutVersion),
	}
}

func (r *LayoutRepository) GetDraft(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, l := range r.versions[entityKey] {
		if l.Status == domain.LayoutStatusDraft {
			cp := l
			return &cp, nil
		}
	}
	return nil, domain.ErrDraftNotFound
}

func (r *LayoutRepository) CreateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, l := range r.versions[entityKey] {
		if l.Status == domain.LayoutStatusDraft {
			return nil, domain.ErrDraftAlreadyExists
		}
	}

	l := domain.CatalogLayoutVersion{
		ID:        domain.NewUUID(),
		EntityKey: entityKey,
		Version:   0,
		Status:    domain.LayoutStatusDraft,
		Document:  doc,
		IsActive:  false,
		CreatedAt: time.Now(),
	}

	r.versions[entityKey] = append(r.versions[entityKey], l)
	cp := l
	return &cp, nil
}

func (r *LayoutRepository) UpdateDraft(ctx context.Context, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	list := r.versions[entityKey]
	for i, l := range list {
		if l.Status == domain.LayoutStatusDraft {
			list[i].Document = doc
			cp := list[i]
			return &cp, nil
		}
	}
	return nil, domain.ErrDraftNotFound
}

func (r *LayoutRepository) PublishDraft(
	ctx context.Context,
	entityKey string,
	validate ports.Validate,
) (*domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	list := r.versions[entityKey]
	draftIdx := -1
	maxVer := 0
	for i, l := range list {
		if l.Status == domain.LayoutStatusDraft {
			draftIdx = i
		}
		if l.Version > maxVer {
			maxVer = l.Version
		}
	}

	if draftIdx < 0 {
		return nil, domain.ErrDraftNotFound
	}

	// Validate against the document as it stands right now, under the same
	// lock that will publish it — mirrors the postgres adapter's FOR UPDATE
	// read, so a concurrent UpdateDraft can never race a stale validation
	// result into the published row.
	compat, checksum, err := validate(list[draftIdx].Document)
	if err != nil {
		return nil, err
	}

	for i := range list {
		list[i].IsActive = false
	}

	now := time.Now()
	list[draftIdx].Status = domain.LayoutStatusPublished
	list[draftIdx].Version = maxVer + 1
	list[draftIdx].Compatibility = compat
	list[draftIdx].Checksum = checksum
	list[draftIdx].IsActive = true
	list[draftIdx].PublishedAt = &now

	cp := list[draftIdx]
	return &cp, nil
}

func (r *LayoutRepository) GetVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, l := range r.versions[entityKey] {
		if l.Version == version {
			cp := l
			return &cp, nil
		}
	}
	return nil, domain.ErrLayoutNotFound
}

func (r *LayoutRepository) GetActiveVersion(ctx context.Context, entityKey string) (*domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, l := range r.versions[entityKey] {
		if l.IsActive {
			cp := l
			return &cp, nil
		}
	}
	return nil, domain.ErrLayoutNotFound
}

func (r *LayoutRepository) ListPublishedVersionsDesc(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var result []domain.CatalogLayoutVersion
	for _, l := range r.versions[entityKey] {
		if l.Status == domain.LayoutStatusPublished {
			result = append(result, l)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Version > result[j].Version
	})
	return result, nil
}

func (r *LayoutRepository) ListVersions(ctx context.Context, entityKey string) ([]domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	list := make([]domain.CatalogLayoutVersion, len(r.versions[entityKey]))
	copy(list, r.versions[entityKey])
	sort.Slice(list, func(i, j int) bool {
		return list[i].Version < list[j].Version
	})
	return list, nil
}

func (r *LayoutRepository) ActivateVersion(ctx context.Context, entityKey string, version int) (*domain.CatalogLayoutVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	list := r.versions[entityKey]
	targetIdx := -1
	for i, l := range list {
		if l.Version == version {
			if l.Status != domain.LayoutStatusPublished {
				return nil, domain.ErrLayoutIncompatible
			}
			targetIdx = i
		}
	}
	if targetIdx < 0 {
		return nil, domain.ErrLayoutNotFound
	}

	for i := range list {
		list[i].IsActive = false
	}
	list[targetIdx].IsActive = true
	cp := list[targetIdx]
	return &cp, nil
}

var _ ports.LayoutRepository = (*LayoutRepository)(nil)
