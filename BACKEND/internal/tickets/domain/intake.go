package domain

import "errors"

// Errors returned while resolving a ticket from a catalog intake
// submission. They are declared here (not borrowed from the catalog
// module) so the tickets HTTP layer never needs to know about catalog's
// own error types to map a response status.
var (
	ErrCatalogDefinitionNotFound = errors.New("catalog definition not found or not published")
	ErrCatalogValidation         = errors.New("catalog intake data is invalid")
	ErrIdempotencyConflict       = errors.New("idempotency key was already used with different ticket data")
	ErrInvalidIdempotencyKey     = errors.New("idempotency key is invalid")

	// ErrHumanIDConflict signals that a projected ticket's human_id is
	// already used by a ticket that did not originate from this same
	// catalog entity (a different entity, or a manually-created ticket).
	// Tickets refuses to silently overwrite that row.
	ErrHumanIDConflict = errors.New("human id is already used by a different ticket")
)
