package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	catalogDomain "sig-desk/backend/internal/catalog/domain"
	catalogPorts "sig-desk/backend/internal/catalog/ports"
	slaMemory "sig-desk/backend/internal/sla/adapters/memory"
	"sig-desk/backend/internal/sla/domain"
	"sig-desk/backend/internal/sla/ports"
)

var ErrPolicyNotFound = domain.ErrPolicyNotFound

type Preview struct {
	PolicyID        string    `json:"policyId"`
	PolicyVersion   int       `json:"policyVersion"`
	Priority        string    `json:"priority"`
	StartedAt       time.Time `json:"startedAt"`
	ResponseDueAt   time.Time `json:"responseDueAt"`
	ResolutionDueAt time.Time `json:"resolutionDueAt"`
}

type Service struct {
	repository ports.Repository
}

func NewService(repositories ...ports.Repository) *Service {
	var repository ports.Repository
	if len(repositories) > 0 && repositories[0] != nil {
		repository = repositories[0]
	} else {
		repository = slaMemory.NewRepository(DefaultPolicy())
	}
	return &Service{repository: repository}
}

func DefaultPolicy() domain.Policy {
	now := time.Now().UTC()
	return domain.Policy{
		ID:              "sla-policy-incident-standard-v1",
		ResourceID:      "sla:policy:incident-standard",
		Name:            "Atención estándar de incidentes",
		Version:         1,
		ContractVersion: "1",
		Status:          domain.StatusPublished,
		Calendar: domain.Calendar{
			Timezone: "America/Bogota",
			AlwaysOn: true,
		},
		Targets: []domain.Target{
			{Priority: "critical", ResponseMinutes: 15, ResolutionMinutes: 240},
			{Priority: "high", ResponseMinutes: 30, ResolutionMinutes: 480},
			{Priority: "medium", ResponseMinutes: 120, ResolutionMinutes: 960},
			{Priority: "low", ResponseMinutes: 480, ResolutionMinutes: 2400},
		},
		PauseStates:      []string{"on_hold", "pending_review", "waiting_customer"},
		ResponseStates:   []string{"in_progress", "resolved"},
		ResolutionStates: []string{"resolved"},
		Escalations: []domain.Escalation{
			{ThresholdPercent: 75, Channel: "notifications", Recipient: "assigned-team"},
			{ThresholdPercent: 100, Channel: "notifications", Recipient: "service-owner"},
		},
		CreatedAt:   now,
		PublishedAt: &now,
	}
}

func (service *Service) ListPolicies(ctx context.Context) ([]domain.Policy, error) {
	return service.repository.ListPolicies(ctx)
}

func (service *Service) CreateDraft(ctx context.Context, policy domain.Policy) (domain.Policy, error) {
	policy.ResourceID = strings.ToLower(strings.TrimSpace(policy.ResourceID))
	policy.Name = strings.TrimSpace(policy.Name)
	if policy.ContractVersion == "" {
		policy.ContractVersion = "1"
	}
	if err := policy.Validate(); err != nil {
		return domain.Policy{}, err
	}
	return service.repository.CreateDraft(ctx, policy)
}

func (service *Service) UpdateDraft(ctx context.Context, policy domain.Policy) (domain.Policy, error) {
	policy.ResourceID = strings.ToLower(strings.TrimSpace(policy.ResourceID))
	policy.Name = strings.TrimSpace(policy.Name)
	if policy.Status != domain.StatusDraft {
		return domain.Policy{}, fmt.Errorf("%w: only draft policies can be edited", domain.ErrInvalidPolicy)
	}
	if err := policy.Validate(); err != nil {
		return domain.Policy{}, err
	}
	return service.repository.UpdateDraft(ctx, policy)
}

func (service *Service) Publish(
	ctx context.Context,
	resourceID string,
	version int,
) (domain.Policy, error) {
	policy, err := service.repository.GetPolicy(ctx, resourceID, version)
	if err != nil {
		return domain.Policy{}, err
	}
	if policy.Status != domain.StatusDraft {
		return domain.Policy{}, fmt.Errorf("%w: only draft policies can be published", domain.ErrInvalidPolicy)
	}
	if err := policy.Validate(); err != nil {
		return domain.Policy{}, err
	}
	return service.repository.Publish(ctx, resourceID, version)
}

