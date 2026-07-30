import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  addComment,
  addWatcher,
  assignTicket,
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
    queryFn: () => listTickets(filters),
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
    queryClient.setQueryData(ticketKeys.detail(ticket.id), ticket);
    void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
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
    mutationFn: ({ id, status, actorName }: { id: string; status: TicketStatus; actorName?: string }) =>
      updateTicketStatus(id, status, actorName),
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
    mutationFn: ({ id, assigneeName, actorName }: { id: string; assigneeName: string | null; actorName?: string }) =>
      assignTicket(id, assigneeName, actorName),
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
