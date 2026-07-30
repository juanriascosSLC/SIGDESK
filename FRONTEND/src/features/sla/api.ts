import { apiRequest } from '@/lib/apiClient';

export type SlaPolicyStatus = 'draft' | 'published' | 'deprecated';

export interface SlaTarget {
  priority: string;
  responseMinutes: number;
  resolutionMinutes: number;
}

export interface BusinessWindow {
  weekday: number;
  start: string;
  end: string;
}

export interface SlaPolicy {
  id?: string;
  resourceId: string;
  name: string;
  version?: number;
  contractVersion: string;
  status?: SlaPolicyStatus;
  calendar: {
    timezone: string;
    alwaysOn: boolean;
    windows?: BusinessWindow[];
  };
  targets: SlaTarget[];
  pauseStates?: string[];
  responseStates?: string[];
  resolutionStates?: string[];
  escalations?: Array<{
    thresholdPercent: number;
    channel: string;
    recipient: string;
  }>;
  createdAt?: string;
  publishedAt?: string;
}

export interface SlaAssessment {
  entityId: string;
  humanId: string;
  definitionVersionId?: string;
  definitionVersion?: number;
  manifestChecksum?: string;
  policyId: string;
  policyVersion: number;
  policyContractVersion?: string;
  priority: string;
  currentState?: string;
  responseTargetMinutes?: number;
  resolutionTargetMinutes?: number;
  startedAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  pausedAt?: string;
  responseBreached: boolean;
  resolutionBreached: boolean;
  lastEventId: string;
  updatedAt?: string;
}

export interface SlaPreview {
  policyId: string;
  policyVersion: number;
  priority: string;
  startedAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
}

export async function listSlaPolicies() {
  const response = await apiRequest<{ items: SlaPolicy[] }>('/sla/policies');
  return response.items;
}

export function createSlaPolicyDraft(policy: SlaPolicy) {
  return apiRequest<SlaPolicy>('/sla/policies', {
    method: 'POST',
    body: JSON.stringify(policy),
  });
}

export function updateSlaPolicyDraft(policy: SlaPolicy) {
  return apiRequest<SlaPolicy>(
    `/sla/policies/${encodeURIComponent(policy.resourceId)}/versions/${policy.version}`,
    {
      method: 'PUT',
      body: JSON.stringify(policy),
    },
  );
}

export function publishSlaPolicy(resourceId: string, version: number) {
  return apiRequest<SlaPolicy>(
    `/sla/policies/${encodeURIComponent(resourceId)}/versions/${version}/publish`,
    { method: 'POST' },
  );
}

export function previewSlaPolicy(
  resourceId: string,
  version: number,
  priority: string,
) {
  return apiRequest<SlaPreview>('/sla/preview', {
    method: 'POST',
    body: JSON.stringify({ resourceId, version, priority, startedAt: new Date().toISOString() }),
  });
}

export function getSlaAssessment(entityId: string) {
  return apiRequest<SlaAssessment>(
    `/sla/assessments/${encodeURIComponent(entityId)}`,
  );
}

export async function listSlaAssessments() {
  const response = await apiRequest<{ items: SlaAssessment[] }>('/sla/assessments');
  return response.items;
}
