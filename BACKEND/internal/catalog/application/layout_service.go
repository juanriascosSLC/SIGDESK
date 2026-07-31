package application

import (
	"context"
	"fmt"

	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
	identityDomain "sig-desk/backend/internal/identity/domain"
	identityPorts "sig-desk/backend/internal/identity/ports"
)

// authorized reports whether actor holds permission, with the same exception
// every HTTP guard() in httpserver already grants: when no auth authority is
// configured (local development, and any environment — including this
// repository's own Playwright suite — that runs with SIGTOOLS_API_URL unset),
// requests never carry an Identity at all (see identityPorts.Resolution's own
// doc comment: "nothing pretends an Identity exists"). Without this
// exception, every layout endpoint would 403/401 unconditionally in that
// mode, unlike every other catalog and ticket endpoint.
func authorized(ctx context.Context, actor identityDomain.Identity, permission string) bool {
	if identityPorts.ResolutionFromContext(ctx).AuthDisabled {
		return true
	}
	return actor.Can(permission)
}

type LayoutService struct {
	layoutRepo ports.LayoutRepository
	catRepo    ports.Repository
	authorizer ports.RecordAuthorizer
	validator  *LayoutValidator
}

func NewLayoutService(
	layoutRepo ports.LayoutRepository,
	catRepo ports.Repository,
	authorizer ports.RecordAuthorizer,
	validator *LayoutValidator,
) *LayoutService {
	return &LayoutService{
		layoutRepo: layoutRepo,
		catRepo:    catRepo,
		authorizer: authorizer,
		validator:  validator,
	}
}

func (s *LayoutService) GetDraft(ctx context.Context, actor identityDomain.Identity, entityKey string) (*domain.CatalogLayoutVersion, error) {
	if !authorized(ctx, actor, identityDomain.PermCatalogAuthor) {
		return nil, identityDomain.ErrForbidden
	}
	return s.layoutRepo.GetDraft(ctx, entityKey)
}

func (s *LayoutService) CreateDraft(ctx context.Context, actor identityDomain.Identity, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error) {
	if !authorized(ctx, actor, identityDomain.PermCatalogAuthor) {
		return nil, identityDomain.ErrForbidden
	}
	if len(doc) == 0 {
		// Synthesize default document if empty
		def, err := s.catRepo.GetPublishedDefinition(ctx, entityKey)
		if err == nil && def.Manifest != nil {
			doc = s.validator.SynthesizeFromManifest(*def.Manifest)
		} else {
			doc = map[string]any{"detail": map[string]any{}}
		}
	}
	return s.layoutRepo.CreateDraft(ctx, entityKey, doc)
}

func (s *LayoutService) UpdateDraft(ctx context.Context, actor identityDomain.Identity, entityKey string, doc map[string]any) (*domain.CatalogLayoutVersion, error) {
	if !authorized(ctx, actor, identityDomain.PermCatalogAuthor) {
		return nil, identityDomain.ErrForbidden
	}
	return s.layoutRepo.UpdateDraft(ctx, entityKey, doc)
}

func (s *LayoutService) PublishDraft(ctx context.Context, actor identityDomain.Identity, entityKey string) (*domain.CatalogLayoutVersion, error) {
	if !authorized(ctx, actor, identityDomain.PermCatalogPublish) {
		return nil, identityDomain.ErrForbidden
	}

	// GetDraft here is only an existence/permission-flavored pre-check (so a
	// missing draft fails fast without touching the definition lookup below).
	// It is NOT the document that gets validated or published: that would be
	// a stale read taken before any lock, and a concurrent UpdateDraft could
	// race between this read and the repository's actual publish, producing
	// a published row whose compatibility/checksum describe a document that
	// isn't the one that ends up stored. The real, authoritative document is
	// whatever the repository locks and hands to `validate` below.
	if _, err := s.layoutRepo.GetDraft(ctx, entityKey); err != nil {
		return nil, err
	}

	def, err := s.catRepo.GetPublishedDefinition(ctx, entityKey)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch active definition: %w", err)
	}

	manifest := def.Manifest
	if manifest == nil {
		manifest = &domain.ExecutableDefinitionManifest{
			DefinitionVersionID: def.ID,
			EntityKey:           def.EntityKey,
			Version:             def.Version,
			Specification:       def.Specification,
		}
	}

	return s.layoutRepo.PublishDraft(ctx, entityKey, func(document map[string]any) (*domain.CompatibilityFingerprint, string, error) {
		if err := s.validator.ValidateCompatibility(document, *manifest); err != nil {
			return nil, "", fmt.Errorf("%w: %v", domain.ErrLayoutIncompatible, err)
		}
		compat := s.validator.DeriveCompatibility(document, *manifest)
		checksum, err := domain.ComputeCanonicalChecksum(document, compat)
		if err != nil {
			return nil, "", err
		}
		return compat, checksum, nil
	})
}

func (s *LayoutService) ListVersions(ctx context.Context, actor identityDomain.Identity, entityKey string) ([]domain.CatalogLayoutVersion, error) {
	if !authorized(ctx, actor, identityDomain.PermCatalogView) {
		return nil, identityDomain.ErrForbidden
	}
	return s.layoutRepo.ListVersions(ctx, entityKey)
}

