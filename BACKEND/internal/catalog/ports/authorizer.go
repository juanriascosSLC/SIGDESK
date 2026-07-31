package ports

import (
	"context"
	identityDomain "sig-desk/backend/internal/identity/domain"
)

type RecordAuthorizer interface {
	AuthorizeRecordAccess(ctx context.Context, actor identityDomain.Identity, entityKey string, recordID string, recordData map[string]any) error
}
