import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  addComment,
  addWatcher,
  assignTicket,
  assignTicketOrganizational,
  createTicket,
  getTicket,
  listActivity,
  listAttachments,
  listComments,
  listTickets,
  listWatchers,
  mergeTickets,
  removeWatcher,
  unmergeTicket,
  updateTicketStatus,
  uploadAttachment,
} from './api';
import type { CreateTicketInput, TicketFilters, TicketStatus } from './types';

export const ticketKeys = {
  all: ['tickets'] as const,
  list: (filters: TicketFilters) => ['tickets', 'list', filters] as const,
  detail: (id: string) => ['tickets', id] as const,
  comments: (id: string) => ['tickets', id, 'comments'] as const,
  attachments: (id: string) => ['tickets', id, 'attachments'] as const,
  watchers: (id: string) => ['tickets', id, 'watchers'] as const,
  activity: (id: string) => ['tickets', id, 'activity'] as const,
};

export function useTickets(filters: TicketFilters = {}) {
  return useQuery({
    queryKey: ticketKeys.list(filters),
    // Forwards TanStack Query's own AbortSignal so a superseded or
    // unmounted request actually cancels at the network level instead of
    // running to completion with its result discarded.
    queryFn: ({ signal }) => listTickets(filters, signal),
    // Only `cursor`/`limit` reach the server now — every other filter is
    // applied to the page inside listTickets (see its comments), so a filter
    // change still needs a new query key even though the request URL is
    // identical. keepPreviousData is what stops that from blanking the table
    // into a full-page skeleton on each keystroke of the search box, and it
    // does the same for cursor paging.
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id?: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id || ''),
    queryFn: () => getTicket(id!),
    enabled: Boolean(id),
  });
}

function useInvalidateTicket() {
  const queryClient = useQueryClient();
  return (ticket: { id: string }) => {
    // The mutation's own response is always the freshest value for this
    // ticket's detail — write it directly instead of also invalidating it.
    // Invalidating this exact key used to trigger a background refetch that
    // can race a RAPID subsequent mutation: if that refetch (fetched before
    // the second mutation ran) resolves after the second mutation's own
    // setQueryData call, it silently overwrites fresh data with stale data.
    // Everything else under 'tickets' (lists, activity, comments, ...) isn't
    // written here, so it still needs a real invalidate+refetch — just
    // scoped away from this exact key so it can never race with it.
    queryClient.setQueryData(ticketKeys.detail(ticket.id), ticket);
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'tickets' &&
        !(query.queryKey.length === 2 && query.queryKey[1] === ticket.id),
    });
  };
}

export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTicketInput) => createTicket(input),
    onSuccess: (ticket) => {
      queryClient.setQueryData(ticketKeys.detail(ticket.id), ticket);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: ({ id, status, actorName, transitionKey, motivo, justificacionIncumplimientoSla }: {
      id: string;
      status: TicketStatus;
      actorName?: string;
      transitionKey?: string;
      motivo?: string;
      justificacionIncumplimientoSla?: string;
    }) => updateTicketStatus(id, status, actorName, { transitionKey, motivo, justificacionIncumplimientoSla }),
    onSuccess: (ticket) => {
      invalidate(ticket);
      if (ticket.entityId) {
        void queryClient.invalidateQueries({
          queryKey: ['sla-assessment', ticket.entityId],
        });
      }
    },
  });
}

export function useAssignTicket() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: ({ id, assigneeName, actorName, transitionKey }: {
      id: string;
      assigneeName: string | null;
      actorName?: string;
      transitionKey?: string;
    }) => assignTicket(id, assigneeName, actorName, transitionKey),
    onSuccess: invalidate,
  });
}

/** Real organizational assignment (department -> team -> assignee) —
 *  replaces the `window.prompt` collecting a raw agent id. */
export function useAssignTicketOrganizational() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: ({ id, target, overwriteExisting, startWork }: {
      id: string;
      target: { departmentId: string; teamId: string; assigneeId?: string };
      overwriteExisting?: boolean;
      startWork?: boolean;
    }) => assignTicketOrganizational(id, target, { overwriteExisting, startWork }),
    onSuccess: invalidate,
  });
}

export function useMergeTickets() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: ({ primaryId, mergedIds, actorName }: { primaryId: string; mergedIds: string[]; actorName?: string }) =>
      mergeTickets(primaryId, mergedIds, actorName),
    onSuccess: invalidate,
  });
}

export function useUnmergeTicket() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: ({ primaryId, mergedId, actorName }: { primaryId: string; mergedId: string; actorName?: string }) =>
      unmergeTicket(primaryId, mergedId, actorName),
    onSuccess: invalidate,
  });
}

export function useComments(ticketId?: string) {
  return useQuery({
    queryKey: ticketKeys.comments(ticketId || ''),
    queryFn: () => listComments(ticketId!),
    enabled: Boolean(ticketId),
  });
}

export function useAddComment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { authorName: string; body: string; isInternal: boolean }) =>
      addComment(ticketId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.comments(ticketId) });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(ticketId) });
    },
  });
}

export function useAttachments(ticketId?: string) {
  return useQuery({
    queryKey: ticketKeys.attachments(ticketId || ''),
    queryFn: () => listAttachments(ticketId!),
    enabled: Boolean(ticketId),
  });
}

export function useUploadAttachment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, uploaderName }: { file: File; uploaderName: string }) =>
      uploadAttachment(ticketId, file, uploaderName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.attachments(ticketId) });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(ticketId) });
    },
  });
}

export function useWatchers(ticketId?: string) {
  return useQuery({
    queryKey: ticketKeys.watchers(ticketId || ''),
    queryFn: () => listWatchers(ticketId!),
    enabled: Boolean(ticketId),
  });
}

export function useAddWatcher(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (watcherName: string) => addWatcher(ticketId, watcherName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.watchers(ticketId) });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(ticketId) });
    },
  });
}

export function useRemoveWatcher(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (watcherName: string) => removeWatcher(ticketId, watcherName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.watchers(ticketId) });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(ticketId) });
    },
  });
}

export function useActivity(ticketId?: string) {
  return useQuery({
    queryKey: ticketKeys.activity(ticketId || ''),
    queryFn: () => listActivity(ticketId!),
    enabled: Boolean(ticketId),
  });
}
