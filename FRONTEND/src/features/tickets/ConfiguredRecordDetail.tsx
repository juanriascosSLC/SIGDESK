import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { getStakeholderDirectory } from '@/features/catalog/metamodel';
import type {
  CatalogSpecification,
  EntityRecord,
  EntityRelation,
  TransitionDefinition,
} from '@/features/catalog/metamodel';
import { resolvePageLayout } from '@/features/catalog/runtime/page-layout-normalizer';
import type { Ticket } from './types';
import { TicketPageLayout } from './TicketPageLayout';
import type { TicketPageContext } from './widgets/context';
import { USER_UNAVAILABLE_LABEL } from './identity-labels';

// PRB (problem_service) and RFC (change_service) each now expose their own
// trusted requester identity server-side (createdBy/createdByName on
// EntityRecord — problem_service's problemDTO / change_service's
// changeDTO), resolved the same way as tickets_service's
// creadorId/creadorNombre: a JWT snapshot at creation, with a local
// identity-projection fallback for historical records. NEVER a generic
// catalog `data` field an admin happened to name "requester" — that value
// is arbitrary free text, not a governed identity, and using it as both an
// id and a display name (as this used to) was exactly the bug this fixes.
//
// Neither PRB nor RFC has an aggregate-root ASSIGNEE concept — the only
// real organizational assignment in either service lives on RFC's Task
// sub-entity (ChangeTasksBoard/MyChangeTasks already read that directly).
// Fabricating one from a catalog field would be exactly the raw-value
// leak this pass eliminates, so the synthetic ticket's assignee stays
// genuinely empty here — a page layout that places an "assignee" ticket
// field on a PRB/RFC page (unusual, but not impossible) reads "Unassigned"
// honestly instead of showing free text pretending to be an identity.
function recordAsTicket(record: EntityRecord): Ticket {
  const value = (key: string) => {
    const current = record.data[key];
    return current == null ? '' : String(current);
  };
  return {
    id: record.humanId,
    humanId: record.humanId,
    entityId: record.id,
    title: value('title') || `${record.entityKey} ${record.humanId}`,
    description: value('description'),
    status: record.state,
    priority: value('priority') || value('riskLevel'),
    category: value('category'),
    requesterId: record.createdBy ?? '',
    requesterDisplayName: record.createdByName || USER_UNAVAILABLE_LABEL,
    assigneeId: null,
    assigneeDisplayName: null,
    assigneeTeamName: null,
    createdAt: record.createdAt,
    assetId: value('assetId') || undefined,
    site: value('site') || undefined,
  };
}

export interface ConfiguredRecordDetailProps {
  record: EntityRecord;
  specification: CatalogSpecification;
  currentUserName: string;
  /** The signed-in actor's own id — see TicketPageContext.currentUserId. */
  currentUserId: string | null;
  relations: EntityRelation[];
  transitions: TransitionDefinition[];
  onTransition: (transition: TransitionDefinition) => void;
  transitionPending: boolean;
  transitionError?: string;
  canEdit: boolean;
  onEdit: () => void;
  isEditing: boolean;
  canManageChangeTasks?: boolean;
  relationManagement?: ReactNode;
  canDeleteRelation?: (relation: EntityRelation) => boolean;
  onDeleteRelation?: (relationId: string) => void;
  beforeLayout?: ReactNode;
  notice?: string;
  error?: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
}

/** Metadata-driven detail runtime shared by PRB and RFC. Domain behavior is
 * injected by the owning screen; Catalog Builder only controls placement. */
export function ConfiguredRecordDetail({
  record,
  specification,
  currentUserName,
  currentUserId,
  relations,
  transitions,
  onTransition,
  transitionPending,
  transitionError,
  canEdit,
  onEdit,
  isEditing,
  canManageChangeTasks = false,
  relationManagement,
  canDeleteRelation,
  onDeleteRelation,
  beforeLayout,
  notice,
  error,
  onBack,
  onNavigate,
}: ConfiguredRecordDetailProps) {
  const ticket = recordAsTicket(record);
  const hasStakeholders = Boolean(
    record.stakeholders && (record.stakeholders.userIds.length || record.stakeholders.unitIds.length),
  );
  const stakeholderDirectory = useQuery({
    queryKey: ['organization', 'stakeholder-directory'],
    queryFn: getStakeholderDirectory,
    enabled: hasStakeholders,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const statusOptions = [record.state, ...transitions.map((transition) => transition.to)]
    .filter((value, index, values) => values.indexOf(value) === index);

  const context: TicketPageContext = {
    entityKey: record.entityKey,
    preview: false,
    ticket,
    currentUserName,
    currentUserId,
    can: () => false,
    onNavigate,
    fields: specification.fields,
    entityData: record.data,
    fieldsLoading: false,
    fieldsError: false,
    assets: {
      siteAssetId: record.assetContext?.siteAssetId,
      links: record.assetContext?.links ?? [],
    },
    sla: { loading: false },
    attachments: {
      items: [], canUpload: false, onUpload: () => {}, onTriggerPicker: () => {}, uploadPending: false,
    },
    activity: {
      timeline: [], entries: [], tab: 'all', onTabChange: () => {}, loading: false,
      canComment: false, canAddInternalNote: false, commentBody: '', onCommentBodyChange: () => {},
      onSubmitComment: () => {}, commentPending: false,
    },
    mergedTickets: { items: [], loading: false, onUnmerge: () => {}, canUnmerge: false },
    stakeholders: {
      userIds: record.stakeholders?.userIds ?? [],
      unitIds: record.stakeholders?.unitIds ?? [],
      directory: stakeholderDirectory.data,
      loading: stakeholderDirectory.isLoading,
    },
    relations: {
      items: relations,
      linkedProblemIds: new Set(),
      management: relationManagement,
      canDelete: canDeleteRelation,
      onDelete: onDeleteRelation,
    },
    changeTasks: record.entityKey === 'RFC' ? { canManage: canManageChangeTasks } : undefined,
    actions: {
      isEditingFields: isEditing,
      onStartEditingFields: onEdit,
      canEditFields: canEdit,
      canAssign: false,
      onAssign: () => {},
      onStatusChange: (target) => {
        const transition = transitions.find((candidate) => candidate.to === target);
        if (transition) onTransition(transition);
      },
      statusOptions,
      canChangeStatus: transitions.length > 0,
      updateStatusPending: transitionPending,
      updateStatusError: transitionError,
      onMerge: () => {}, canMerge: false,
      onOpenProblemDialog: () => {}, canManageProblem: false,
      onOpenChangeDialog: () => {}, canCreateChange: false,
      isWatching: false, watchersCount: 0, onToggleWatch: () => {},
      onResolve: () => {}, canResolve: false, canReopen: false, onReopen: () => {},
    },
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest p-6 lg:p-8">
      <div className="w-full space-y-6">
        <button onClick={onBack} className="secondary-button">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {notice && <div className="rounded-2xl border border-status-success-border bg-status-success-bg p-4 text-sm text-status-success-fg">{notice}</div>}
        {error && <div className="rounded-2xl border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger-fg">{error}</div>}
        {beforeLayout}
        <TicketPageLayout
          page={resolvePageLayout(specification, 'agent', record.entityKey)}
          context={context}
          onAssignClick={() => {}}
        />
        <div className="rounded-2xl border border-border/30 bg-surface-container-low p-4 text-xs text-on-surface-variant">
          Executable definition {record.entityKey} v{record.definitionVersion} · checksum{' '}
          <span className="font-mono">{record.manifestChecksum}</span>
        </div>
      </div>
    </div>
  );
}
