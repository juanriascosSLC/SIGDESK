import { apiRequest, API_BASE_URL, authHeaders } from '@/lib/apiClient';
import { getResolvedDefinition, type LifecycleTransitionDefinition } from '@/features/catalog/api';
import { USER_UNAVAILABLE_LABEL } from './identity-labels';
import type {
  CreateTicketInput,
  Ticket,
  TicketActivityEntry,
  TicketAssignment,
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
 * It survives only at the legacy `createTicket` compatibility boundary.
 * Reads and normal commands use `/entities/INC` plus the collaboration
 * endpoints implemented by tickets_service.
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
  /**
   * Trusted display name for `creadorId`, resolved server-side (JWT
   * snapshot at creation, or the local identity projection for a
   * historical ticket) — see tickets_service's `entityRecordDTO`. Empty
   * when it could not be resolved; `toTicketFromEntityRecord` below is
   * where that turns into the safe "Usuario no disponible" fallback, never
   * a raw id.
   */
  creadorNombre?: string;
  agenteItId?: string;
  primerResponsableId?: string;
  /**
   * Trusted display name for the LEGACY responsible
   * (primerResponsableId/agenteItId), resolved server-side by chaining
   * AgenteIT.ID -> usuario_id -> nombre. Only meaningful when `assignment`
   * is absent — an organizational assignment is the canonical one and
   * already carries its own resolved name.
   */
  primerResponsableNombre?: string;
  assignment?: {
    departmentId: string;
    departmentName?: string;
    teamId: string;
    teamName?: string;
    assigneeUserId?: string;
    assigneeUserName?: string;
    source: string;
    assignedByType: string;
    assignedById: string;
    assignedByUserId?: string;
    assignedAt: string;
  };
  prioridad?: string;
  mergedCount?: number;
  mergedIntoId?: string | null;
  assetContext?: {
    siteAssetId?: string;
    links: Array<{ assetId: string; role?: string; snapshot: Record<string, unknown> }>;
  };
}

/**
 * Resolves the assignee half of `Ticket`'s identity fields from
 * `entityRecordDTO`, with the precedence the backend itself documents:
 *
 * 1. Organizational assignment WITH a person (`assignment.assigneeUserId`)
 *    — the canonical case, name already resolved server-side.
 * 2. Organizational assignment with a TEAM ONLY (no assigneeUserId) — a
 *    real destination with nobody individually assigned yet. Must never
 *    read as "Sin asignar".
 * 3. No organizational assignment: the LEGACY first-responsible
 *    (`primerResponsableId`/`agenteItId`), resolved server-side via
 *    `primerResponsableNombre` — an unescalated historical ticket.
 * 4. Nothing at all: genuinely unassigned.
 *
 * `assigneeId` only ever holds a PERSON id (for filters/commands/auditing);
 * `assigneeDisplayName`/`assigneeTeamName` are always either a safe,
 * ready-to-render string or `null` — never a raw id.
 */
function resolveAssigneeIdentity(record: TicketEntityRecord): Pick<
  Ticket,
  'assigneeId' | 'assigneeDisplayName' | 'assigneeTeamName' | 'assignment'
