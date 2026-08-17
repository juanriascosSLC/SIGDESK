import { apiRequest, API_BASE_URL, authHeaders } from '@/lib/apiClient';
import type {
  CreateTicketInput,
  Ticket,
  TicketActivityEntry,
  TicketAttachment,
  TicketComment,
  TicketFilters,
  TicketPage,
  TicketStatus,
  TicketWatcher,
} from './types';

/**
 * The camelCase/English ticket shape this module was originally written
 * against. No route in tickets_service returns it: the only ticket DTOs the
 * backend actually serves are `ticketDTO` (snake_case Spanish, `GET /tickets`)
 * and `entityRecordDTO` (`GET /entities/INC`, see TicketEntityRecord below).
 *
 * It survives here ONLY as the declared response type of the mutation helpers
 * further down (status/assign/merge/unmerge), whose endpoints do not exist in
 * tickets_service either — they are pending work in the pool plan (T3/T21),
 * not a contract in use. Reads (`listTickets`/`getTicket`) no longer go
 * through it; they use the real `/entities/INC` contract instead.
 */
interface ApiTicket {
  id: string;
  entityId?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  requesterName: string;
  assigneeName: string | null;
  createdAt: string;
  assetId: string | null;
  site: string | null;
  mergedCount: number;
  mergedIntoId: string | null;
}

/**
 * INC is the only entityKey with a real backend domain behind it today —
 * `/entities/PRB` and `/entities/RFC` answer 501 on purpose
 * (`entityKeySoportado` in tickets_service/adapters/in/entidades_controller.go).
 */
const TICKET_ENTITY_KEY = 'INC';

/**
 * `entityRecordDTO` as served by `GET /entities/INC` and
 * `GET /entities/INC/{id}` — the real, authenticated contract the ticket pool
 * is built on (plan decision #5: build the pool on /entities/INC rather than
 * keeping the legacy `GET /tickets` shape alive).
 *
 * `data` holds the dynamic catalog fields (`campos_dinamicos`), so which keys
 * exist depends on the published Definition, never on this file. The last four
 * fields are the ticket-specific projection the same DTO adds for this pool;
 * every one of them is a RAW ID, not a resolved display name.
 */
interface TicketEntityRecord {
  id: string;
  humanId: string;
  entityKey: string;
  state: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
  recursoId?: string;
  creadorId?: string;
  agenteItId?: string;
  prioridad?: string;
}

interface TicketEntityListResponse {
  items: TicketEntityRecord[] | null;
  nextCursor?: string;
  hasMore?: boolean;
}

