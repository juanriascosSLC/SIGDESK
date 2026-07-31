package application

import (
	"context"
	"errors"

	identityDomain "sig-desk/backend/internal/identity/domain"
)

var (
	ErrRecordNotFound   = errors.New("record not found")
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
