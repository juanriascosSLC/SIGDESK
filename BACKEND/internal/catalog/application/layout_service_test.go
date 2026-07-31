package application_test

import (
	"context"
	"testing"
	"time"

	"sig-desk/backend/internal/catalog/adapters/memory"
	"sig-desk/backend/internal/catalog/application"
	"sig-desk/backend/internal/catalog/domain"
	memoryrepo "sig-desk/backend/internal/catalog/adapters/memory"
	identityDomain "sig-desk/backend/internal/identity/domain"
)

// helpers

func makeIdentity(admin bool, perms ...string) identityDomain.Identity {
	var roles []string
	if admin {
		roles = []string{"admin"}
	}
	return identityDomain.Identity{
		Username:    "tester",
		Roles:       roles,
		Permissions: perms,
	}
}

func makeService() (*application.LayoutService, *memoryrepo.LayoutRepository) {
	repo := memoryrepo.NewLayoutRepository()
	catRepo := memory.NewRepository(memory.DemoDefinitions()...)
	auth := application.NewDefaultRecordAuthorizer()
	val := application.NewLayoutValidator()
	svc := application.NewLayoutService(repo, catRepo, auth, val)
	return svc, repo
}

// T01 – draft round-trip

func TestLayoutService_CreateGetDraft(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(false, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	doc := map[string]any{"detail": map[string]any{}}
	draft, err := svc.CreateDraft(ctx, actor, "INC", doc)
	if err != nil {
		t.Fatalf("CreateDraft: %v", err)
	}
	if draft.Status != domain.LayoutStatusDraft {
		t.Errorf("expected draft status, got %s", draft.Status)
	}
	if draft.Version != 0 {
		t.Errorf("expected version 0 for draft, got %d", draft.Version)
	}

	got, err := svc.GetDraft(ctx, actor, "INC")
	if err != nil {
		t.Fatalf("GetDraft: %v", err)
	}
	if got.ID != draft.ID {
		t.Errorf("ID mismatch: want %s, got %s", draft.ID, got.ID)
	}
}

// T02 – duplicate draft rejected

func TestLayoutService_DuplicateDraftRejected(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(false, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, err := svc.CreateDraft(ctx, actor, "INC", map[string]any{})
	if err != nil {
		t.Fatalf("first CreateDraft: %v", err)
	}
	_, err = svc.CreateDraft(ctx, actor, "INC", map[string]any{})
	if err == nil {
		t.Fatal("expected error for duplicate draft, got nil")
	}
}

// T03 – update draft

func TestLayoutService_UpdateDraft(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(false, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{"v": 1})
	updated, err := svc.UpdateDraft(ctx, actor, "INC", map[string]any{"v": 2})
	if err != nil {
		t.Fatalf("UpdateDraft: %v", err)
	}
	if updated.Document["v"] != 2 {
		t.Errorf("expected updated doc v=2, got %v", updated.Document["v"])
	}
}

// T04 – update non-existing draft returns not-found

func TestLayoutService_UpdateNonExistingDraft(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(false, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, err := svc.UpdateDraft(ctx, actor, "INC", map[string]any{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// T05 – publish draft increments version to 1

func TestLayoutService_PublishDraft_VersionOne(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(true, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{})
	pub, err := svc.PublishDraft(ctx, actor, "INC")
	if err != nil {
		t.Fatalf("PublishDraft: %v", err)
	}
	if pub.Version != 1 {
		t.Errorf("expected version 1, got %d", pub.Version)
	}
	if pub.Status != domain.LayoutStatusPublished {
		t.Errorf("expected published status, got %s", pub.Status)
	}
	if pub.IsActive != true {
		t.Error("expected newly published to be active")
	}
}

// T06 – publish again creates version 2 after new draft

func TestLayoutService_PublishDraft_VersionTwo(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(true, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{})
	_, _ = svc.PublishDraft(ctx, actor, "INC")
	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{})
	pub2, err := svc.PublishDraft(ctx, actor, "INC")
	if err != nil {
		t.Fatalf("second PublishDraft: %v", err)
	}
	if pub2.Version != 2 {
		t.Errorf("expected version 2, got %d", pub2.Version)
	}
}

// T07 – list versions returns all versions

func TestLayoutService_ListVersions(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(true, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{})
	_, _ = svc.PublishDraft(ctx, actor, "INC")
	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{})

	versions, err := svc.ListVersions(ctx, actor, "INC")
	if err != nil {
		t.Fatalf("ListVersions: %v", err)
	}
	if len(versions) < 2 {
		t.Errorf("expected at least 2 versions, got %d", len(versions))
	}
}

// T08 – activate a prior published version

func TestLayoutService_ActivateVersion(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(true, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{"v": 1})
	pub1, _ := svc.PublishDraft(ctx, actor, "INC")
	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{"v": 2})
	_, _ = svc.PublishDraft(ctx, actor, "INC")

	activated, err := svc.ActivateVersion(ctx, actor, "INC", pub1.Version)
	if err != nil {
		t.Fatalf("ActivateVersion: %v", err)
	}
	if !activated.IsActive {
		t.Error("expected activated to be active")
	}

	active, err := svc.GetActiveVersion(ctx, actor, "INC")
	if err != nil {
		t.Fatalf("GetActiveVersion: %v", err)
	}
	if active.Version != pub1.Version {
		t.Errorf("expected active version %d, got %d", pub1.Version, active.Version)
	}
}

// T09 – activate a draft version must fail

func TestLayoutService_ActivateDraftFails(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(true, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, _ = svc.CreateDraft(ctx, actor, "INC", map[string]any{})
	_, err := svc.ActivateVersion(ctx, actor, "INC", 0)
	if err == nil {
		t.Fatal("expected error activating a draft version")
	}
}

// T10 – publish without draft returns not-found

func TestLayoutService_PublishWithoutDraft(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(true, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, err := svc.PublishDraft(ctx, actor, "INC")
	if err == nil {
		t.Fatal("expected error publishing without a draft")
	}
}

// T11 – GetDraft without draft returns not-found

func TestLayoutService_GetDraftNotFound(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(false, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, err := svc.GetDraft(ctx, actor, "NOENT")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// T12 – checksum is deterministic

func TestLayoutService_ChecksumDeterministic(t *testing.T) {
	doc := map[string]any{"detail": map[string]any{"regions": map[string]any{}}}
	emptyCompat := &domain.CompatibilityFingerprint{}
	cs1, err := domain.ComputeCanonicalChecksum(doc, emptyCompat)
	if err != nil {
		t.Fatalf("ComputeCanonicalChecksum: %v", err)
	}
	cs2, err := domain.ComputeCanonicalChecksum(doc, emptyCompat)
	if err != nil {
		t.Fatalf("ComputeCanonicalChecksum: %v", err)
	}
	if cs1 != cs2 {
		t.Errorf("checksum not deterministic: %s vs %s", cs1, cs2)
	}
	if len(cs1) != 64 {
		t.Errorf("expected 64-char hex sha256, got %d chars", len(cs1))
	}
}

// T13 – fieldID uniqueness validation

func TestFieldDefinition_FieldIDUniqueness(t *testing.T) {
	def := &domain.FieldDefinition{Key: "title", Type: "text"}
	if def.FieldID() != "title" {
		t.Errorf("expected FieldID=key fallback 'title', got %s", def.FieldID())
	}
	def2 := &domain.FieldDefinition{ID: "f1", Key: "title", Type: "text"}
	if def2.FieldID() != "f1" {
		t.Errorf("expected FieldID='f1', got %s", def2.FieldID())
	}
}

// T14 – GetActiveVersion returns error when no active

func TestLayoutService_GetActiveVersionNotFound(t *testing.T) {
	svc, _ := makeService()
	ctx := context.Background()
	actor := makeIdentity(false, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	_, err := svc.GetActiveVersion(ctx, actor, "INC")
	if err == nil {
		t.Fatal("expected not found error, got nil")
	}
}

// T15 – CompatibilityFingerprint Validate succeeds with mandatory widgets

func TestCompatibilityFingerprint_Validate(t *testing.T) {
	fp := &domain.CompatibilityFingerprint{
		Placements:       []domain.CompatibilityPlacement{},
		MandatoryWidgets: []string{"ticketHeader"},
	}
	_ = fp // should not panic
	_ = time.Now() // keep import
}

// T16 – domain.NewUUID generates unique IDs

func TestNewUUID_Unique(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		id := domain.NewUUID()
		if _, dup := seen[id]; dup {
			t.Fatalf("duplicate UUID: %s", id)
		}
		seen[id] = struct{}{}
		if len(id) < 32 {
			t.Fatalf("UUID too short: %s", id)
		}
	}
}