// The catalog Definition owns which states and priorities exist, so these
// are mechanical case conversions rather than fixed lookup tables: any new
// value an admin defines round-trips instead of becoming undefined.
// "in_progress" <-> "In Progress", "on_hold" <-> "On Hold", and so on.
function labelFromApi(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function labelToApi(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

// Exported so callers that need to match a ticket's displayed status against
// backend-shaped data (e.g. a lifecycle's transition `from`/`to` keys, which
// are always snake_case) can convert without duplicating this mapping.
export const statusFromApi = labelFromApi;
export const statusToApi = labelToApi;
const priorityFromApi = labelFromApi;
const priorityToApi = labelToApi;

function toTicket(ticket: ApiTicket): Ticket {
  return {
    id: ticket.id,
    entityId: ticket.entityId,
    title: ticket.title,
    description: ticket.description,
    status: statusFromApi(ticket.status),
    priority: priorityFromApi(ticket.priority),
    category: ticket.category,
    requester: ticket.requesterName,
    assignee: ticket.assigneeName,
    createdAt: ticket.createdAt,
    assetId: ticket.assetId || undefined,
    site: ticket.site || undefined,
    mergedCount: ticket.mergedCount,
    mergedIntoId: ticket.mergedIntoId,
  };
}

/**
 * Reads a string out of the dynamic `data` bag. Which key holds the title is
 * decided by whoever published the Definition, so there is no key this code
 * can rely on — it tries the keys this repo's own definitions and fixtures
 * actually use (English from the e2e catalog fixtures, Spanish from
 * tickets_service's own integration test) and gives up rather than guessing
 * further.
 */
function dataString(
  data: Record<string, unknown> | null | undefined,
  keys: string[],
): string | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

/**
 * Maps `entityRecordDTO` onto the `Ticket` shape the pool screens already
 * consume. Field by field, including what has no source at all — the point is
 * that a reader can tell real data from a placeholder without diffing this
 * against the Go DTO:
 *
 * - `id` <- `id` (the BIGINT primary key as a string). NOT `humanId`: the URL
 *   `/app/tickets/:id` feeds this straight back into `getTicket`, and both
 *   `GET /entities/INC/{id}` and `GET /tickets/{id}` parse the path as an
 *   int64, so a human id there is a 400. `humanId` is carried alongside for
 *   display only.
 * - `entityId` <- `id`: in this backend a ticket IS the catalog entity (one
 *   row, one aggregate), which is what makes the live SLA chip resolve.
 * - `status` <- `state`, `priority` <- `prioridad`: both mechanical case
 *   conversions, so any state/priority an admin defines round-trips.
 * - `category` <- `entityKey`. The DTO has no `categoriaId`, and for anything
 *   created through the Catalog Builder the backend itself defaults
 *   categoriaID to the entityKey (see crearEntidadRequest), so this is that
 *   same value rather than an invention.
 * - `requester` <- `creadorId`: a RAW user id, not a display name. Resolving
 *   it needs a lookup against organization_service that tickets_service does
 *   not have; showing the id is the honest interim, and the pool plan tracks
 *   the resolution as separate work.
 * - `assignee` <- `agenteItId`: also a raw id, and specifically the IT agent
 *   from the *asignación de IT* (escalation). It is NOT the *asignación de
 *   ticket* first responsible (`Asignacion.PrimerResponsableID`), which the
 *   DTO does not expose — glossary.md keeps those two processes distinct, so
 *   an unescalated ticket reads as "Sin asignar" even if it has a first
 *   responsible.
 * - `assetId` <- `recursoId`: the Recurso IS the asset (camera/device) in
 *   ADR-0001 terms, so this column shows real data.
 * - `title`/`description` <- the dynamic `data` bag, with a fallback: they are
 *   catalog fields, so a Definition without them is legitimate. `title` never
 *   becomes undefined, since search and the table title both index it.
 * - NO SOURCE AT ALL — deliberately left undefined/null rather than faked:
 *   `site` (no site/location concept anywhere in domain.Ticket) and
 *   `mergedCount`/`mergedIntoId` (no merge in the backend domain; the merge
 *   endpoints this file calls do not exist yet). The pool JSX already renders
 *   these as "-", so they degrade to an empty cell instead of breaking.
 */
function toTicketFromEntityRecord(record: TicketEntityRecord): Ticket {
  const data = record.data ?? {};
  return {
    id: record.id,
    humanId: record.humanId,
    entityId: record.id,
    title: dataString(data, ['title', 'titulo', 'asunto']) ?? '(sin título)',
    description: dataString(data, ['description', 'descripcion']) ?? '',
    // Both conversions are guarded: a single throw inside this mapper would
    // take down the whole list with "Could not load tickets", so a missing
    // value degrades to an empty cell instead.
    status: record.state ? statusFromApi(record.state) : '',
    priority: record.prioridad ? priorityFromApi(record.prioridad) : '',
    category: record.entityKey,
    requester: record.creadorId ?? '',
    assignee: record.agenteItId || null,
    createdAt: record.createdAt,
    assetId: record.recursoId || undefined,
    site: undefined,
    mergedCount: undefined,
    mergedIntoId: null,
  };
}

/**
 * `GET /entities/{entityKey}` accepts only `cursor` and `limit` — status,
 * priority, site, assignee, unassigned, q and mergedInto have no server-side
 * support (the backend deliberately does not accept params it would ignore).
 * They are applied here instead, over the page that came back.
 *
 * Stated rather than hidden: this filters a PAGE, not the whole set, the same
 * limitation the quick-view counts in TicketsList already carry. Two of these
 * are load-bearing rather than cosmetic:
 *  - `q` is the only one a user can actually type, so dropping it would make
 *    the search box look broken.
 *  - `mergedInto` MUST filter: TicketDetail asks for "tickets merged into this
 *    one", and passing that through unfiltered would claim the whole page was
 *    merged into it. With no merge data in the backend, the honest answer is
 *    an empty list, which is what this produces.
 */
function applyClientFilters(items: Ticket[], filters: TicketFilters): Ticket[] {
  const q = filters.q?.trim().toLowerCase();
  return items.filter((ticket) => {
    if (filters.status && ticket.status !== filters.status) return false;
    if (filters.priority && ticket.priority !== filters.priority) return false;
    if (filters.category && ticket.category !== filters.category) return false;
    if (filters.site && ticket.site !== filters.site) return false;
    if (filters.assignee && ticket.assignee !== filters.assignee) return false;
    if (filters.unassigned && ticket.assignee) return false;
    if (filters.mergedInto && ticket.mergedIntoId !== filters.mergedInto) return false;
    if (q) {
      const haystack = [ticket.humanId, ticket.id, ticket.title, ticket.description]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export async function listTickets(filters: TicketFilters = {}): Promise<TicketPage> {
  const params = new URLSearchParams();
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();

  const response = await apiRequest<TicketEntityListResponse>(
    `/entities/${TICKET_ENTITY_KEY}${query ? `?${query}` : ''}`,
  );
  const items = (response.items ?? []).map(toTicketFromEntityRecord);
  return {
    items: applyClientFilters(items, filters),
    // nextCursor/hasMore describe the backend's RAW page, before its in-memory
    // entityKey filter (and before the client filters above) — so a page can
    // legitimately come back short, or empty, with hasMore still true.
    nextCursor: response.nextCursor ?? '',
    hasMore: Boolean(response.hasMore),
  };
}

export async function getTicket(id: string): Promise<Ticket> {
  return toTicketFromEntityRecord(
    await apiRequest<TicketEntityRecord>(
      `/entities/${TICKET_ENTITY_KEY}/${encodeURIComponent(id)}`,
    ),
  );
}

/**
 * @deprecated New intake screens must use Catalog Builder's createEntity.
 * This client remains only for external/legacy callers during convergence.
 *
 * KNOWN INCONSISTENCY (pool plan, T3/T21): reads were moved to
 * `/entities/INC` while this still posts to the legacy `POST /tickets`, whose
 * `crearTicketRequest` expects recurso_id/creador_id/categoria_id/agente_it_id
 * — none of which this payload sends. It is left untouched on purpose: real
 * ticket creation already works through the Catalog Builder path
 * (`createEntity` in features/catalog/metamodel.ts), so converging this one is
 * a separate decision (that legacy route also has no `ConAutenticacion`, which
 * is exactly what T18 is about) rather than a silent edit here.
 */
export async function createTicket(
  input: CreateTicketInput,
): Promise<Ticket> {
  const payload = {
    title: input.title,
    description: input.description,
    priority: priorityToApi(input.priority),
    category: input.category,
    requesterName: input.requesterName || 'Current User',
    assetId: input.assetId || null,
    site: input.site || null,
  };

  return toTicket(
    await apiRequest<ApiTicket>('/tickets', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
  actorName?: string,
): Promise<Ticket> {
  return toTicket(
    await apiRequest<ApiTicket>(`/tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: statusToApi(status), actorName: actorName || null }),
    }),
  );
}

export async function assignTicket(
  id: string,
  assigneeName: string | null,
  actorName?: string,
): Promise<Ticket> {
  return toTicket(
    await apiRequest<ApiTicket>(`/tickets/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeName, actorName: actorName || null }),
    }),
  );
}

export async function mergeTickets(
  primaryId: string,
  mergedIds: string[],
  actorName?: string,
): Promise<Ticket> {
  return toTicket(
    await apiRequest<ApiTicket>(`/tickets/${primaryId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ mergedIds, actorName: actorName || null }),
    }),
  );
}

export async function unmergeTicket(
  primaryId: string,
  mergedId: string,
  actorName?: string,
): Promise<Ticket> {
  return toTicket(
    await apiRequest<ApiTicket>(`/tickets/${primaryId}/unmerge/${mergedId}`, {
      method: 'POST',
      body: JSON.stringify({ actorName: actorName || null }),
    }),
  );
}

export async function listComments(ticketId: string): Promise<TicketComment[]> {
  const response = await apiRequest<{ items: TicketComment[] }>(`/tickets/${ticketId}/comments`);
  return response.items;
}

export async function addComment(
  ticketId: string,
  input: { authorName: string; body: string; isInternal: boolean },
): Promise<TicketComment> {
  return apiRequest<TicketComment>(`/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listAttachments(ticketId: string): Promise<TicketAttachment[]> {
  const response = await apiRequest<{ items: TicketAttachment[] }>(`/tickets/${ticketId}/attachments`);
  return response.items;
}

export async function uploadAttachment(
  ticketId: string,
  file: File,
  uploaderName: string,
): Promise<TicketAttachment> {
  const form = new FormData();
  form.append('file', file);
  form.append('uploaderName', uploaderName);

  // Raw fetch (not apiRequest) because the body is multipart, so the browser
  // must set Content-Type with its own boundary — but the session header still
  // has to be attached by hand.
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ error: 'The server returned an unexpected response.' }));
    throw new Error(payload.error || `Upload failed with status ${response.status}.`);
  }
  return response.json() as Promise<TicketAttachment>;
}

export function attachmentDownloadUrl(attachmentId: string): string {
  return `${API_BASE_URL}/attachments/${attachmentId}/download`;
}

export async function listWatchers(ticketId: string): Promise<TicketWatcher[]> {
  const response = await apiRequest<{ items: TicketWatcher[] }>(`/tickets/${ticketId}/watchers`);
  return response.items;
}

export async function addWatcher(ticketId: string, watcherName: string): Promise<void> {
  await apiRequest<void>(`/tickets/${ticketId}/watchers`, {
    method: 'POST',
    body: JSON.stringify({ watcherName }),
  });
}

export async function removeWatcher(ticketId: string, watcherName: string): Promise<void> {
  await apiRequest<void>(`/tickets/${ticketId}/watchers/${encodeURIComponent(watcherName)}`, {
    method: 'DELETE',
  });
}

export async function listActivity(ticketId: string): Promise<TicketActivityEntry[]> {
  const response = await apiRequest<{ items: TicketActivityEntry[] }>(`/tickets/${ticketId}/activity`);
  return response.items;
}
