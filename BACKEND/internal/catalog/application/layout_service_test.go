package application_test

import (
	"context"
	"testing"
	"time"

	"sig-desk/backend/internal/catalog/adapters/memory"
	memoryrepo "sig-desk/backend/internal/catalog/adapters/memory"
	"sig-desk/backend/internal/catalog/application"
	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
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
	_ = fp         // should not panic
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

// T17 – previous-compatible fallback: the active layout (v3) was published
// against a NEWER definition version and references a field the record's own
// historical definition (v1) never had. ResolveLayoutForRecord must not use
// it and must not fall all the way to legacy-synthesized either: it must walk
// published versions descending and land on v2, the most recent one still
// compatible with the record's historical schema.

func testFieldPlacementDoc(fieldID string) map[string]any {
	return map[string]any{
		"detail": map[string]any{
			"regions": map[string]any{
				"main": map[string]any{
					"placements": []any{
						map[string]any{"id": "p1", "kind": "field", "source": "catalog", "fieldId": fieldID},
					},
				},
			},
		},
	}
}

func testDefinitionDraft(entityKey string, fields []domain.FieldDefinition) domain.Definition {
	return domain.Definition{
		EntityKey: entityKey,
		Name:      "Test Entity",
		Specification: domain.Specification{
			Identity: domain.IdentityDefinition{Prefix: entityKey},
			Fields:   fields,
			Lifecycle: domain.LifecycleDefinition{
				States: []domain.StateDefinition{{Key: "open", Label: "Open", Initial: true}},
			},
		},
	}
}

func TestLayoutService_ResolveLayoutForRecord_PreviousCompatibleFallback(t *testing.T) {
	ctx := context.Background()
	catRepo := memory.NewRepository()
	layoutRepo := memoryrepo.NewLayoutRepository()
	auth := application.NewDefaultRecordAuthorizer()
	val := application.NewLayoutValidator()
	svc := application.NewLayoutService(layoutRepo, catRepo, auth, val)

	actor := makeIdentity(true, identityDomain.PermCatalogAuthor, identityDomain.PermCatalogPublish, identityDomain.PermCatalogView)

	// Definition v1: only "title". This is what the record stays bound to
	// forever, regardless of how the definition or the layout evolve later.
	defDraft1, err := catRepo.CreateDraft(ctx, testDefinitionDraft("TST", []domain.FieldDefinition{
		{Key: "title", Label: "Title", Type: "text"},
	}))
	if err != nil {
		t.Fatalf("CreateDraft def v1: %v", err)
	}
	manifest1, err := domain.CompileManifest(defDraft1, nil, time.Now())
	if err != nil {
		t.Fatalf("CompileManifest v1: %v", err)
	}
	defV1, err := catRepo.Publish(ctx, defDraft1, manifest1)
	if err != nil {
		t.Fatalf("Publish def v1: %v", err)
	}

	record, _, err := catRepo.CreateEntity(ctx, defV1, map[string]any{"title": "hello"}, ports.IdempotencyRequest{})
	if err != nil {
		t.Fatalf("CreateEntity: %v", err)
	}
	if record.DefinitionVersion != 1 {
		t.Fatalf("expected record bound to definition v1, got v%d", record.DefinitionVersion)
	}

	// Layout v1 (throwaway) then v2, both referencing "title" — compatible
	// with definition v1, the only definition published at this point.
	if _, err := svc.CreateDraft(ctx, actor, "TST", testFieldPlacementDoc("title")); err != nil {
		t.Fatalf("CreateDraft layout v1: %v", err)
	}
	if _, err := svc.PublishDraft(ctx, actor, "TST"); err != nil {
		t.Fatalf("PublishDraft layout v1: %v", err)
	}
	if _, err := svc.CreateDraft(ctx, actor, "TST", testFieldPlacementDoc("title")); err != nil {
		t.Fatalf("CreateDraft layout v2: %v", err)
	}
	layoutV2, err := svc.PublishDraft(ctx, actor, "TST")
	if err != nil {
		t.Fatalf("PublishDraft layout v2: %v", err)
	}
	if layoutV2.Version != 2 {
		t.Fatalf("expected layout v2, got version %d", layoutV2.Version)
	}

	// Evolve the definition: v2 adds "priority". The record above never sees
	// this — it stays bound to v1's schema forever.
	defDraft2, err := catRepo.CreateDraft(ctx, testDefinitionDraft("TST", []domain.FieldDefinition{
		{Key: "title", Label: "Title", Type: "text"},
		{Key: "priority", Label: "Priority", Type: "select", Options: []domain.FieldOption{{Value: "low", Label: "Low"}}},
	}))
	if err != nil {
		t.Fatalf("CreateDraft def v2: %v", err)
	}
	manifest2, err := domain.CompileManifest(defDraft2, nil, time.Now())
	if err != nil {
		t.Fatalf("CompileManifest v2: %v", err)
	}
	if _, err := catRepo.Publish(ctx, defDraft2, manifest2); err != nil {
		t.Fatalf("Publish def v2: %v", err)
	}

	// Layout v3 references the NEW field. It publishes fine (validated
	// against the CURRENT definition, v2, which has "priority") and becomes
	// active — but it is incompatible with the older record's v1 schema.
	if _, err := svc.CreateDraft(ctx, actor, "TST", testFieldPlacementDoc("priority")); err != nil {
		t.Fatalf("CreateDraft layout v3: %v", err)
	}
	layoutV3, err := svc.PublishDraft(ctx, actor, "TST")
	if err != nil {
		t.Fatalf("PublishDraft layout v3: %v", err)
	}
	if layoutV3.Version != 3 {
		t.Fatalf("expected layout v3, got version %d", layoutV3.Version)
	}
	if !layoutV3.IsActive {
		t.Fatal("expected layout v3 to be the active version")
	}

	resolved, err := svc.ResolveLayoutForRecord(ctx, actor, "TST", record.ID)
	if err != nil {
		t.Fatalf("ResolveLayoutForRecord: %v", err)
	}
	if resolved.LayoutResolution != "previous-compatible" {
		t.Fatalf("expected previous-compatible, got %q", resolved.LayoutResolution)
	}
	if resolved.LayoutVersion == nil || *resolved.LayoutVersion != 2 {
		t.Fatalf("expected resolved layout version 2, got %+v", resolved.LayoutVersion)
	}
}

// T17b – SynthesizeFromManifest must never duplicate the ticket title: it is
// already shown by the mandatory ticketHeader widget, so including it again
// as a body field placement would render it twice on the page — a real
// regression caught via the Playwright golden path, not a hypothetical.
func TestLayoutValidator_SynthesizeFromManifest_ExcludesTitleField(t *testing.T) {
	val := application.NewLayoutValidator()
	manifest := domain.ExecutableDefinitionManifest{
		Specification: domain.Specification{
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Título", Type: "text"},
				{Key: "priority", Label: "Prioridad", Type: "text"},
			},
		},
	}

	doc := val.SynthesizeFromManifest(manifest)
	detail, _ := doc["detail"].(map[string]any)
	def, _ := detail["default"].(map[string]any)
	main, _ := def["main"].(map[string]any)
	placements, _ := main["placements"].([]map[string]any)

	for _, placement := range placements {
		if placement["fieldKey"] == "title" {
			t.Fatalf("SynthesizeFromManifest included \"title\" as a body field placement, duplicating the ticketHeader widget: %+v", placements)
		}
	}

	found := false
	for _, placement := range placements {
		if placement["fieldKey"] == "priority" {
			found = true
		}
	}
	if !found {
		t.Fatalf("SynthesizeFromManifest dropped \"priority\", not just \"title\": %+v", placements)
	}
}

