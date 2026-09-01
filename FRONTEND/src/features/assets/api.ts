import { apiRequest } from '@/lib/apiClient';
import { listTickets } from '@/features/tickets/api';
import type { Ticket } from '@/features/tickets/types';
import type { EntityRecord } from '@/features/catalog/metamodel';

export interface AssetProjection {
  id: string;
  sourceSystem: string;
  externalEntity: string;
  externalId: string;
  externalKey: string;
  kind: 'site' | 'system' | 'device' | 'component';
  siteAssetId?: string;
  parentAssetId?: string;
  assetType: string;
  displayName: string;
  lifecycle: 'active' | 'inactive' | 'unavailable' | 'retired';
  serial?: string;
  manufacturer?: string;
  model?: string;
  ipAddress?: string;
  status?: string;
  attributes: Record<string, unknown>;
  sourceVersion?: string;
  lastSyncedAt: string;
  deleted: boolean;
  /** Internal Organization departments/teams allowed to access this asset. */
  organizationUnitIds?: string[];
}

export interface AssetPage {
  items: AssetProjection[];
  nextCursor?: string;
  hasMore: boolean;
  stale: boolean;
}

const RESOURCE_PAGE_SIZE = 100;
const MAX_RESOURCE_PAGES = 100;

export function assetTypeMatches(assetType: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  const normalizedType = (assetType ?? '').toLowerCase().replaceAll('_', '-');
  const normalizedFilter = filter.toLowerCase().replaceAll('_', '-');
  if (normalizedType === normalizedFilter) return true;
  if (normalizedFilter === 'hardware') return !['software', 'license', 'site'].includes(normalizedType);
  if (normalizedFilter === 'infraestructura-red') {
    return ['switch', 'router', 'access-point', 'radio'].includes(normalizedType);
  }
  if (normalizedFilter === 'software-licencia') return ['software', 'license'].includes(normalizedType);
  return false;
}

async function collectAssetPages(path: string, query: URLSearchParams): Promise<AssetPage> {
  const items = new Map<string, AssetProjection>();
  const seenCursors = new Set<string>();
  let cursor = '';
  let stale = false;

  for (let pageNumber = 0; pageNumber < MAX_RESOURCE_PAGES; pageNumber += 1) {
    const pageQuery = new URLSearchParams(query);
    pageQuery.set('limit', String(RESOURCE_PAGE_SIZE));
    if (cursor) pageQuery.set('cursor', cursor);
    const page = await apiRequest<AssetPage>(`${path}?${pageQuery.toString()}`);
    for (const item of page.items ?? []) items.set(item.id, item);
    stale ||= Boolean(page.stale);
    if (!page.hasMore || !page.nextCursor) {
      return { items: [...items.values()], hasMore: false, stale };
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error('Resources devolvió un cursor repetido al consultar Inventory.');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error('La consulta de Inventory excedió el límite seguro de paginación.');
}

export function listAssetSites(search = ''): Promise<AssetPage> {
  const query = new URLSearchParams();
  if (search.trim()) query.set('q', search.trim());
  return collectAssetPages('/assets/sites', query);
}

export function listSiteAssets(siteAssetId: string, assetType = ''): Promise<AssetPage> {
  const query = new URLSearchParams();
  if (assetType) query.set('type', assetType);
  return collectAssetPages(`/assets/sites/${encodeURIComponent(siteAssetId)}/assets`, query);
}

export function getAsset(assetId: string): Promise<AssetProjection> {
  return apiRequest<AssetProjection>(`/assets/${encodeURIComponent(assetId)}`);
}

/**
 * Asigna unidades organizacionales a MUCHOS activos de una vez.
 *
 * Existe porque una instalación real tiene cientos de sitios y configurarlos
 * de a uno no es viable. Como los dispositivos heredan las unidades de su
 * sitio, asignar los sitios cubre todo el inventario.
 *
 * `add`/`remove` evitan pisar asignaciones previas cuando el lote incluye
 * sitios que no están todos en el mismo estado.
 */
export function setAssetOrganizationUnitsBulk(
  assetIds: string[],
  organizationUnitIds: string[],
  mode: 'replace' | 'add' | 'remove' = 'replace',
): Promise<{ applied: number }> {
  return apiRequest<{ applied: number }>('/assets/organization-units:bulk', {
    method: 'PUT',
    body: JSON.stringify({ assetIds, organizationUnitIds, mode }),
  });
}

export function setAssetOrganizationUnits(assetId: string, organizationUnitIds: string[]): Promise<void> {
  return apiRequest<void>(`/assets/${encodeURIComponent(assetId)}/organization-units`, {
    method: 'PUT',
    body: JSON.stringify({ organizationUnitIds }),
  });
}

export interface AssetOperationalHistory {
  incidents: Ticket[];
  problems: EntityRecord[];
  changes: EntityRecord[];
  unavailableDomains: Array<'INC' | 'PRB' | 'RFC'>;
}

export async function getAssetOperationalHistory(assetId: string): Promise<AssetOperationalHistory> {
  const results = await Promise.allSettled([
    listTickets({ assetId, limit: 100 }),
    apiRequest<{ items: EntityRecord[] }>(`/problems/by-asset/${encodeURIComponent(assetId)}`),
    apiRequest<{ items: EntityRecord[] }>(`/changes?assetId=${encodeURIComponent(assetId)}`),
  ]);
  return {
    incidents: results[0].status === 'fulfilled' ? results[0].value.items : [],
    problems: results[1].status === 'fulfilled' ? results[1].value.items : [],
    changes: results[2].status === 'fulfilled' ? results[2].value.items : [],
    unavailableDomains: (['INC', 'PRB', 'RFC'] as const).filter((_, index) => results[index].status === 'rejected'),
  };
}