> {
  const assignment: TicketAssignment | undefined = record.assignment;
  const orgAssigneeId = assignment?.assigneeUserId?.trim();
  if (orgAssigneeId) {
    return {
      assigneeId: orgAssigneeId,
      assigneeDisplayName: assignment?.assigneeUserName || USER_UNAVAILABLE_LABEL,
      assigneeTeamName: null,
      assignment,
    };
  }
  if (assignment?.teamId) {
    return {
      assigneeId: null,
      assigneeDisplayName: null,
      assigneeTeamName: assignment.teamName || USER_UNAVAILABLE_LABEL,
      assignment,
    };
  }
  const legacyId = record.primerResponsableId || record.agenteItId;
  if (legacyId) {
    return {
      assigneeId: legacyId,
      assigneeDisplayName: record.primerResponsableNombre || USER_UNAVAILABLE_LABEL,
      assigneeTeamName: null,
      assignment,
    };
  }
  return { assigneeId: null, assigneeDisplayName: null, assigneeTeamName: null, assignment };
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
export function statusFromApi(value: string): string {
  const normalized = labelToApi(value);
  const labels: Record<string, string> = {
    abierto: 'Open', en_progreso: 'In Progress', en_espera: 'Pending Review',
    resuelto: 'Resolved', cerrado: 'Closed', reabierto: 'Reopened',
    pending: 'Pending Review', waiting: 'Pending Review', on_hold: 'Pending Review',
  };
  return labels[normalized] ?? labelFromApi(value);
}

export function statusToApi(value: string): string {
  return canonicalTicketState(value);
}

/** Compatibility boundary while the INC aggregate persists Spanish state
 * keys and older Catalog definitions may use their English equivalents. */
export function canonicalTicketState(value: string): string {
  const key = labelToApi(value);
  const aliases: Record<string, string> = {
    open: 'abierto',
    opened: 'abierto',
    in_progress: 'en_progreso',
    resolved: 'resuelto',
    closed: 'cerrado',
    reopened: 'reabierto',
    pending: 'en_espera',
    pending_review: 'en_espera',
    waiting: 'en_espera',
    on_hold: 'en_espera',
  };
  return aliases[key] ?? key;
}

export function ticketStatesMatch(left: string, right: string): boolean {
  return canonicalTicketState(left) === canonicalTicketState(right);
}
function priorityFromApi(value: string): string {
  const labels: Record<string, string> = { baja: 'Low', media: 'Medium', alta: 'High', critica: 'Critical' };
  return labels[labelToApi(value)] ?? labelFromApi(value);
}
// Exported: CatalogForm's create-time submission needs this same
// English-label-to-Spanish-wire-value mapping to send a catalog "priority"
// field's selection into crearEntidadRequest.Prioridad ("prioridad" on the
// wire) — the same native ticket field this converts for every other
// priority-touching call in this file.
export function priorityToApi(value: string): string {
  const values: Record<string, string> = { low: 'baja', medium: 'media', high: 'alta', critical: 'critica' };
  const normalized = labelToApi(value);
  return values[normalized] ?? normalized;
}

function toTicket(ticket: ApiTicket): Ticket {
  return {
    id: ticket.id,
    entityId: ticket.entityId,
    title: ticket.title,
    description: ticket.description,
    status: statusFromApi(ticket.status),
    priority: priorityFromApi(ticket.priority),
    category: ticket.category,
    // This legacy shape carries only already-resolved names, no ids — the
    // deprecated `createTicket()` below is this DTO's sole caller, and it
    // has no live UI caller of its own (see that function's doc comment).
    requesterId: '',
    requesterDisplayName: ticket.requesterName || USER_UNAVAILABLE_LABEL,
    assigneeId: null,
    assigneeDisplayName: ticket.assigneeName,
    assigneeTeamName: null,
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
 * - `requesterId` <- `creadorId` (the canonical id, for commands/auditing
 *   only); `requesterDisplayName` <- `creadorNombre`, resolved server-side
 *   (snapshot at creation from the JWT, or the local identity projection for
 *   a historical ticket) and never a raw id — a safe "Usuario no disponible"
 *   fallback applies here when the backend couldn't resolve one either
 *   (Ticket identity presentation; see `resolveAssigneeIdentity` for the
 *   symmetric assignee logic).
 * - `assigneeId`/`assigneeDisplayName`/`assigneeTeamName` <- `assignment`
 *   (the canonical organizational assignment, WITH a resolved name) when
 *   present, falling back to the LEGACY first responsible
 *   (`primerResponsableId`/`agenteItId`, resolved via
 *   `primerResponsableNombre`) only when there is no organizational
 *   assignment at all. A team-only organizational assignment (no
 *   `assigneeUserId`) surfaces as `assigneeTeamName`, never as unassigned.
 * - `assetId` <- `recursoId`: despite the field name, this is the ticket's
 *   mandatory Recurso reference (ADR-0001), NOT an Asset/"Ítem de
 *   inventario" — those are two distinct aggregates with different owners
 *   and lifecycles (see `Docs/glossary.md`: Recurso = SIG-Desk's own
 *   record, adquisición→en uso→mantenimiento→baja; Asset = a read
 *   projection of a SIGInventory-owned config item, active/inactive/
 *   unavailable/retired). `assetId` is the wire/type name inherited from
 *   before that distinction was written down — it still resolves against
 *   `resource_service`'s Recurso data, never the Asset projection. Do not
 *   point this field at `/assets/*` or asset-typed data.
 * - `title`/`description` <- the dynamic `data` bag, with a fallback: they are
 *   catalog fields, so a Definition without them is legitimate. `title` never
 *   becomes undefined, since search and the table title both index it.
 * - `site` stays optional because it is definition/resource data, not a fixed
 *   Ticket aggregate property. Merge metadata is projected explicitly by the
 *   collaboration repository.
 */
function toTicketFromEntityRecord(record: TicketEntityRecord): Ticket {
  const data = record.data ?? {};
  return {
    id: record.id,
    humanId: record.humanId,
    entityId: record.id,
    title: dataString(data, ['title', 'titulo', 'asunto']) ?? '(Untitled)',
    description: dataString(data, ['description', 'descripcion']) ?? '',
    // Both conversions are guarded: a single throw inside this mapper would
    // take down the whole list with "Could not load tickets", so a missing
    // value degrades to an empty cell instead.
    status: record.state ? statusFromApi(record.state) : '',
    priority: record.prioridad ? priorityFromApi(record.prioridad) : '',
    category: record.entityKey,
    requesterId: record.creadorId ?? '',
    requesterDisplayName: record.creadorNombre || USER_UNAVAILABLE_LABEL,
    ...resolveAssigneeIdentity(record),
    createdAt: record.createdAt,
    assetId: record.recursoId || undefined,
    site: undefined,
    mergedCount: record.mergedCount ?? 0,
    mergedIntoId: record.mergedIntoId ?? null,
    assetContext: record.assetContext,
  };
}

/**
 * The backend applies status, priority, assignee, unassigned, q, mergedInto
 * and createdBy before cursor pagination. This second pass is intentionally
 * defensive and also handles presentation-only category/site filters; it
 * must never be treated as the source of global counts. createdByMe has no
 * client-side re-check here (unlike the others) — the backend resolves "me"
 * from the verified session itself, and there is deliberately no
 * client-visible id to compare against.
 */
function applyClientFilters(items: Ticket[], filters: TicketFilters): Ticket[] {
  const q = filters.q?.trim().toLowerCase();
  return items.filter((ticket) => {
    if (filters.status && ticket.status !== filters.status) return false;
    if (filters.priority && ticket.priority !== filters.priority) return false;
    if (filters.category && ticket.category !== filters.category) return false;
    if (filters.site && ticket.site !== filters.site) return false;
    if (filters.assignee && ticket.assigneeId !== filters.assignee) return false;
    if (filters.unassigned && ticket.assigneeId) return false;
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

/**
 * `signal` is TanStack Query's per-query AbortSignal (passed through from
 * `useTickets`'s `queryFn`), not a caller-owned one — forwarding it into
 * `apiRequest` (which already accepts arbitrary `RequestInit`, `signal`
 * included) is what makes an in-flight list request actually abort when
 * the component unmounts or the query is superseded, instead of running to
 * completion and having its result silently discarded.
 */
export async function listTickets(filters: TicketFilters = {}, signal?: AbortSignal): Promise<TicketPage> {
  const params = new URLSearchParams();
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.status) params.set('status', statusToApi(filters.status));
  if (filters.priority) params.set('priority', priorityToApi(filters.priority));
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.unassigned) params.set('unassigned', 'true');
  if (filters.createdByMe) params.set('createdBy', 'me');
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.mergedInto) params.set('mergedInto', filters.mergedInto);
  if (filters.assetId) params.set('assetId', filters.assetId);
  const query = params.toString();

  const response = await apiRequest<TicketEntityListResponse>(
    `/entities/${TICKET_ENTITY_KEY}${query ? `?${query}` : ''}`,
    { signal },
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
  options: {
    transitionKey?: string;
    motivo?: string;
    justificacionIncumplimientoSla?: string;
  } = {},
): Promise<Ticket> {
  void actorName; // actor identity comes exclusively from the SIG-DESK JWT.
  const transition = options.transitionKey
    ? { key: options.transitionKey } as LifecycleTransitionDefinition
    : await transitionForTarget(id, status);
  return executeTicketTransition(id, transition.key, {
    motivo: options.motivo,
    justificacionIncumplimientoSla: options.justificacionIncumplimientoSla,
  });
}

/**
 * Legacy IT-agent assignment path. Still used by a couple of call sites that
 * haven't moved to the organizational picker yet — new UI should call
 * `assignTicketOrganizational` below instead, which is what the beta UX
 * foundation pass introduced to close the debt this comment used to
 * describe (a `window.prompt` collecting a raw agent id).
 *
 * «Take a ticket» stays two explicit commands, in this order (ADR-0040):
 *   1. assign         POST /tickets/{id}/asignar
 *   2. start work     POST /entities/INC/{id}/transitions/{key}
 * so assigning never silently reopens or reassigns work, and starting work
 * never silently assigns it.
 */
export async function assignTicket(
  id: string,
  assigneeName: string | null,
  actorName?: string,
  transitionKey?: string,
): Promise<Ticket> {
  void actorName;
  if (!assigneeName?.trim()) {
    throw new Error('You must select an agent to assign the ticket.');
  }

  // 1) Asignar. Comando propio, con su propia ruta y su propia autorización.
  await apiRequest<unknown>(`/tickets/${encodeURIComponent(id)}/asignar`, {
    method: 'POST',
    body: JSON.stringify({ agenteItId: assigneeName.trim(), tipo: 'manual' }),
  });

  // 2) Iniciar trabajo. Se resuelve la transición DESPUÉS de asignar: el paso
  // anterior pudo mover el estado, y buscarla antes daría una transición que ya
  // no parte del estado actual.
  const transition = transitionKey
    ? ({ key: transitionKey } as LifecycleTransitionDefinition)
    : await transitionForTargetOrNull(id, 'In Progress');
  if (!transition) {
    // El ticket ya está en progreso: el trabajo empezó y no hay nada que
    // ejecutar. Se devuelve el estado real en vez de inventar un error.
    return getTicket(id);
  }
  return executeTicketTransition(id, transition.key, {});
}

/**
 * Real organizational assignment: department → team → assignee, resolved
 * against Organization's directory (`AssignmentPicker`) instead of a
 * `window.prompt` collecting a technical id. Same two-command composition as
 * the legacy path above — assign, then separately try to start work — kept
 * as two calls for the same reason: assigning must never silently move the
 * ticket's state.
 */
export async function assignTicketOrganizational(
  id: string,
  target: { departmentId: string; teamId: string; assigneeId?: string },
  options: { overwriteExisting?: boolean; startWork?: boolean } = {},
): Promise<Ticket> {
  await apiRequest<unknown>(`/entities/${TICKET_ENTITY_KEY}/${encodeURIComponent(id)}/assignment`, {
    method: 'POST',
    body: JSON.stringify({
      department_id: target.departmentId,
      team_id: target.teamId,
      assignee_user_id: target.assigneeId || undefined,
      overwrite_existing: options.overwriteExisting ?? false,
    }),
  });

  if (options.startWork === false) {
    return getTicket(id);
  }

  const transition = await transitionForTargetOrNull(id, 'In Progress');
  if (!transition) {
    // Already in progress, or the historical definition doesn't offer that
    // transition from here — either way, assignment already succeeded.
    return getTicket(id);
  }
  return executeTicketTransition(id, transition.key, {});
}

/**
 * Como `transitionForTarget`, pero devuelve null en vez de lanzar cuando la
 * definición no ofrece esa transición desde el estado actual.
 *
 * Lo necesita la composición de «tomar un ticket»: tras asignar, el ticket
 * puede estar YA en progreso, y ahí «no hay transición» es el resultado
 * correcto, no un fallo que haya que mostrarle a nadie.
 */
async function transitionForTargetOrNull(
  id: string,
  targetStatus: TicketStatus,
): Promise<LifecycleTransitionDefinition | null> {
  try {
    return await transitionForTarget(id, targetStatus);
  } catch {
    return null;
  }
}

interface ExecuteTransitionPayload {
  agenteItId?: string;
  tipoAsignacion?: 'manual' | 'automatica';
  justificacionIncumplimientoSla?: string;
  motivo?: string;
}

async function transitionForTarget(id: string, targetStatus: TicketStatus): Promise<LifecycleTransitionDefinition> {
  const ticket = await getTicket(id);
  if (!ticket.entityId) throw new Error('This ticket is not linked to a catalog definition.');
  const definition = await getResolvedDefinition(TICKET_ENTITY_KEY, ticket.entityId);
  const transition = definition.lifecycle.transitions.find(
    (candidate) => ticketStatesMatch(candidate.from, ticket.status) && ticketStatesMatch(candidate.to, targetStatus),
  );
  if (!transition) {
    throw new Error(`The historical definition doesn't allow moving from "${ticket.status}" to "${targetStatus}".`);
  }
  return transition;
}

async function executeTicketTransition(
  id: string,
  transitionKey: string,
  payload: ExecuteTransitionPayload,
): Promise<Ticket> {
  const record = await apiRequest<TicketEntityRecord>(
    `/entities/${TICKET_ENTITY_KEY}/${encodeURIComponent(id)}/transitions/${encodeURIComponent(transitionKey)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return toTicketFromEntityRecord(record);
}

export async function mergeTickets(
  primaryId: string,
  mergedIds: string[],
  actorName?: string,
): Promise<Ticket> {
  void actorName;
  await apiRequest<void>(`/tickets/${primaryId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ mergedIds }),
  });
  return getTicket(primaryId);
}

export async function unmergeTicket(
  primaryId: string,
  mergedId: string,
  actorName?: string,
): Promise<Ticket> {
  void actorName;
  await apiRequest<void>(`/tickets/${primaryId}/unmerge/${mergedId}`, { method: 'POST' });
  return getTicket(primaryId);
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
    const payload: { error?: string; message?: string } = await response
      .json()
      .catch(() => ({ error: 'The server returned an unexpected response.' }));
    throw new Error(payload.message || payload.error || `Upload failed with status ${response.status}.`);
  }
  return response.json() as Promise<TicketAttachment>;
}

export async function downloadAttachment(attachmentId: string, fileName: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/attachments/${attachmentId}/download`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Couldn't download the attachment (${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
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
