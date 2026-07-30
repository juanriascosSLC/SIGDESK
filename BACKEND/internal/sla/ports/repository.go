package ports

import (
	"context"

	"sig-desk/backend/internal/sla/domain"
)

type Repository interface {
	ListPolicies(context.Context) ([]domain.Policy, error)
	GetPolicy(context.Context, string, int) (domain.Policy, error)
	GetPublishedPolicy(context.Context, string) (domain.Policy, error)
	CreateDraft(context.Context, domain.Policy) (domain.Policy, error)
	UpdateDraft(context.Context, domain.Policy) (domain.Policy, error)
	Publish(context.Context, string, int) (domain.Policy, error)
	ListAssessments(context.Context) ([]domain.Assessment, error)
	GetAssessment(context.Context, string) (domain.Assessment, error)
	SaveAssessment(context.Context, string, domain.Assessment) (bool, error)
}
