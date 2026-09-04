// A ticket's lifecycle and its priority options are declared in the
// published catalog Definition, which an admin edits from the Catalog
// Builder. Neither can be a closed union here: an admin can legitimately
// define states like "On Hold" or extra priorities, and the UI has to
// render them instead of showing a blank. KNOWN_* only drives ordering and
// styling of the states we have explicit design for.
export type TicketStatus = string;
export type TicketPriority = string;

export const KNOWN_TICKET_STATUSES = [
  'Open',
  'In Progress',
  'Pending Review',
  'Resolved',
  'Closed',
] as const;

export const KNOWN_TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

/**
 * The organizational assignment (department -> team -> optional person) as
 * exposed by `GET /entities/INC` — see tickets_service's `assignmentDTO`.
 * Absent on a historical ticket that predates organizational assignment, or
 * one that has never been assigned that way.
 */
export interface TicketAssignment {
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
}

export interface Ticket {
  /**
   * Internal id (tickets.id BIGINT, serialized as a string). This is what
   * `/app/tickets/:id` and every per-ticket endpoint take.
   */
  id: string;
  /**
   * Human-facing number ("INC-000123"). Display only — never a path segment,
   * since the backend parses ticket ids as int64. Optional because the legacy
   * `GET /tickets` shape has no equivalent field.
   */
  humanId?: string;
  entityId?: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  /**
   * Canonical requester identifier (organization_service usuario_id). Use
   * this for commands, filtering and auditing — never render it directly as
   * the visible label (Ticket identity presentation).
   */
  requesterId: string;
  /**
   * Trusted display name for the requester, already resolved with a safe
   * fallback ("Usuario no disponible" when it can't be resolved) — safe to
   * render directly in every surface, and never a raw id.
   */
  requesterDisplayName: string;
  /**
   * Canonical assignee identifier: a PERSON id, either the organizational
   * assignee (`assignment.assigneeUserId`) or, for a historical ticket with
   * no organizational assignment, the legacy first-responsible AgenteIT's
   * user. `null` when nobody is individually assigned (team-only or fully
   * unassigned) — use for commands/filtering/auditing, never render this id
   * directly.
   */
  assigneeId: string | null;
  /**
   * Trusted display name of the individually assigned person, already
   * resolved with a safe fallback, or `null` when nobody is individually
   * assigned. Never a raw id.
   */
  assigneeDisplayName: string | null;
  /**
   * Populated only for a TEAM-ONLY organizational assignment — a
   * department/team destination with no individual assigned yet. Lets a
   * surface say "assigned to the X team" instead of falsely reading
   * "Unassigned" (requirement: a team-only assignment must never read as
   * unassigned).
   */
  assigneeTeamName: string | null;
  /** The full organizational assignment, when the ticket has one — needed by
   *  surfaces that want department/team context beyond the flat display
   *  fields above. */
  assignment?: TicketAssignment;
  createdAt: string;
  assetId?: string;
  site?: string;
  mergedCount?: number;
  mergedIntoId?: string | null;
  assetContext?: TicketAssetContext;
}

export interface TicketAssetLink {
  assetId: string;
  role?: string;
  snapshot: Record<string, unknown>;
}

export interface TicketAssetContext {
  siteAssetId?: string;
  links: TicketAssetLink[];
}

export interface CreateTicketInput {
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  requesterName?: string;
  assetId?: string;
  site?: string;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: string;
  site?: string;
  assignee?: string;
  unassigned?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
  mergedInto?: string;
  assetId?: string;
  /**
   * "My Tickets" — maps to `GET /entities/INC?createdBy=me`. The backend
   * only ever accepts the literal `createdBy=me` and resolves it itself
   * against the authenticated session; there is no way to pass an
   * arbitrary user id here, by design (see the backend's
   * entidades_controller.go — a non-"me" value is a 400, not a filter).
   * Applies server-side, before pagination, so it's correct to combine
   * with `q`/`cursor`/`limit` like any other filter.
   */
  createdByMe?: boolean;
}

export interface TicketPage {
  items: Ticket[];
  nextCursor: string;
  hasMore: boolean;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  uploaderName: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TicketWatcher {
  ticketId: string;
  watcherName: string;
  createdAt: string;
}

export type ActivityKind =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'commented'
  | 'attached'
  | 'merged'
  | 'unmerged'
  | 'watcher_added'
  | 'watcher_removed'
  | 'fields_updated';

type ActivityPayloadBase = Record<string, unknown>;

export type TicketActivityPayloadV1 = ActivityPayloadBase & (
  | { priority?: string; category?: string }
  | { from: string; to: string; source?: string }
  | { assigneeName: string | null }
  | { isInternal: boolean }
  | { fileName: string; sizeBytes: number }
  | { mergedIds: string[]; mergedInto?: never }
  | { mergedInto: string; mergedIds?: never }
  | { unmergedId: string; unmergedFrom?: never }
  | { unmergedFrom: string; unmergedId?: never }
  | { fields: string[] }
  | Record<string, never>
);

export interface TicketActivityEntry {
  id: string;
  ticketId: string;
  kind: ActivityKind;
  contractVersion: 1;
  actorName: string | null;
  payload: TicketActivityPayloadV1;
  createdAt: string;
}