func (s *LayoutService) GetActiveVersion(ctx context.Context, actor identityDomain.Identity, entityKey string) (*domain.CatalogLayoutVersion, error) {
	if !authorized(ctx, actor, identityDomain.PermCatalogView) {
		return nil, identityDomain.ErrForbidden
	}
	return s.layoutRepo.GetActiveVersion(ctx, entityKey)
}

func (s *LayoutService) ActivateVersion(ctx context.Context, actor identityDomain.Identity, entityKey string, version int) (*domain.CatalogLayoutVersion, error) {
	if !authorized(ctx, actor, identityDomain.PermCatalogPublish) {
		return nil, identityDomain.ErrForbidden
	}
	return s.layoutRepo.ActivateVersion(ctx, entityKey, version)
}

func (s *LayoutService) ResolveLayoutForRecord(
	ctx context.Context,
	actor identityDomain.Identity,
	entityKey string,
	recordID string,
) (*domain.ResolvedDefinitionResponse, error) {
	record, err := s.catRepo.GetEntity(ctx, entityKey, recordID)
	if err != nil {
		return nil, ErrRecordNotFound
	}

	if record.EntityKey != entityKey {
		return nil, ErrRecordNotFound // Avoid disclosing record presence
	}

	if err := s.authorizer.AuthorizeRecordAccess(ctx, actor, entityKey, recordID, record.Data); err != nil {
		return nil, err
	}

	def, err := s.catRepo.GetDefinition(ctx, entityKey, record.DefinitionVersion)
	if err != nil {
		return nil, fmt.Errorf("loading definition version %d: %w", record.DefinitionVersion, err)
	}

	manifest := def.Manifest
	if manifest == nil {
		manifest = &domain.ExecutableDefinitionManifest{
			DefinitionVersionID: def.ID,
			EntityKey:           def.EntityKey,
			Version:             def.Version,
			Specification:       def.Specification,
		}
	}

	// 1. Try active layout
	activeLayout, err := s.layoutRepo.GetActiveVersion(ctx, entityKey)
	if err == nil && activeLayout != nil && activeLayout.Compatibility != nil {
		if s.validator.IsCompatible(activeLayout.Compatibility, *manifest) {
			return s.buildResolvedResponse(record, def, *manifest, activeLayout, "latest-compatible"), nil
		}
	}

	// 2. Try previous published versions
	publishedList, err := s.layoutRepo.ListPublishedVersionsDesc(ctx, entityKey)
	if err == nil {
		for _, past := range publishedList {
			if past.Compatibility != nil && s.validator.IsCompatible(past.Compatibility, *manifest) {
				return s.buildResolvedResponse(record, def, *manifest, &past, "previous-compatible"), nil
			}
		}
	}

	// 3. Fallback: Legacy Synthesized (0 DB WRITES)
	synthDoc := s.validator.SynthesizeFromManifest(*manifest)
	return s.buildResolvedResponseLegacy(record, def, *manifest, synthDoc, "legacy-synthesized"), nil
}

func (s *LayoutService) buildResolvedResponse(
	record domain.EntityRecord,
	def domain.Definition,
	manifest domain.ExecutableDefinitionManifest,
	layout *domain.CatalogLayoutVersion,
	resolution string,
) *domain.ResolvedDefinitionResponse {
	verId := layout.ID
	verNum := layout.Version

	return &domain.ResolvedDefinitionResponse{
		EntityID:            record.ID,
		HumanID:             record.HumanID,
		EntityKey:           record.EntityKey,
		DefinitionVersionID: record.DefinitionVersionID,
		SchemaVersion:       record.SchemaVersion,
		WorkflowVersion:     record.SchemaVersion,
		MetamodelVersion:    def.MetamodelVersion,
		LayoutVersionID:     &verId,
		LayoutVersion:       &verNum,
		LayoutResolution:    resolution,
		Fields:              manifest.Specification.Fields,
		Lifecycle:           manifest.Specification.Lifecycle,
		Layouts:             layout.Document,
	}
}

func (s *LayoutService) buildResolvedResponseLegacy(
	record domain.EntityRecord,
	def domain.Definition,
	manifest domain.ExecutableDefinitionManifest,
	synthDoc map[string]any,
	resolution string,
) *domain.ResolvedDefinitionResponse {
	return &domain.ResolvedDefinitionResponse{
		EntityID:            record.ID,
		HumanID:             record.HumanID,
		EntityKey:           record.EntityKey,
		DefinitionVersionID: record.DefinitionVersionID,
		SchemaVersion:       record.SchemaVersion,
		WorkflowVersion:     record.SchemaVersion,
		MetamodelVersion:    def.MetamodelVersion,
		LayoutVersionID:     nil,
		LayoutVersion:       nil,
		LayoutResolution:    resolution,
		Fields:              manifest.Specification.Fields,
		Lifecycle:           manifest.Specification.Lifecycle,
		Layouts:             synthDoc,
	}
}
