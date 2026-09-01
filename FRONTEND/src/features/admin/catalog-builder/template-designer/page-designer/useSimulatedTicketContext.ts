import { useState } from 'react';
import type { CatalogSpecification, FieldDefinition } from '@/features/catalog/metamodel';
import type { SlaAssessment } from '@/features/sla/api';
import type { Ticket, TicketStatus } from '@/features/tickets/types';
import type { TicketPageContext } from '@/features/tickets/widgets/context';

function sampleValue(field: FieldDefinition): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'boolean') return false;
  if (field.type === 'select') return field.options?.[0]?.value ?? '';
  return '';
}

const SAMPLE_TICKET: Ticket = {
  id: 'INC-0001',
  entityId: 'sample-entity',
  title: 'Ticket de ejemplo',
  description: 'Descripción de ejemplo para la vista previa.',
  status: 'Open',
  priority: 'High',
  category: 'hardware',
  requester: 'Ana Martínez',
  assignee: 'Carlos Ruiz',
  createdAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
  assetId: 'CAM-0001',
  site: 'Sitio de ejemplo',
  mergedCount: 0,
};

const SAMPLE_SLA: SlaAssessment = {
  entityId: 'sample-entity',
  humanId: SAMPLE_TICKET.id,
  policyId: 'sla-ejemplo',
  policyVersion: 1,
  priority: 'High',
  startedAt: new Date(Date.now() - 3_600_000).toISOString(),
  responseDueAt: new Date(Date.now() + 1_800_000).toISOString(),
  resolutionDueAt: new Date(Date.now() + 7_200_000).toISOString(),
  responseBreached: false,
  resolutionBreached: false,
  lastEventId: 'sample-event',
};

// Builds a fully working TicketPageContext backed by sample data instead of
// live queries — used by both the designer canvas (so real widgets can be
// rendered WYSIWYG while editing) and the template preview modal. No network
// calls, no persistence; every handler is a local no-op/state update.
export interface SimulatedTicketContext {
  context: TicketPageContext;
  /** The sample values behind the context, so a surface-agnostic caller (the
   *  preview modal) can render editors for them without knowing where this
   *  particular context keeps them. */
  sampleData: Record<string, unknown>;
  setFieldSampleValue: (key: string, value: unknown) => void;
}

export function useSimulatedTicketContext(
  specification: CatalogSpecification,
  entityKey = 'INC',
): SimulatedTicketContext {
  const [sampleData, setSampleData] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(specification.fields.map((field) => [field.key, sampleValue(field)])),
  );
  const [activityTab, setActivityTab] = useState<'all' | 'comments' | 'history'>('all');
  const [commentBody, setCommentBody] = useState('');
  const [status, setStatus] = useState<TicketStatus>('Open');
  const [isWatching, setIsWatching] = useState(false);

  function setFieldSampleValue(key: string, value: unknown) {
    setSampleData((current) => ({ ...current, [key]: value }));
  }

  const context: TicketPageContext = {
    entityKey,
    preview: true,
    ticket: {
      ...SAMPLE_TICKET,
      id: `${entityKey}-0001`,
      humanId: `${entityKey}-0001`,
      title: String(sampleData.title || `${entityKey} de ejemplo`),
      description: String(sampleData.description || SAMPLE_TICKET.description),
      status,
    },
    currentUserName: 'Vista previa',
    can: () => true,
    onNavigate: () => {},
    fields: specification.fields,
    entityData: sampleData,
    fieldsLoading: false,
    fieldsError: false,
    assets: {
      siteAssetId: '00000000-0000-0000-0000-000000000001',
      links: [
        {
          assetId: '00000000-0000-0000-0000-000000000001',
          role: 'site',
          snapshot: { displayName: 'Sitio de ejemplo', assetType: 'site', status: 'active' },
        },
        {
          assetId: '00000000-0000-0000-0000-000000000002',
          role: 'affected',
          snapshot: { displayName: 'Cámara CAM-0001', assetType: 'camera', manufacturer: 'Hikvision', model: 'DS-2CD', ipAddress: '10.10.1.25', status: 'online' },
        },
      ],
    },
    sla: { assessment: SAMPLE_SLA, loading: false },
    attachments: {
      items: [
        {
          id: 'sample-attachment-1',
          ticketId: SAMPLE_TICKET.id,
          uploaderName: 'Ana Martínez',
          fileName: 'evidencia.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 245_000,
          createdAt: new Date().toISOString(),
        },
      ],
      canUpload: true,
      onUpload: () => {},
      onTriggerPicker: () => {},
      uploadPending: false,
    },
    activity: {
      timeline: [],
      entries: [],
      tab: activityTab,
      onTabChange: setActivityTab,
      loading: false,
      canComment: true,
      canAddInternalNote: true,
      commentBody,
      onCommentBodyChange: setCommentBody,
      onSubmitComment: () => setCommentBody(''),
      commentPending: false,
    },
    mergedTickets: { items: [], loading: false, onUnmerge: () => {}, canUnmerge: false },
    stakeholders: {
      userIds: ['user-ana'],
      unitIds: ['unit-services'],
      directory: {
        units: [{ id: 'unit-services', name: 'Servicios', departmentId: 'department-services' }],
        users: [{ id: 'user-ana', name: 'Ana Martínez', email: 'ana@sig.systems', unitId: 'unit-it' }],
      },
      loading: false,
    },
    relations: { items: [], linkedProblemIds: new Set() },
    changeTasks: entityKey === 'RFC' ? { canManage: false } : undefined,
    actions: {
      isEditingFields: false,
      onStartEditingFields: () => {},
      canEditFields: true,
      canAssign: entityKey === 'INC',
      onAssign: () => {},
      onStatusChange: setStatus,
      statusOptions: ['Open', 'In Progress', 'Pending Review', 'Resolved', 'Closed'],
      canChangeStatus: true,
      updateStatusPending: false,
      onMerge: () => {},
      canMerge: true,
      onOpenProblemDialog: () => {},
      canManageProblem: true,
      onOpenChangeDialog: () => {},
      canCreateChange: entityKey === 'INC',
      isWatching,
      watchersCount: isWatching ? 1 : 0,
      onToggleWatch: () => setIsWatching((current) => !current),
      onResolve: () => setStatus('Resolved'),
      canResolve: status !== 'Resolved' && status !== 'Closed',
      canReopen: status === 'Resolved' || status === 'Closed',
      onReopen: () => setStatus('Open'),
    },
  };

  return { context, sampleData, setFieldSampleValue };
}
