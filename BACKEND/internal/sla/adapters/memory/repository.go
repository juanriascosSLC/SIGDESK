package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"sig-desk/backend/internal/sla/domain"
)

type Repository struct {
	mutex       sync.RWMutex
	policies    []domain.Policy
	assessments map[string]domain.Assessment
	events      map[string]bool
}

func NewRepository(policies ...domain.Policy) *Repository {
	repository := &Repository{
		assessments: make(map[string]domain.Assessment),
		events:      make(map[string]bool),
	}
	for _, policy := range policies {
		repository.policies = append(repository.policies, clonePolicy(policy))
	}
	return repository
}

func (repository *Repository) ListPolicies(context.Context) ([]domain.Policy, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	result := append([]domain.Policy(nil), repository.policies...)
	sort.Slice(result, func(left, right int) bool {
		if result[left].ResourceID == result[right].ResourceID {
			return result[left].Version > result[right].Version
		}
		return result[left].ResourceID < result[right].ResourceID
	})
	return result, nil
}

func (repository *Repository) GetPolicy(
	_ context.Context,
	resourceID string,
	version int,
) (domain.Policy, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	for _, policy := range repository.policies {
		if policy.ResourceID == resourceID && policy.Version == version {
			return clonePolicy(policy), nil
		}
	}
	return domain.Policy{}, domain.ErrPolicyNotFound
}

func (repository *Repository) GetPublishedPolicy(
	_ context.Context,
	resourceID string,
) (domain.Policy, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	for _, policy := range repository.policies {
		if policy.ResourceID == resourceID && policy.Status == domain.StatusPublished {
			return clonePolicy(policy), nil
		}
	}
	return domain.Policy{}, domain.ErrPolicyNotFound
}

func (repository *Repository) CreateDraft(
	_ context.Context,
	policy domain.Policy,
) (domain.Policy, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	maxVersion := 0
	for _, current := range repository.policies {
		if current.ResourceID == policy.ResourceID && current.Version > maxVersion {
			maxVersion = current.Version
		}
	}
	policy.ID = fmt.Sprintf("sla-policy-%d", len(repository.policies)+1)
	policy.Version = maxVersion + 1
	policy.Status = domain.StatusDraft
	policy.CreatedAt = time.Now().UTC()
	repository.policies = append(repository.policies, clonePolicy(policy))
	return clonePolicy(policy), nil
}

func (repository *Repository) UpdateDraft(
	_ context.Context,
	policy domain.Policy,
) (domain.Policy, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	for index := range repository.policies {
		current := repository.policies[index]
		if current.ResourceID != policy.ResourceID || current.Version != policy.Version ||
			current.Status != domain.StatusDraft {
			continue
		}
		policy.ID = current.ID
		policy.Status = current.Status
		policy.CreatedAt = current.CreatedAt
		policy.PublishedAt = nil
		repository.policies[index] = clonePolicy(policy)
		return clonePolicy(policy), nil
	}
	return domain.Policy{}, domain.ErrPolicyNotFound
}

func (repository *Repository) Publish(
	_ context.Context,
	resourceID string,
	version int,
) (domain.Policy, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	index := -1
	for position := range repository.policies {
		policy := &repository.policies[position]
		if policy.ResourceID == resourceID && policy.Version == version &&
			policy.Status == domain.StatusDraft {
			index = position
		}
	}
	if index < 0 {
		return domain.Policy{}, domain.ErrPolicyNotFound
	}
	for position := range repository.policies {
		if repository.policies[position].ResourceID == resourceID &&
			repository.policies[position].Status == domain.StatusPublished {
			repository.policies[position].Status = domain.StatusDeprecated
		}
	}
	now := time.Now().UTC()
	repository.policies[index].Status = domain.StatusPublished
	repository.policies[index].PublishedAt = &now
	return clonePolicy(repository.policies[index]), nil
}

func (repository *Repository) ListAssessments(context.Context) ([]domain.Assessment, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	result := make([]domain.Assessment, 0, len(repository.assessments))
	for _, assessment := range repository.assessments {
		result = append(result, assessment)
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left].StartedAt.After(result[right].StartedAt)
	})
	return result, nil
}

func (repository *Repository) GetAssessment(
	_ context.Context,
	entityID string,
) (domain.Assessment, error) {
	repository.mutex.RLock()
	defer repository.mutex.RUnlock()
	assessment, exists := repository.assessments[entityID]
	if !exists {
		return domain.Assessment{}, domain.ErrPolicyNotFound
	}
	return assessment, nil
}

func (repository *Repository) SaveAssessment(
	_ context.Context,
	eventID string,
	assessment domain.Assessment,
) (bool, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	if repository.events[eventID] {
		return false, nil
	}
	repository.assessments[assessment.EntityID] = assessment
	repository.events[eventID] = true
	return true, nil
}

func clonePolicy(policy domain.Policy) domain.Policy {
	encoded, _ := json.Marshal(policy)
	var cloned domain.Policy
	_ = json.Unmarshal(encoded, &cloned)
	return cloned
}
