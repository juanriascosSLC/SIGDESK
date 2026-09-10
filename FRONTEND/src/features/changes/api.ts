import { apiRequest } from '@/lib/apiClient';
import type {
  AssetContextInput,
  CatalogDefinition,
  EntityRecord,
  ExecutableDefinitionManifest,
} from '@/features/catalog/metamodel';

export function getChangeDefinition() {
  return apiRequest<CatalogDefinition>('/changes/definition');
}

export async function listChanges() {
  const response = await apiRequest<{ items: EntityRecord[] }>('/changes');
  return response.items;
}

export function getChange(id: string) {
  return apiRequest<EntityRecord>(`/changes/${encodeURIComponent(id)}`);
}

export function getChangeManifest(id: string) {
  return apiRequest<ExecutableDefinitionManifest>(
    `/changes/${encodeURIComponent(id)}/manifest`,
  );
}

export function createChange(
  data: Record<string, unknown>,
  idempotencyKey?: string,
  assetContext?: AssetContextInput,
) {
  return apiRequest<EntityRecord>('/changes', {
    method: 'POST',
    headers: idempotencyKey
      ? { 'Idempotency-Key': idempotencyKey }
      : undefined,
    body: JSON.stringify({ data, assetContext }),
  });
}

export function createChangeFromIncident(
  data: Record<string, unknown>,
  incidentId: string,
  assetContext?: AssetContextInput,
  idempotencyKey?: string,
) {
  return apiRequest<EntityRecord>('/changes/from-incident', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({ data, incidentId, assetContext }),
  });
}

export function updateChange(
  id: string,
  data: Record<string, unknown>,
  expectedUpdatedAt: string,
) {
  return apiRequest<EntityRecord>(`/changes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ data, expectedUpdatedAt }),
  });
}

export function transitionChange(id: string, transitionKey: string) {
  return apiRequest<EntityRecord>(
    `/changes/${encodeURIComponent(id)}/transitions/${encodeURIComponent(transitionKey)}`,
    { method: 'POST' },
  );
}

export type ChangeTaskStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'canceled';

export interface ChangeTask {
  id: string;
  humanId: string;
  changeId: string;
  title: string;
  description: string;
  area: string;
  team: string;
  assigneeId: string;
  departmentId: string;
  teamId: string;
  assigneeUserId: string;
  organization?: {
    departmentId: string;
    departmentName: string;
    teamId: string;
    teamName: string;
    assigneeUserId: string;
    assigneeName: string;
    assigneeEmail: string;
    capturedAt: string | null;
  };
  priority: string;
  required: boolean;
  status: ChangeTaskStatus;
  dependencyIds: string[];
  dueAt: string | null;
  blockedReason: string;
  evidence: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assetContext?: EntityRecord['assetContext'];
}

export interface SaveChangeTaskInput {
  title: string;
  description: string;
  area: string;
  team: string;
  assigneeId: string;
  departmentId: string;
  teamId: string;
  assigneeUserId: string;
  priority: string;
  required: boolean;
  dependencyIds: string[];
  dueAt: string;
  assetIds: string[];
}

export interface ChangeAssignmentDirectory {
  departments: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string; departmentId: string }>;
  assignees: Array<{ id: string; name: string; email: string; teamId: string }>;
}

export function getChangeAssignmentDirectory() {
  return apiRequest<ChangeAssignmentDirectory>('/changes/assignment-directory');
}

export interface AssignedChangeTask {
  task: ChangeTask;
  change: { id: string; humanId: string; state: string; title: string };
}

/**
 * `mine` pide solo lo asignado a quien pregunta; `team` pide el trabajo de
 * su equipo. El alcance del rol sigue siendo el techo — el backend estrecha
 * con estos filtros pero nunca amplia por encima de lo concedido.
 */
export type AssignedChangeTaskFilter = 'mine' | 'team' | 'scope';

export async function listAssignedChangeTasks(filter: AssignedChangeTaskFilter = 'scope') {
  const query = filter === 'mine' ? '?assignedToMe=true' : filter === 'team' ? '?scope=team' : '';
  const response = await apiRequest<{ items: AssignedChangeTask[] }>(
    `/changes/tasks/assigned${query}`,
  );
  return response.items;
}

export async function listChangeTasks(changeId: string) {
  const response = await apiRequest<{ items: ChangeTask[] }>(
    `/changes/${encodeURIComponent(changeId)}/tasks`,
  );
  return response.items;
}

export function createChangeTask(changeId: string, input: SaveChangeTaskInput) {
  return apiRequest<ChangeTask>(`/changes/${encodeURIComponent(changeId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function transitionChangeTask(
  changeId: string,
  taskId: string,
  transitionKey: string,
  options: { reason?: string; evidence?: string[] } = {},
) {
  return apiRequest<ChangeTask>(
    `/changes/${encodeURIComponent(changeId)}/tasks/${encodeURIComponent(taskId)}/transitions/${encodeURIComponent(transitionKey)}`,
    { method: 'POST', body: JSON.stringify(options) },
  );
}
