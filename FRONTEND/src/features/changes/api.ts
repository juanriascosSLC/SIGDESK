import { apiRequest, API_BASE_URL, authHeaders } from '@/lib/apiClient';
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
    {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    },
  );
}

export type ChangeTaskStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'canceled';

export type ChangeTaskWorkType =
  | 'generic'
  | 'inventory_readiness'
  | 'service_scheduling'
  | 'field_work_order'
  | 'restoration_validation'
  | 'payment_approval'
  | 'service_closeout';

export type ChangeTaskOutcomeCode =
  | 'parts_required'
  | 'parts_not_required'
  | 'schedule_confirmed'
  | 'work_completed'
  | 'work_failed'
  | 'additional_issue_found'
  | 'restoration_validated'
  | 'restoration_failed'
  | 'payment_approved'
  | 'payment_rejected'
  | 'payment_not_required'
  | 'closeout_completed';

export interface ChangeTask {
  id: string;
  humanId: string;
  changeId: string;
  workflowKey?: string;
  workType: ChangeTaskWorkType;
  outcomeCode?: ChangeTaskOutcomeCode;
  notes: string[];
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledBy: string;
  revision: number;
  title: string;
  description: string;
  area: string;
  team: string;
  assigneeId: string;
  departmentId: string;
  teamId: string;
  assigneeUserId: string;
  /** Trusted current-assignment display name; never a raw user UUID. */
  assigneeName?: string;
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

type ChangeTaskWire = Omit<ChangeTask, 'evidence' | 'notes'> & { evidence?: string[] | null; notes?: string[] | null };
type AssignedChangeTaskWire = Omit<AssignedChangeTask, 'task'> & { task: ChangeTaskWire };

/**
 * Older task rows can contain the JSON literal null even though the public
 * contract says evidence is an array. Normalize once at the HTTP boundary so
 * every task surface (Changes and Services) receives the promised shape.
 */
function normalizeChangeTask(task: ChangeTaskWire): ChangeTask {
  return {
    ...task,
    evidence: Array.isArray(task.evidence) ? task.evidence : [],
    notes: Array.isArray(task.notes) ? task.notes : [],
  };
}

/**
 * `mine` pide solo lo asignado a quien pregunta; `team` pide el trabajo de
 * su equipo. El alcance del rol sigue siendo el techo — el backend estrecha
 * con estos filtros pero nunca amplia por encima de lo concedido.
 */
export type AssignedChangeTaskFilter = 'mine' | 'team' | 'scope';

export async function listAssignedChangeTasks(filter: AssignedChangeTaskFilter = 'scope') {
  const query = filter === 'mine' ? '?assignedToMe=true' : filter === 'team' ? '?scope=team' : '';
  const response = await apiRequest<{ items: AssignedChangeTaskWire[] }>(
    `/changes/tasks/assigned${query}`,
  );
  return response.items.map((item) => ({ ...item, task: normalizeChangeTask(item.task) }));
}

export async function listChangeTasks(changeId: string) {
  const response = await apiRequest<{ items: ChangeTaskWire[] }>(
    `/changes/${encodeURIComponent(changeId)}/tasks`,
  );
  return response.items.map(normalizeChangeTask);
}

export async function createChangeTask(changeId: string, input: SaveChangeTaskInput) {
  const task = await apiRequest<ChangeTaskWire>(`/changes/${encodeURIComponent(changeId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeChangeTask(task);
}

export async function transitionChangeTask(
  changeId: string,
  taskId: string,
  transitionKey: string,
  options: {
    reason?: string;
    evidence?: string[];
    notes?: string[];
    outcomeCode?: ChangeTaskOutcomeCode;
    parts?: Array<{ sku?: string; description: string; quantity: number }>;
  } = {},
) {
  const task = await apiRequest<ChangeTaskWire>(
    `/changes/${encodeURIComponent(changeId)}/tasks/${encodeURIComponent(taskId)}/transitions/${encodeURIComponent(transitionKey)}`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ ...options, evidence: options.evidence ?? [], notes: options.notes ?? [], parts: options.parts ?? [] }),
    },
  );
  return normalizeChangeTask(task);
}

export async function scheduleChangeTask(changeId: string, taskId: string, start: string, end: string) {
  const task = await apiRequest<ChangeTaskWire>(`/changes/${encodeURIComponent(changeId)}/tasks/${encodeURIComponent(taskId)}/schedule`, {
    method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ start, end }),
  });
  return normalizeChangeTask(task);
}

export interface ChangeTaskAttachment {
  id: number;
  taskId: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export async function listChangeTaskAttachments(changeId: string, taskId: string) {
  const response = await apiRequest<{ items: ChangeTaskAttachment[] }>(`/changes/${encodeURIComponent(changeId)}/tasks/${encodeURIComponent(taskId)}/attachments`);
  return response.items ?? [];
}

export async function uploadChangeTaskAttachment(changeId: string, taskId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE_URL}/changes/${encodeURIComponent(changeId)}/tasks/${encodeURIComponent(taskId)}/attachments`, {
    method: 'POST', credentials: 'include', headers: { ...authHeaders(), 'Idempotency-Key': crypto.randomUUID() }, body: form,
  });
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}.`);
  return response.json() as Promise<ChangeTaskAttachment>;
}

export async function downloadChangeTaskAttachment(changeId: string, taskId: string, attachment: ChangeTaskAttachment) {
  const response = await fetch(`${API_BASE_URL}/changes/${encodeURIComponent(changeId)}/tasks/${encodeURIComponent(taskId)}/attachments/${attachment.id}`, { credentials: 'include', headers: authHeaders() });
  if (!response.ok) throw new Error(`Download failed with status ${response.status}.`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = attachment.filename; anchor.click(); URL.revokeObjectURL(url);
}
