package postgres_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"sig-desk/backend/internal/catalog/adapters/postgres"
	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/platform/testsupport/pgtest"
	"sig-desk/backend/migrations"
)

// TestLayoutRepository_ConcurrentUpdateAndPublishStayConsistent races real
// goroutines, against real Postgres, updating a draft's document while
// multiple callers simultaneously try to publish it. It exercises the fix for
// the atomicity bug where PublishDraft's compatibility/checksum used to be
// derived from an unlocked, pre-fetched document (read by the caller before
// ever entering the repository) instead of the document actually locked and
// persisted — a race could publish version N's document alongside a
// compatibility fingerprint and checksum describing a different, stale
// document. The fix makes the repository invoke the validate callback with
// the document AS LOCKED (after `SELECT ... FOR UPDATE`, inside the same
// transaction that performs the publish), so this can no longer happen.
func TestLayoutRepository_ConcurrentUpdateAndPublishStayConsistent(t *testing.T) {
	ctx := context.Background()
	pool := pgtest.NewDatabase(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	repo := postgres.NewLayoutRepository(pool)

	const entityKey = "CONC"
	if _, err := repo.CreateDraft(ctx, entityKey, map[string]any{"v": 0}); err != nil {
		t.Fatalf("create draft: %v", err)
	}

	const updaters = 10
	const publishers = 5

	start := make(chan struct{})
	var wg sync.WaitGroup

	// Many concurrent UpdateDraft calls, each writing a distinguishable
	// document, all released at once to maximize real contention on the
	// advisory lock and the draft row.
	for i := 1; i <= updaters; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, _ = repo.UpdateDraft(ctx, entityKey, map[string]any{"v": i})
		}()
	}

	type publishResult struct {
		layout      *domain.CatalogLayoutVersion
		observedDoc map[string]any
		err         error
	}
	results := make([]publishResult, publishers)
	for p := 0; p < publishers; p++ {
		p := p
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			var observed map[string]any
			layout, err := repo.PublishDraft(ctx, entityKey, func(document map[string]any) (*domain.CompatibilityFingerprint, string, error) {
				// Record exactly the document the repository handed us, then
				// derive the checksum from THAT document — mirroring what a
				// real validator does. If the fix regresses, this closure
				// could be called with one document while a different one
				// ends up persisted.
				observed = document
				checksum, err := domain.ComputeCanonicalChecksum(document, &domain.CompatibilityFingerprint{})
				if err != nil {
					return nil, "", err
				}
				return &domain.CompatibilityFingerprint{}, checksum, nil
			})
			results[p] = publishResult{layout: layout, observedDoc: observed, err: err}
		}()
	}

	close(start)
	wg.Wait()

	var succeeded []publishResult
	for _, r := range results {
		if r.err == nil {
			succeeded = append(succeeded, r)
			continue
		}
		if !errors.Is(r.err, domain.ErrDraftNotFound) {
			t.Fatalf("unexpected PublishDraft error: %v", r.err)
		}
	}
	// Only one draft ever existed, so exactly one of the concurrent
	// PublishDraft calls may succeed; the rest must see it already gone.
	if len(succeeded) != 1 {
		t.Fatalf("expected exactly 1 of %d concurrent PublishDraft calls to succeed, got %d", publishers, len(succeeded))
	}
	winner := succeeded[0]

	// The published row's checksum must reflect EXACTLY the document the
	// validate closure observed — never a document from a differently-timed
	// UpdateDraft call that raced it.
	wantChecksum, err := domain.ComputeCanonicalChecksum(winner.observedDoc, &domain.CompatibilityFingerprint{})
	if err != nil {
		t.Fatalf("recompute checksum: %v", err)
	}
	if winner.layout.Checksum != wantChecksum {
		t.Fatalf("published checksum %q does not match a checksum recomputed from the document the validator actually observed", winner.layout.Checksum)
	}

	// A fresh, independent read of the published row must show the SAME
	// document the validator observed — proving nothing rewrote `document`
	// out from under the already-published, already-checksummed row.
	reread, err := repo.GetVersion(ctx, entityKey, winner.layout.Version)
	if err != nil {
		t.Fatalf("GetVersion: %v", err)
	}
	rereadChecksum, err := domain.ComputeCanonicalChecksum(reread.Document, &domain.CompatibilityFingerprint{})
	if err != nil {
		t.Fatalf("recompute checksum from reread: %v", err)
	}
	if rereadChecksum != winner.layout.Checksum {
		t.Fatalf("re-read document does not match the published checksum: document was mutated after publication")
	}
}
