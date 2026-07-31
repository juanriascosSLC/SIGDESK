import type { EntityRelation, FieldDefinition } from '@/features/catalog/metamodel';
import type { SlaAssessment } from '@/features/sla/api';
import type { Ticket, TicketActivityEntry, TicketAttachment, TicketComment, TicketStatus } from '../types';

export type TimelineItem =
  | { kind: 'activity'; createdAt: string; entry: TicketActivityEntry }
  | { kind: 'comment'; createdAt: string; comment: TicketComment };

// Everything a ticket-detail widget needs, already resolved by whoever builds
// it — TicketDetail.tsx builds this from its live React Query hooks/
// mutations; PageTemplatePreview (Catalog Builder) builds a simulated version
// with sample data and no-op handlers. Widgets never fetch their own data —
// this is what lets `runtime` and `preview` render the exact same components.
export interface TicketPageContext {
  ticket: Ticket;
  currentUserName: string;
  can: (permission: string) => boolean;
  onNavigate: (path: string) => void;

  fields: FieldDefinition[];
  entityData: Record<string, unknown>;
  fieldsLoading: boolean;
  fieldsError: boolean;

  sla: {
    assessment?: SlaAssessment;
    loading: boolean;
  };

  attachments: {
    items: TicketAttachment[];
    onUpload: (files: FileList | null) => void;
    onTriggerPicker: () => void;
    uploadPending: boolean;
    uploadError?: string;
  };

  activity: {
    timeline: TimelineItem[];
    entries: TicketActivityEntry[];
    tab: 'all' | 'comments' | 'history';
    onTabChange: (tab: 'all' | 'comments' | 'history') => void;
    loading: boolean;
    commentBody: string;
    onCommentBodyChange: (value: string) => void;
    onSubmitComment: (isInternal: boolean) => void;
    commentPending: boolean;
    commentError?: string;
  };

  mergedTickets: {
    items: Ticket[];
    loading: boolean;
    onUnmerge: (id: string) => void;
    canUnmerge: boolean;
  };

  relations: {
    items: EntityRelation[];
    linkedProblemIds: Set<string>;
  };

  actions: {
    isEditingFields: boolean;
    onStartEditingFields: () => void;
    canEditFields: boolean;
    onAssign: () => void;
    onStatusChange: (status: TicketStatus) => void;
    statusOptions: TicketStatus[];
    // False while the ticket's own historical lifecycle is still loading or
    // failed to load, or while there is none to consult — the status
    // selector must not offer transitions from KNOWN_TICKET_STATUSES that
    // the ticket's real (historical) definition version might reject.
    canChangeStatus: boolean;
    updateStatusPending: boolean;
    updateStatusError?: string;
    onMerge: () => void;
    canMerge: boolean;
    onOpenProblemDialog: () => void;
    canManageProblem: boolean;
    isWatching: boolean;
    watchersCount: number;
    onToggleWatch: () => void;
    onResolve: () => void;
    // Only true when the ticket's historical lifecycle actually declares a
    // transition from its current state to "open".
    canReopen: boolean;
    onReopen: () => void;
  };
}
