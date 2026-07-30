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

const statusFromApi = labelFromApi;
const statusToApi = labelToApi;
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

function buildQuery(filters: TicketFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', statusToApi(filters.status));
  if (filters.priority) params.set('priority', priorityToApi(filters.priority));
  if (filters.category) params.set('category', filters.category);
  if (filters.site) params.set('site', filters.site);
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.unassigned) params.set('unassigned', 'true');
  if (filters.q) params.set('q', filters.q);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.mergedInto) params.set('mergedInto', filters.mergedInto);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listTickets(filters: TicketFilters = {}): Promise<TicketPage> {
  const response = await apiRequest<{ items: ApiTicket[]; nextCursor: string; hasMore: boolean }>(
    `/tickets${buildQuery(filters)}`,
  );
  return {
    items: response.items.map(toTicket),
    nextCursor: response.nextCursor,
    hasMore: response.hasMore,
  };
}

export async function getTicket(id: string): Promise<Ticket> {
  return toTicket(await apiRequest<ApiTicket>(`/tickets/${id}`));
}

/**
 * @deprecated New intake screens must use Catalog Builder's createEntity.
 * This client remains only for external/legacy callers during convergence.
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