func (service *Service) Preview(
	ctx context.Context,
	resourceID string,
	version int,
	priority string,
	startedAt time.Time,
) (Preview, error) {
	policy, err := service.policy(ctx, resourceID, version)
	if err != nil {
		return Preview{}, err
	}
	target, exists := policy.Target(priority)
	if !exists {
		return Preview{}, fmt.Errorf("%w: policy has no target for priority %q", domain.ErrInvalidPolicy, priority)
	}
	if startedAt.IsZero() {
		startedAt = time.Now().UTC()
	}
	responseDueAt, err := policy.Calendar.Add(startedAt, target.ResponseMinutes)
	if err != nil {
		return Preview{}, err
	}
	resolutionDueAt, err := policy.Calendar.Add(startedAt, target.ResolutionMinutes)
	if err != nil {
		return Preview{}, err
	}
	return Preview{
		PolicyID:        policy.ResourceID,
		PolicyVersion:   policy.Version,
		Priority:        strings.ToLower(priority),
		StartedAt:       startedAt.UTC(),
		ResponseDueAt:   responseDueAt,
		ResolutionDueAt: resolutionDueAt,
	}, nil
}

func (service *Service) ListAssessments(ctx context.Context) ([]domain.Assessment, error) {
	assessments, err := service.repository.ListAssessments(ctx)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	for index := range assessments {
		assessments[index] = assessments[index].At(now)
	}
	return assessments, nil
}

func (service *Service) GetAssessment(
	ctx context.Context,
	entityID string,
) (domain.Assessment, error) {
	assessment, err := service.repository.GetAssessment(ctx, entityID)
	if err != nil {
		return domain.Assessment{}, err
	}
	return assessment.At(time.Now().UTC()), nil
}

func (service *Service) Resources(ctx context.Context) ([]catalogDomain.ResourceReference, error) {
	policies, err := service.repository.ListPolicies(ctx)
	if err != nil {
		return nil, err
	}
	resources := make([]catalogDomain.ResourceReference, 0)
	for _, policy := range policies {
		if policy.Status == domain.StatusPublished {
			resources = append(resources, reference(policy))
		}
	}
	return resources, nil
}

func (service *Service) AvailableResources(
	ctx context.Context,
) ([]catalogDomain.AvailableResource, error) {
	policies, err := service.repository.ListPolicies(ctx)
	if err != nil {
		return nil, err
	}
	resources := make([]catalogDomain.AvailableResource, 0)
	for _, policy := range policies {
		if policy.Status != domain.StatusPublished {
			continue
		}
		resources = append(resources, catalogDomain.AvailableResource{
			Reference:   reference(policy),
			DisplayName: policy.Name,
			Description: "Objetivos de respuesta y resolución administrados por SLA.",
		})
	}
	return resources, nil
}

func (service *Service) ResolveResource(
	ctx context.Context,
	requested catalogDomain.ResourceReference,
) (catalogDomain.ResourceReference, error) {
	if requested.Module != "sla" || requested.ResourceType != "policy" {
		return catalogDomain.ResourceReference{}, fmt.Errorf(
			"sla does not expose %s %q",
			requested.ResourceType,
			requested.ResourceID,
		)
	}
	version := 0
	if requested.ResourceVersion != "" {
		parsed, err := strconv.Atoi(requested.ResourceVersion)
		if err != nil {
			return catalogDomain.ResourceReference{}, fmt.Errorf("invalid SLA resource version")
		}
		version = parsed
	}
	policy, err := service.policy(ctx, requested.ResourceID, version)
	if err != nil {
		return catalogDomain.ResourceReference{}, err
	}
	resolved := reference(policy)
	if requested.ContractVersion != "" && requested.ContractVersion != resolved.ContractVersion {
		return catalogDomain.ResourceReference{}, fmt.Errorf(
			"resource %s requested contract %s, available contract is %s",
			requested.ResourceID,
			requested.ContractVersion,
			resolved.ContractVersion,
		)
	}
	resolved.Required = requested.Required
	return resolved, nil
}

