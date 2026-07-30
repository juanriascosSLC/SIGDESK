import { apiRequest } from '@/lib/apiClient';
import type {
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
) {
  return apiRequest<EntityRecord>('/changes', {
    method: 'POST',
    headers: idempotencyKey
      ? { 'Idempotency-Key': idempotencyKey }
      : undefined,
    body: JSON.stringify({ data }),
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
