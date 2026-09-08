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
      throw new Error('Resources returned a repeated cursor while querying Inventory.');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error('Inventory query exceeded the safe pagination limit.');
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

/**
 * A PRB/RFC surfaced for an asset's operational history, tagged with WHY it
 * is here — never implying every result personally stores the asset
 * snapshot:
 *   - 'direct_asset': the record itself carries an immutable asset snapshot.
 *   - 'via_incident': related (Problem/Change relations) to an INC that has
 *     a direct snapshot. viaHumanId names that INC.
 *   - 'via_problem' (RFC only): a PRB --resolvedBy--> RFC relation, already
 *     authorized on the PRB side by problem_service; change_service still
 *     applies its own changes:read + scope before this can ever appear.
 *     viaHumanId names that PRB.
 */
export interface AssociatedEntityRecord extends EntityRecord {
  associationPath: 'direct_asset' | 'via_incident' | 'via_problem';
  viaEntityKey?: string;
  viaHumanId?: string;
}

/**
 * One PRB→RFC "resolvedBy" reference, as problem_service's own batch/context
 * query returns it — already authorized there (problems:read + scope on the
 * PRB side). This is the ONLY place a viaProblemHumanId ever appears on the
 * wire: it travels FROM problem_service TO the frontend, never from the
 * frontend to change_service (see the trust-boundary note on
 * getAssetOperationalHistory below).
 */
interface ResolvedRfcReference {
  rfcHumanId: string;
  viaProblemHumanId: string;
}

/**
 * Whether a domain's `items` can be trusted as the FULL answer:
 *   - 'complete': every path this domain can be reached by was actually
 *     queried and succeeded. A `complete` result with zero `items` means
 *     genuinely zero associations — never "we didn't check".
 *   - 'partial': `items` may be missing entries, either because this
 *     domain's own request failed (its `items` is then always `[]` — a
 *     failed batch is never partially merged, see mergeAssociatedRecords'
 *     caller below) or because an UPSTREAM domain this one depends on
 *     (INC for PRB/RFC's via_incident matches, PRB for RFC's via_problem
 *     matches) could not be queried, so some of THIS domain's paths were
 *     never attempted even though its own request succeeded. `issues`
 *     names every contributing reason. These two states are deliberately
 *     never collapsed into one another, nor into "unavailable" — a partial
 *     PRB list from a successful direct-match query is still worth
 *     showing, just never as if it were the complete picture.
 */
export type DomainCompleteness = 'complete' | 'partial';

export interface DomainResult<T> {
  items: T[];
  completeness: DomainCompleteness;
  /** Human-readable reasons this domain is not 'complete'. Always empty
   *  when completeness === 'complete'. */
  issues: string[];
}

export interface AssetOperationalHistory {
  incidents: DomainResult<Ticket>;
  problems: DomainResult<AssociatedEntityRecord>;
  changes: DomainResult<AssociatedEntityRecord>;
}

// Mirrors problem_service/change_service's own MaxAssetContextBatchIDs — the
// per-request array cap BOTH backends enforce. Reused here as the CHUNK
// size: every reference (incident id/humanId, RFC candidate id) is sent in
// SOME batch, never silently sliced away. The number of batch calls per
// domain is ceil(referenceCount / ASSET_CONTEXT_BATCH_LIMIT), never one
// call per record.
const ASSET_CONTEXT_BATCH_LIMIT = 500;

const PROVENANCE_PRIORITY: Record<AssociatedEntityRecord['associationPath'], number> = {
  direct_asset: 3,
  via_incident: 2,
  via_problem: 1,
};

/**
 * Splits `items` into chunks of at most `size`. Always returns AT LEAST one
 * chunk — including a single empty chunk for an empty input — so a caller
 * that always needs one request per domain (to still pick up direct-asset
 * matches when there are zero incidents) never has to special-case "no
 * chunks at all".
 */
function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** Pairs up two chunk lists positionally, padding the shorter one with
 *  empty arrays — so batching two independently-sized reference lists
 *  (incidents, RFC candidates) never requires more calls than
 *  `max(ceil(aCount/limit), ceil(bCount/limit))`, instead of the two
 *  counts summed. */
function zipChunks<A, B>(a: A[][], b: B[][]): Array<{ a: A[]; b: B[] }> {
  const length = Math.max(a.length, b.length);
  const paired: Array<{ a: A[]; b: B[] }> = [];
  for (let index = 0; index < length; index += 1) {
    paired.push({ a: a[index] ?? [], b: b[index] ?? [] });
  }
  return paired;
}