func (service *Service) HandleCommand(
	ctx context.Context,
	command catalogPorts.CapabilityCommand,
) error {
	resolved, err := service.ResolveResource(ctx, command.Resource)
	if err != nil {
		return fmt.Errorf("%w: %v", catalogPorts.ErrCapabilityDenied, err)
	}
	if command.Operation != "entity.create" && command.Operation != "entity.update" {
		return nil
	}
	version, _ := strconv.Atoi(resolved.ResourceVersion)
	policy, err := service.repository.GetPolicy(ctx, resolved.ResourceID, version)
	if err != nil {
		return err
	}
	priority, _ := command.Entity.Data["priority"].(string)
	if _, exists := policy.Target(priority); !exists {
		return fmt.Errorf(
			"%w: SLA policy %s has no target for priority %q",
			catalogPorts.ErrCapabilityDenied,
			policy.ResourceID,
			priority,
		)
	}
	return nil
}

func (service *Service) HandleEvent(
	ctx context.Context,
	event catalogDomain.EventEnvelope,
) error {
	switch event.EventType {
	case catalogDomain.EventEntityCreatedV1:
		return service.applyCreated(ctx, event)
	case catalogDomain.EventEntityUpdatedV1:
		return service.applyUpdated(ctx, event)
	case catalogDomain.EventEntityTransitionedV1:
		return service.applyTransitioned(ctx, event)
	default:
		return nil
	}
}

func (service *Service) applyUpdated(
	ctx context.Context,
	event catalogDomain.EventEnvelope,
) error {
	var payload catalogDomain.EntityUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("decode entity updated for SLA: %w", err)
	}
	priorityChanged := false
	for _, field := range payload.ChangedFields {
		if field == "priority" {
			priorityChanged = true
			break
		}
	}
	if !priorityChanged {
		return nil
	}
	assessment, err := service.repository.GetAssessment(ctx, payload.EntityID)
	if errors.Is(err, domain.ErrPolicyNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	policy, err := service.repository.GetPolicy(
		ctx,
		assessment.PolicyID,
		assessment.PolicyVersion,
	)
	if err != nil {
		return err
	}
	priority, _ := payload.Data["priority"].(string)
	target, exists := policy.Target(priority)
	if !exists {
		return fmt.Errorf(
			"%w: SLA policy %s has no target for priority %q",
			catalogPorts.ErrCapabilityDenied,
			policy.ResourceID,
			priority,
		)
	}
	oldResponseBaseline, err := policy.Calendar.Add(
		assessment.StartedAt,
		assessment.ResponseTargetMinutes,
	)
	if err != nil {
		return err
	}
	oldResolutionBaseline, err := policy.Calendar.Add(
		assessment.StartedAt,
		assessment.ResolutionTargetMinutes,
	)
	if err != nil {
		return err
	}
	newResponseBaseline, err := policy.Calendar.Add(
		assessment.StartedAt,
		target.ResponseMinutes,
	)
	if err != nil {
		return err
	}
	newResolutionBaseline, err := policy.Calendar.Add(
		assessment.StartedAt,
		target.ResolutionMinutes,
	)
	if err != nil {
		return err
	}
	assessment.ResponseDueAt = newResponseBaseline.Add(
		assessment.ResponseDueAt.Sub(oldResponseBaseline),
	)
	assessment.ResolutionDueAt = newResolutionBaseline.Add(
		assessment.ResolutionDueAt.Sub(oldResolutionBaseline),
	)
	assessment.Priority = strings.ToLower(priority)
	assessment.ResponseTargetMinutes = target.ResponseMinutes
	assessment.ResolutionTargetMinutes = target.ResolutionMinutes
	assessment.LastEventID = event.EventID
	assessment.UpdatedAt = event.OccurredAt.UTC()
	_, err = service.repository.SaveAssessment(ctx, event.EventID, assessment)
	return err
}

