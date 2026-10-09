import { apiRequest } from '@/lib/apiClient';
import type { ChangeTaskOutcomeCode, ChangeTaskWorkType } from '@/features/changes/api';

export type TaskTemplateStatus = 'draft' | 'published' | 'retired';
export type TaskTemplateFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multiselect' | 'date' | 'datetime' | 'attachment' | 'asset_reference';

export interface TaskTemplateField {
  key: string;
  label: string;
  type: TaskTemplateFieldType;
  required: boolean;
  multiple?: boolean;
  helpText?: string;
  options: string[];
  evidence?: boolean;
  placeholder?: string;
}

export interface TaskTemplateOutcome {
  code: ChangeTaskOutcomeCode;
  label: string;
  description?: string;
  requiredFields: string[];
}

export interface TaskTemplateSection {
  id: string;
  title: string;
  description?: string;
  fieldKeys: string[];
}

export interface TaskTemplateDefinition {
  title: string;
  summary: string;
  instructions: string[];
  fields: TaskTemplateField[];
  outcomes: TaskTemplateOutcome[];
  sections: TaskTemplateSection[];
}

export interface TaskTemplate {
  id: number;
  familyKey: string;
  version: number;
  status: TaskTemplateStatus;
  workType: ChangeTaskWorkType;
  definition: TaskTemplateDefinition;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export async function listTaskTemplates() {
  return (await apiRequest<{ items: TaskTemplate[] }>('/change-task-templates')).items;
}

export function createTaskTemplateDraft(familyKey: string, workType: ChangeTaskWorkType, definition: TaskTemplateDefinition) {
  return apiRequest<TaskTemplate>('/change-task-templates/drafts', {
    method: 'POST',
    body: JSON.stringify({ familyKey, workType, definition }),
  });
}

export function updateTaskTemplateDraft(template: TaskTemplate, definition: TaskTemplateDefinition) {
  return apiRequest<TaskTemplate>(`/change-task-templates/${encodeURIComponent(template.familyKey)}/draft`, {
    method: 'PATCH',
    body: JSON.stringify({ definition, expectedUpdatedAt: template.updatedAt }),
  });
}

export function validateTaskTemplateDraft(familyKey: string) {
  return apiRequest<{ valid: true; issues: []; template: TaskTemplate }>(
    `/change-task-templates/${encodeURIComponent(familyKey)}/draft/validate`,
    { method: 'POST', body: '{}' },
  );
}

export function publishTaskTemplateDraft(template: TaskTemplate) {
  return apiRequest<TaskTemplate>(`/change-task-templates/${encodeURIComponent(template.familyKey)}/draft/publish`, {
    method: 'POST',
    body: JSON.stringify({ expectedUpdatedAt: template.updatedAt }),
  });
}