/**
 * Merges association pages (one array per batch call) into a single
 * deduplicated, deterministically-ordered list — first-seen order across
 * pages, with AssociationPath priority (direct_asset > via_incident >
 * via_problem) deciding which occurrence's provenance wins when the same
 * record surfaces from more than one batch (e.g. it is both a direct match
 * in one chunk's response and a via_incident match discovered from another
 * chunk's incident references).
 */
function mergeAssociatedRecords(pages: AssociatedEntityRecord[][]): AssociatedEntityRecord[] {
  const byId = new Map<string, AssociatedEntityRecord>();
  const order: string[] = [];
  for (const page of pages) {
    for (const record of page) {
      const existing = byId.get(record.id);
      if (!existing) {
        byId.set(record.id, record);
        order.push(record.id);
        continue;
      }
      if (PROVENANCE_PRIORITY[record.associationPath] > PROVENANCE_PRIORITY[existing.associationPath]) {
        byId.set(record.id, record);
      }
    }
  }
  return order.map((id) => byId.get(id)!);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Pages through EVERY INC linked to this asset — tickets_service's own
 * cursor pagination, driven here the same way collectAssetPages drives
 * Resources' — so an asset with more than one page of incident history is
 * never silently truncated to the first RESOURCE_PAGE_SIZE.
 */
async function collectAllIncidentsForAsset(assetId: string): Promise<Ticket[]> {
  const items = new Map<string, Ticket>();
  const seenCursors = new Set<string>();
  let cursor = '';

  for (let pageNumber = 0; pageNumber < MAX_RESOURCE_PAGES; pageNumber += 1) {
    const page = await listTickets({ assetId, limit: RESOURCE_PAGE_SIZE, cursor: cursor || undefined });
    for (const item of page.items) items.set(item.id, item);
    if (!page.hasMore || !page.nextCursor) return [...items.values()];
    if (seenCursors.has(page.nextCursor)) {
      throw new Error('Tickets returned a repeated cursor while collecting asset operational history.');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error('Asset operational history exceeded the safe pagination limit for incidents.');
}

/**
 * Composes an asset's full operational history — INC directly linked, PLUS
 * PRB/RFC reachable directly OR through a linked INC OR (RFC only) through
 * a PRB's resolvedBy relation — in a BOUNDED number of requests: the INC
 * pagination loop, ceil(incidentCount / ASSET_CONTEXT_BATCH_LIMIT) calls to
 * problem_service, and max of that and ceil(rfcCandidateCount / LIMIT)
 * calls to change_service. Never one request per incident or problem, and
 * — the point of this hardening pass — never a slice(0, N) that silently
 * drops references beyond the batch limit: every reference is sent in SOME
 * batch.
 *
 * Trust boundary (Workstream A item 2): change_service receives ONLY plain
 * RFC human ids as lookup candidates (problemResolvedRfcHumanIds) — never
 * the {rfcHumanId, viaProblemHumanId} pairing itself, which change_service
 * has no way to verify and must not be asked to assert. The "Via PRB-xxxxxx"
 * label for a via_problem RFC is produced HERE, by joining change_service's
 * own authorized result (it decided the RFC is visible on its own
 * changes:read + scope terms) against problem_service's own authoritative
 * resolvedByRfcRefs (it decided the PRB relation is real and visible on its
 * own problems:read + scope terms) — a display-only join over two
 * independently-authorized answers, never a persisted or server-asserted
 * relationship on either side.
 *
 * Each domain fails independently and ATOMICALLY: if any batch call for a
 * domain fails, the WHOLE domain is marked unavailable (never a partial
 * list built from only the batches that happened to succeed) — a
 * successful-but-incomplete history is exactly what this must never
 * produce. The other domains still render, named in unavailableDomains.
 */
export async function getAssetOperationalHistory(assetId: string): Promise<AssetOperationalHistory> {
  let incidents: Ticket[] = [];
  let incidentsOk = true;
  try {
    incidents = await collectAllIncidentsForAsset(assetId);
  } catch {
    incidentsOk = false;
  }
  const incidentChunks = chunk(incidents, ASSET_CONTEXT_BATCH_LIMIT);

  let problems: AssociatedEntityRecord[] = [];
  let resolvedByRfcRefs: ResolvedRfcReference[] = [];
  let problemsFetchOk = true;
  try {
    const problemPages: AssociatedEntityRecord[][] = [];
    const allResolvedRefs: ResolvedRfcReference[] = [];
    for (const incidentChunk of incidentChunks) {
      const response = await apiRequest<{ items: AssociatedEntityRecord[]; resolvedByRfcRefs?: ResolvedRfcReference[] }>(
        '/problems/by-asset-context',
        {
          method: 'POST',
          body: JSON.stringify({
            assetId,
            incidentIds: dedupeStrings(incidentChunk.map((t) => t.entityId).filter((id): id is string => Boolean(id))),
            incidentHumanIds: dedupeStrings(incidentChunk.map((t) => t.humanId).filter((id): id is string => Boolean(id))),
          }),
        },
      );
      problemPages.push(response.items);
      allResolvedRefs.push(...(response.resolvedByRfcRefs ?? []));
    }
    // Merged and deduped only after EVERY chunk succeeded — a failure
    // partway through must not leave a partial `problems` list standing in
    // for the whole domain (this is about THIS domain's own request
    // atomicity — see the completeness/issues composition below for the
    // separate, cross-domain notion of "my own request succeeded, but an
    // upstream domain didn't, so I might still be missing entries").
    problems = mergeAssociatedRecords(problemPages);
    resolvedByRfcRefs = allResolvedRefs;
  } catch {
    problemsFetchOk = false;
  }

  // First-seen viaProblemHumanId per RFC human id — the trusted join table
  // used below to label via_problem results; never sent to change_service.
  const viaProblemHumanIdByRfc = new Map<string, string>();
  for (const ref of resolvedByRfcRefs) {
    if (!viaProblemHumanIdByRfc.has(ref.rfcHumanId)) viaProblemHumanIdByRfc.set(ref.rfcHumanId, ref.viaProblemHumanId);
  }
  const rfcCandidateChunks = chunk(dedupeStrings([...viaProblemHumanIdByRfc.keys()]), ASSET_CONTEXT_BATCH_LIMIT);

  let changes: AssociatedEntityRecord[] = [];
  let changesFetchOk = true;
  try {
    const changePages: AssociatedEntityRecord[][] = [];
    for (const { a: incidentChunk, b: rfcCandidateChunk } of zipChunks(incidentChunks, rfcCandidateChunks)) {
      const response = await apiRequest<{ items: AssociatedEntityRecord[] }>('/changes/by-asset-context', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          incidentIds: dedupeStrings(incidentChunk.map((t) => t.entityId).filter((id): id is string => Boolean(id))),
          incidentHumanIds: dedupeStrings(incidentChunk.map((t) => t.humanId).filter((id): id is string => Boolean(id))),
          problemResolvedRfcHumanIds: rfcCandidateChunk,
        }),
      });
      changePages.push(response.items);
    }
    changes = mergeAssociatedRecords(changePages).map((record) =>
      record.associationPath === 'via_problem' && !record.viaHumanId && viaProblemHumanIdByRfc.has(record.humanId)
        ? { ...record, viaHumanId: viaProblemHumanIdByRfc.get(record.humanId) }
        : record,
    );
  } catch {
    changesFetchOk = false;
  }

  // Completeness/issues are composed here, ONCE, as the single source of
  // truth for "can this domain's `items` be trusted as the full answer" —
  // deliberately NOT three independent try/catch flags surfaced separately,
  // which is exactly what let an upstream failure hide behind a
  // downstream domain's own successful (but necessarily incomplete)
  // request. The dependency chain is INC -> PRB (via_incident) -> RFC
  // (via_incident AND via_problem), so a failure anywhere upstream taints
  // every domain downstream of it, even when that downstream domain's own
  // request succeeded outright.
  const incidentIssues: string[] = [];
  if (!incidentsOk) incidentIssues.push('No se pudo consultar INC para este activo.');

  const problemIssues: string[] = [];
  if (!incidentsOk) problemIssues.push('INC no disponible: las coincidencias vía incidente pueden faltar.');
  if (!problemsFetchOk) problemIssues.push('No se pudo consultar PRB directamente para este activo.');

  const changeIssues: string[] = [];
  if (!incidentsOk) changeIssues.push('INC no disponible: las coincidencias vía incidente pueden faltar.');
  if (!problemsFetchOk) changeIssues.push('PRB no disponible: las referencias PRB→RFC pueden faltar.');
  if (!changesFetchOk) changeIssues.push('No se pudo consultar RFC directamente para este activo.');

  return {
    incidents: { items: incidents, completeness: incidentIssues.length === 0 ? 'complete' : 'partial', issues: incidentIssues },
    problems: { items: problems, completeness: problemIssues.length === 0 ? 'complete' : 'partial', issues: problemIssues },
    changes: { items: changes, completeness: changeIssues.length === 0 ? 'complete' : 'partial', issues: changeIssues },
  };
}