func (service *Service) applyCreated(
	ctx context.Context,
	event catalogDomain.EventEnvelope,
) error {
	var payload catalogDomain.EntityCreatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("decode entity created for SLA: %w", err)
	}
	// SLA is not a global fallback for every Catalog entity. Legacy INC
	// definitions may omit an explicit resource and still use the incident
	// default; RFC/PRB and future domains are ignored unless their own module
	// intentionally introduces an SLA contract.
	if payload.EntityKey != "INC" {
		return nil
	}
	policy, err := service.policyForEvent(ctx, payload.Resources)
	if errors.Is(err, domain.ErrPolicyNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	priority, _ := payload.Data["priority"].(string)
	preview, err := service.Preview(ctx, policy.ResourceID, policy.Version, priority, event.OccurredAt)
	if err != nil {
		return err
	}
	target, _ := policy.Target(priority)
	occurredAt := event.OccurredAt.UTC()
	_, err = service.repository.SaveAssessment(ctx, event.EventID, domain.Assessment{
		EntityID:                payload.EntityID,
		HumanID:                 payload.HumanID,
		DefinitionVersionID:     payload.DefinitionVersionID,
		DefinitionVersion:       payload.DefinitionVersion,
		ManifestChecksum:        payload.ManifestChecksum,
		PolicyID:                policy.ResourceID,
		PolicyVersion:           policy.Version,
		PolicyContractVersion:   policy.ContractVersion,
		Priority:                strings.ToLower(priority),
		CurrentState:            payload.State,
		ResponseTargetMinutes:   target.ResponseMinutes,
		ResolutionTargetMinutes: target.ResolutionMinutes,
		StartedAt:               preview.StartedAt,
		ResponseDueAt:           preview.ResponseDueAt,
		ResolutionDueAt:         preview.ResolutionDueAt,
		LastEventID:             event.EventID,
		UpdatedAt:               occurredAt,
	})
	return err
}

func (service *Service) applyTransitioned(
	ctx context.Context,
	event catalogDomain.EventEnvelope,
) error {
	var payload catalogDomain.EntityTransitionedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("decode entity transitioned for SLA: %w", err)
	}
	assessment, err := service.repository.GetAssessment(ctx, payload.EntityID)
	if errors.Is(err, domain.ErrPolicyNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	policy, err := service.repository.GetPolicy(ctx, assessment.PolicyID, assessment.PolicyVersion)
	if err != nil {
		return err
	}
	now := event.OccurredAt.UTC()
	if policy.PausesOn(payload.CurrentState) && assessment.PausedAt == nil {
		assessment.PausedAt = &now
	}
	if assessment.PausedAt != nil && !policy.PausesOn(payload.CurrentState) {
		pauseDuration := now.Sub(*assessment.PausedAt)
		assessment.ResponseDueAt = assessment.ResponseDueAt.Add(pauseDuration)
		assessment.ResolutionDueAt = assessment.ResolutionDueAt.Add(pauseDuration)
		assessment.PausedAt = nil
	}
	if assessment.RespondedAt == nil &&
		policy.StopsResponseOn(payload.CurrentState) {
		assessment.RespondedAt = &now
		assessment.ResponseBreached = now.After(assessment.ResponseDueAt)
	}
	if assessment.ResolvedAt == nil && policy.StopsResolutionOn(payload.CurrentState) {
		assessment.ResolvedAt = &now
		assessment.ResolutionBreached = now.After(assessment.ResolutionDueAt)
	}
	assessment.CurrentState = payload.CurrentState
	assessment.LastEventID = event.EventID
	assessment.UpdatedAt = now
	_, err = service.repository.SaveAssessment(ctx, event.EventID, assessment)
	return err
}

func (service *Service) policy(
	ctx context.Context,
	resourceID string,
	version int,
) (domain.Policy, error) {
	if version > 0 {
		return service.repository.GetPolicy(ctx, resourceID, version)
	}
	return service.repository.GetPublishedPolicy(ctx, resourceID)
}

func (service *Service) policyForEvent(
	ctx context.Context,
	resources []catalogDomain.ResourceReference,
) (domain.Policy, error) {
	for _, resource := range resources {
		if resource.Module != "sla" || resource.ResourceType != "policy" {
			continue
		}
		version, err := strconv.Atoi(resource.ResourceVersion)
		if err != nil {
			return domain.Policy{}, err
		}
		return service.repository.GetPolicy(ctx, resource.ResourceID, version)
	}
	// Read compatibility for events emitted before resources were included.
	policies, err := service.repository.ListPolicies(ctx)
	if err != nil {
		return domain.Policy{}, err
	}
	for _, policy := range policies {
		if policy.Status == domain.StatusPublished {
			return policy, nil
		}
	}
	return domain.Policy{}, domain.ErrPolicyNotFound
}

func reference(policy domain.Policy) catalogDomain.ResourceReference {
	return catalogDomain.ResourceReference{
		Module:          "sla",
		ResourceType:    "policy",
		ResourceID:      policy.ResourceID,
		ResourceVersion: strconv.Itoa(policy.Version),
		ContractVersion: policy.ContractVersion,
	}
}
