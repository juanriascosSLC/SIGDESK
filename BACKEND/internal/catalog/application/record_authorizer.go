package application

import (
	"context"
	"errors"

	identityDomain "sig-desk/backend/internal/identity/domain"
	identityPorts "sig-desk/backend/internal/identity/ports"
)

var (
	ErrRecordNotFound    = errors.New("record not found")
	ErrEntityKeyMismatch = errors.New("entity key mismatch")
)

type DefaultRecordAuthorizer struct{}

func NewDefaultRecordAuthorizer() *DefaultRecordAuthorizer {
	return &DefaultRecordAuthorizer{}
}

func (a *DefaultRecordAuthorizer) AuthorizeRecordAccess(
	ctx context.Context,
	actor identityDomain.Identity,
	entityKey string,
	recordID string,
	recordData map[string]any,
) error {
	// Same exception every HTTP guard() already grants: with no auth
	// authority configured (local development, and this repository's own
	// Playwright suite), requests never carry an Identity at all — see
	// identityPorts.Resolution's own doc comment: "nothing pretends an
	// Identity exists". Without this, this seam alone would 401 every record
	// read in that mode, unlike every other catalog and ticket endpoint.
	if identityPorts.ResolutionFromContext(ctx).AuthDisabled {
		return nil
	}

	if actor.Username == "" && !actor.IsAdmin() {
		return identityDomain.ErrNoCredential
	}

	requiredPerm := identityDomain.PermTicketsView
	switch entityKey {
	case "INC":
		requiredPerm = identityDomain.PermTicketsView
	case "PRB":
		requiredPerm = identityDomain.PermProblemsView
	case "RFC":
		requiredPerm = identityDomain.PermChangesView
	default:
		requiredPerm = identityDomain.PermTicketsView
	}

	if !actor.Can(requiredPerm) {
		return identityDomain.ErrForbidden
	}

	return nil
}
