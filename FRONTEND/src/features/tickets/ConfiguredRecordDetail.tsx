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
    requester: value('requester') || value('requestedBy') || 'Sin solicitante',
    assignee: value('assignee') || null,
    createdAt: record.createdAt,
    assetId: value('assetId') || undefined,
    site: value('site') || undefined,
  };
}

export interface ConfiguredRecordDetailProps {
  record: EntityRecord;
  specification: CatalogSpecification;
  currentUserName: string;
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
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        {notice && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{notice}</div>}
        {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
        {beforeLayout}
        <TicketPageLayout
          page={resolvePageLayout(specification, 'agent', record.entityKey)}
          context={context}
          onAssignClick={() => {}}
        />
        <div className="rounded-2xl border border-border/30 bg-surface-container-low p-4 text-xs text-on-surface-variant">
          Definición ejecutable {record.entityKey} v{record.definitionVersion} · checksum{' '}
          <span className="font-mono">{record.manifestChecksum}</span>
        </div>
      </div>
    </div>
  );
}
