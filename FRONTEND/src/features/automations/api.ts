import { apiRequest } from '@/lib/apiClient';

export interface WorkflowAssignmentConfig {
  mode: 'team' | 'user';
  department_id: string;
  team_id: string;
  assignee_user_id?: string;
  overwrite_existing: boolean;
}

export type WorkflowRuleConfig = WorkflowAssignmentConfig | Record<string, unknown>;

export interface WorkflowAssignmentDirectory {
  departments: Array<{ id: string; nombre: string }>;
  teams: Array<{ id: string; nombre: string; department_id: string }>;
  assignees: Array<{ id: string; nombre: string; email: string; team_id: string }>;
}

export interface WorkflowRule {
  id: string;
  accion: string;
  condicion?: string;
  demora_segundos?: number;
  config?: WorkflowRuleConfig;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_version: number;
  regla_id: string;
  ticket_id: string;
  accion: string;
  estado: 'en_ejecucion' | 'completada' | 'fallida' | 'omitida';
  intentos: number;
  ultimo_error?: string;
  motivo?: string;
  iniciada_en: string;
  finalizada_en?: string;
}

export interface WorkflowVisualLayout {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
}

export interface PublishWorkflowInput {
  categoria_id: string;
  version: number;
  reglas: Array<{
    accion: string;
    condicion: string;
    demora_segundos: number;
    config?: WorkflowRuleConfig;
  }>;
  layout?: WorkflowVisualLayout;
}

export interface WorkflowDefinition {
  id: string;
  categoria_id: string;
  version: number;
  estado: 'borrador' | 'publicado' | 'desactivado';
  fecha_publicacion?: string;
  reglas?: WorkflowRule[];
  layout?: WorkflowVisualLayout;
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  const response = await apiRequest<{ items: WorkflowDefinition[] | null }>('/workflows');
  return response.items ?? [];
}

export function getWorkflow(id: string): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>(`/workflows/${encodeURIComponent(id)}`);
}

export function publishWorkflow(input: PublishWorkflowInput): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>('/workflows', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listWorkflowExecutions(id: string): Promise<WorkflowExecution[]> {
  const response = await apiRequest<{ items: WorkflowExecution[] | null }>(
    `/workflows/${encodeURIComponent(id)}/executions`,
  );
  return response.items ?? [];
}

export function deactivateWorkflow(id: string): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>(`/workflows/${encodeURIComponent(id)}/desactivar`, {
    method: 'POST',
  });
}

export function getWorkflowAssignmentDirectory(): Promise<WorkflowAssignmentDirectory> {
  return apiRequest<WorkflowAssignmentDirectory>('/organization/assignment-directory?capability=tickets');
}
