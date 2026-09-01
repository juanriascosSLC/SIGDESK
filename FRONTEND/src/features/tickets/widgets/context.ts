import type { ReactNode } from 'react';
import type { EntityRelation, FieldDefinition, StakeholderDirectory } from '@/features/catalog/metamodel';
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
  /** Domain owner of the record being rendered. The visual runtime is shared,
   * but every widget still delegates to its owning module. */
  entityKey: string;
  preview: boolean;
  ticket: Ticket;
  currentUserName: string;
  can: (permission: string) => boolean;
  onNavigate: (path: string) => void;

  fields: FieldDefinition[];
  entityData: Record<string, unknown>;
  fieldsLoading: boolean;
  fieldsError: boolean;

  assets: {
    siteAssetId?: string;
    links: NonNullable<Ticket['assetContext']>['links'];
  };

  sla: {
    assessment?: SlaAssessment;
    loading: boolean;
  };

  attachments: {
    items: TicketAttachment[];
    canUpload: boolean;
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
    canComment: boolean;
    canAddInternalNote: boolean;
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

  stakeholders: {
    userIds: string[];
    unitIds: string[];
    directory?: StakeholderDirectory;
    loading: boolean;
  };

  relations: {
    items: EntityRelation[];
    linkedProblemIds: Set<string>;
    management?: ReactNode;
    canDelete?: (relation: EntityRelation) => boolean;
    onDelete?: (relationId: string) => void;
  };

  changeTasks?: {
    canManage: boolean;
  };

  actions: {
    isEditingFields: boolean;
    onStartEditingFields: () => void;
    canEditFields: boolean;
    canAssign: boolean;
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
    onOpenChangeDialog: () => void;
    canCreateChange: boolean;
    isWatching: boolean;
    watchersCount: number;
    onToggleWatch: () => void;
    onResolve: () => void;
    // True only when the historical lifecycle exposes a transition to the
    // runtime's resolved state. A green button must never bypass metadata.
    canResolve: boolean;
    // Only true when the ticket's historical lifecycle actually declares a
    // transition from its current state to "open".
    canReopen: boolean;
    onReopen: () => void;
  };
}
