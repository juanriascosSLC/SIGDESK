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

export interface Ticket {
  id: string;
  entityId?: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  requester: string;
  assignee: string | null;
  createdAt: string;
  assetId?: string;
  site?: string;
  mergedCount?: number;
  mergedIntoId?: string | null;
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