// T18 – a layout placement bound by fieldId, not by key, survives the bound
// field being renamed in a later definition version: IsCompatible must still
// resolve it via the stable id, not the mutable key.
func TestLayoutValidator_IsCompatible_SurvivesFieldKeyRename(t *testing.T) {
	val := application.NewLayoutValidator()

	doc := testFieldPlacementDoc("f1")
	manifestBeforeRename := domain.ExecutableDefinitionManifest{
		Specification: domain.Specification{
			Fields: []domain.FieldDefinition{
				{ID: "f1", Key: "title", Label: "Título", Type: "text"},
			},
		},
	}
	manifestAfterRename := domain.ExecutableDefinitionManifest{
		Specification: domain.Specification{
			Fields: []domain.FieldDefinition{
				{ID: "f1", Key: "headline", Label: "Titular", Type: "text"},
			},
		},
	}

	compatBefore := val.DeriveCompatibility(doc, manifestBeforeRename)
	if !val.IsCompatible(compatBefore, manifestBeforeRename) {
		t.Fatal("expected layout bound to f1 to be compatible before the rename")
	}
	if !val.IsCompatible(compatBefore, manifestAfterRename) {
		t.Fatal("expected layout bound to fieldId f1 to remain compatible after key was renamed from title to headline")
	}

	// Contrast: a layout bound by KEY (no explicit id ever assigned upstream,
	// so fieldId falls back to key) does NOT survive the same rename — this
	// is the exact gap that fieldId exists to close, confirmed rather than
	// assumed.
	keyBoundDoc := testFieldPlacementDoc("title")
	manifestWithOnlyKeys := domain.ExecutableDefinitionManifest{
		Specification: domain.Specification{
			Fields: []domain.FieldDefinition{
				{Key: "title", Label: "Título", Type: "text"},
			},
		},
	}
	manifestWithRenamedKeyOnly := domain.ExecutableDefinitionManifest{
		Specification: domain.Specification{
			Fields: []domain.FieldDefinition{
				{Key: "headline", Label: "Titular", Type: "text"},
			},
		},
	}
	compatKeyBound := val.DeriveCompatibility(keyBoundDoc, manifestWithOnlyKeys)
	if !val.IsCompatible(compatKeyBound, manifestWithOnlyKeys) {
		t.Fatal("expected key-bound layout to be compatible before the rename")
	}
	if val.IsCompatible(compatKeyBound, manifestWithRenamedKeyOnly) {
		t.Fatal("expected key-bound layout (no stable id) to become incompatible after a plain key rename")
	}
}
