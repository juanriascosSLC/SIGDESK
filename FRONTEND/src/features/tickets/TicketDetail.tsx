import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, X } from 'lucide-react';
import {
  useTicket,
  useUpdateTicketStatus,
  useAssignTicket,
  useMergeTickets,
  useUnmergeTicket,
  useComments,
  useAddComment,
  useAttachments,
  useUploadAttachment,
  useWatchers,
  useAddWatcher,
  useRemoveWatcher,
  useActivity,
  ticketKeys,
} from './hooks';
import { canonicalTicketState, listTickets, statusFromApi, statusToApi, ticketStatesMatch } from './api';
import type { TicketStatus } from './types';
import { KNOWN_TICKET_STATUSES } from './types';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/useAuth';
import { getSlaAssessment } from '@/features/sla/api';
import {
  getEntity,
  getEntityManifest,
  getStakeholderDirectory,
  isFieldRequired,
  updateEntity,
  type PageLayout,
  type PagePlacement,
} from '@/features/catalog/metamodel';
import { getResolvedDefinition } from '@/features/catalog/api';
import { CatalogFormPage } from '@/features/catalog/CatalogFormPage';
import { DynamicField } from '@/features/catalog/DynamicField';
import type { FormPageContext } from '@/features/catalog/form-widgets/context';
import {
  filterPageByFieldVisibility,
  resolveFormPageLayout,
  visiblePageFieldPlacements,
} from '@/features/catalog/runtime/form-page-normalizer';
import { parseResolvedPageLayout, synthesizePageLayoutFromLegacy } from '@/features/catalog/runtime/page-layout-normalizer';
import { listEntityRelations } from '@/features/catalog/metamodel';
import { ApiError } from '@/lib/apiClient';
import { PERMISSIONS } from '@/features/auth/permissions';
import { IncidentProblemDialog } from '@/features/problems/IncidentProblemDialog';
import { IncidentChangeDialog } from '@/features/changes/IncidentChangeDialog';
import { TicketPageLayout } from './TicketPageLayout';
import type { TicketPageContext, TimelineItem } from './widgets/context';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { displayName: currentUserName, deskUserId, can } = useAuth();
  const {
    data: ticket,
    isLoading,
    isError,
    error,
    refetch,
  } = useTicket(id);
  const updateStatus = useUpdateTicketStatus();
  const assignTicket = useAssignTicket();
  const mergeTickets = useMergeTickets();
  const unmergeTicket = useUnmergeTicket();
  const [activityTab, setActivityTab] = useState<'all' | 'comments' | 'history'>('all');
  const [commentBody, setCommentBody] = useState('');
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [editNotice, setEditNotice] = useState('');
  const [showProblemDialog, setShowProblemDialog] = useState(false);
  const [showChangeDialog, setShowChangeDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const comments = useComments(ticket?.id);
  const addComment = useAddComment(ticket?.id || '');
  const attachments = useAttachments(ticket?.id);
  const uploadAttachment = useUploadAttachment(ticket?.id || '');
  const watchers = useWatchers(ticket?.id);
  const addWatcher = useAddWatcher(ticket?.id || '');
  const removeWatcher = useRemoveWatcher(ticket?.id || '');
  const activity = useActivity(ticket?.id);
  const slaAssessment = useQuery({
    queryKey: ['sla-assessment', ticket?.entityId ?? 'unlinked'],
    queryFn: () => getSlaAssessment(ticket!.entityId!),
    enabled: Boolean(ticket?.entityId),
    refetchInterval: 30_000,
    retry: (failureCount, queryError) =>
      !(queryError instanceof ApiError && queryError.status === 404) &&
      failureCount < 2,
  });
  const entityRecord = useQuery({
    queryKey: ['catalog-entity', 'INC', ticket?.entityId ?? 'unlinked'],
    queryFn: () => getEntity('INC', ticket!.entityId!),
    enabled: Boolean(ticket?.entityId),
    retry: (failureCount, queryError) =>
      !(queryError instanceof ApiError && queryError.status === 404) &&
      failureCount < 2,
  });
  const hasStakeholders = Boolean(
    entityRecord.data?.stakeholders &&
      (entityRecord.data.stakeholders.userIds.length || entityRecord.data.stakeholders.unitIds.length),
  );
  const stakeholderDirectory = useQuery({
    queryKey: ['organization', 'stakeholder-directory'],
    queryFn: getStakeholderDirectory,
    enabled: hasStakeholders && !location.pathname.startsWith('/portal'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  // The historical manifest used at creation time governs this ticket's DATA:
  // field definitions, types, options and validation. A republish must never
  // change what the ticket means. The page layout is pinned to that same
  // immutable executable version.
  const definitionManifest = useQuery({
    queryKey: [
      'catalog-definition-manifest',
      'INC',
      entityRecord.data?.definitionVersion ?? 'unknown',
    ],
    queryFn: () => getEntityManifest('INC', ticket!.entityId!),
    enabled: Boolean(ticket?.entityId && entityRecord.data?.definitionVersion),
  });
  // Resolved definition: this call is pinned to the exact immutable
  // definition used by the record. `latest-compatible` only means that this
  // historical definition is also active; `previous-compatible` means a
  // newer active version exists. Neither mode substitutes another layout.
  const resolvedDefinition = useQuery({
    queryKey: ['resolved-definition', 'INC', ticket?.entityId ?? 'unlinked'],
    queryFn: () => getResolvedDefinition('INC', ticket!.entityId!),
    enabled: Boolean(ticket?.entityId),
    retry: (failureCount, queryError) =>
      !(queryError instanceof ApiError && queryError.status === 404) && failureCount < 2,
  });
  const entityRelations = useQuery({
    queryKey: ['catalog-entity-relations', 'INC', ticket?.entityId ?? 'unlinked'],
    queryFn: () => listEntityRelations('INC', ticket!.entityId!),
    enabled: Boolean(ticket?.entityId),
  });
  const updateEntityMutation = useMutation({
    mutationFn: ({
      entityId,
      data,
      expectedUpdatedAt,
    }: {
      entityId: string;
      data: Record<string, unknown>;
      expectedUpdatedAt: string;
    }) => updateEntity('INC', entityId, data, expectedUpdatedAt),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        ['catalog-entity', 'INC', updated.id],
        updated,
      );
      setEditData(structuredClone(updated.data));
      setIsEditingFields(false);
      setEditNotice('Los datos se guardaron. Tickets y SLA se están sincronizando.');
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
        if (ticket?.id) {
          void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(ticket.id) });
        }
        if (ticket?.entityId) {
          void queryClient.invalidateQueries({
            queryKey: ['sla-assessment', ticket.entityId],
          });
        }
      }, 1_200);
    },
  });
  const mergedTickets = useQuery({
    queryKey: ticketKeys.list({ mergedInto: ticket?.id }),
    queryFn: () => listTickets({ mergedInto: ticket!.id }),
    enabled: Boolean(ticket?.mergedCount),
  });
  const linkedProblemIds = useMemo(
    () =>
      new Set(
        (entityRelations.data ?? [])
          .filter(
            (relation) =>
              relation.sourceEntityKey === 'PRB' ||
              relation.targetEntityKey === 'PRB',
          )
          .map((relation) =>
            relation.sourceEntityKey === 'PRB'
              ? relation.sourceEntityId
              : relation.targetEntityId,
          ),
      ),
    [entityRelations.data],
  );

  const isWatching = (watchers.data ?? []).some((w) => w.watcherName === deskUserId);
  const ticketStatus = ticket?.status;
  const isEntityBacked = Boolean(ticket?.entityId);

  // For entity-backed tickets, which transitions are actually legal depends
  // on the ticket's OWN historical lifecycle (resolvedDefinition.lifecycle,
  // pinned to its definitionVersionId) — never on KNOWN_TICKET_STATUSES,
  // which is only a presentation list (Kanban columns, filters). A ticket
  // created under an older definition version may not have "closed" at all;
  // offering it and letting the backend reject it would be a lie in the UI.
  // KNOWN_TICKET_STATUSES is the fallback ONLY for legacy tickets that have
  // no entityId at all (and therefore no lifecycle to consult).
  const lifecycleTransitions = useMemo(() => {
    if (!isEntityBacked || !ticketStatus) return null;
    if (resolvedDefinition.isLoading || resolvedDefinition.isError) return null;
    const lifecycle = resolvedDefinition.data?.lifecycle;
    if (!lifecycle) return null;
    const currentBackendState = statusToApi(ticketStatus);
    return lifecycle.transitions.filter((transition) => ticketStatesMatch(transition.from, currentBackendState));
  }, [isEntityBacked, ticketStatus, resolvedDefinition.isLoading, resolvedDefinition.isError, resolvedDefinition.data]);

  const canChangeStatus = isEntityBacked ? lifecycleTransitions !== null : true;

  const statusOptions = useMemo(() => {
    if (!ticketStatus) return [] as TicketStatus[];
    if (isEntityBacked) {
      // Still loading, errored, or no lifecycle available: show only the
      // current status rather than a list the backend might reject.
      if (lifecycleTransitions === null) return [ticketStatus];
      const options = lifecycleTransitions.map((transition) => statusFromApi(transition.to));
      return options.includes(ticketStatus) ? options : [ticketStatus, ...options];
    }
    // Legacy ticket, no entityId, no lifecycle to consult: previous behavior.
    const options: TicketStatus[] = [...KNOWN_TICKET_STATUSES];
    if (!options.includes(ticketStatus)) options.push(ticketStatus);
    return options;
  }, [ticketStatus, isEntityBacked, lifecycleTransitions]);

  // Reabrir is only offered when the historical lifecycle declares it. Some
  // definitions reopen to `in_progress` rather than `open`; the backend
  // intentionally interprets any closed -> open/reopened/in_progress as the
  // Reabrir command, so the UI must use the same semantic boundary.
  const reopenTransition = lifecycleTransitions?.find(
    (transition) =>
      canonicalTicketState(transition.from) === 'cerrado' ||
      canonicalTicketState(transition.to) === 'abierto' ||
      canonicalTicketState(transition.to) === 'reabierto',
  );
  const resolveTransition = lifecycleTransitions?.find(
    (transition) => canonicalTicketState(transition.to) === 'resuelto',
  );
  const canReopen = Boolean(reopenTransition);

  const timeline: TimelineItem[] = useMemo(() => {
    const activityItems: TimelineItem[] = (activity.data ?? [])
      .filter((e) => e.kind !== 'commented')
      .map((entry) => ({ kind: 'activity', createdAt: entry.createdAt, entry }));
    const commentItems: TimelineItem[] = (comments.data ?? []).map((comment) => ({
      kind: 'comment',
      createdAt: comment.createdAt,
      comment,
    }));
    const combined =
      activityTab === 'comments' ? commentItems : activityTab === 'history' ? activityItems : [...activityItems, ...commentItems];
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activity.data, comments.data, activityTab]);

  // Metamodel 1.6: the edit form is a full page too, on the same engine as
  // the detail page it sits on. It resolves against the record's HISTORICAL
  // specification, never today's published one — editing a ticket must offer
  // the fields that ticket was created with.
  const editPage = useMemo((): PageLayout | null => {
    const specification = definitionManifest.data?.specification;
    if (!specification) return null;
    return filterPageByFieldVisibility(
      resolveFormPageLayout(specification, 'edit', 'agent'),
      specification.fields,
      editData,
    );
  }, [definitionManifest.data, editData]);

  // The resolved-definition endpoint is authoritative for the exact
  // historical layout. The manifest fallback only synthesizes definitions
  // that predate detailPage; it never merges today's published version.
  // `layouts.detail` is
  // authored either as a bare PageLayout or as `{ default: PageLayout,
  // variants?: [...] }`; both shapes are accepted here since the Catalog
  // Builder's JSON draft editor can produce either.
  const page = useMemo((): PageLayout | null => {
    const parsed = parseResolvedPageLayout(resolvedDefinition.data?.layouts);
    if (parsed) return parsed;
    const historicalSpecification = definitionManifest.data?.specification;
    return historicalSpecification ? synthesizePageLayoutFromLegacy(historicalSpecification) : null;
  }, [resolvedDefinition.data, definitionManifest.data]);

  function renderEditField(placement: PagePlacement) {
    if (!placement.fieldKey) return null;
    const field = definitionManifest.data?.specification.fields.find(
      (candidate) => candidate.key === placement.fieldKey,
    );
    if (!field) return null;
    return (
      <DynamicField
        field={placement.label ? { ...field, label: placement.label } : field}
        value={editData[field.key]}
        required={isFieldRequired(field, editData)}
        onChange={(value) => setEditData((current) => ({ ...current, [field.key]: value }))}
      />
    );
  }

  if (isLoading) {
    return <LoadingSkeleton type="detail" />;
  }

  if (isError || !ticket) {
    return (
      <EmptyState
        title="Ticket not available"
        description={error?.message || 'The requested ticket could not be found.'}
        action={
          <button
            onClick={() => void refetch()}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold"
          >
            Try again
          </button>
        }
      />
    );
  }

  function handleAssign() {
    const transition = lifecycleTransitions?.find(
      (candidate) => canonicalTicketState(candidate.to) === 'en_progreso',
    );
    if (!transition) {
      window.alert('La definición histórica no permite asignar este ticket desde su estado actual.');
      return;
    }
    const name = window.prompt('ID del agente que recibirá el ticket:', ticket!.assignee || '');
    if (name === null) return;
    assignTicket.mutate(
      { id: ticket!.id, assigneeName: name.trim() || null, actorName: currentUserName, transitionKey: transition.key },
      { onError: (err) => window.alert(err.message) },
    );
  }

  function handleStatusChange(status: TicketStatus) {
    const transition = lifecycleTransitions?.find((candidate) => ticketStatesMatch(candidate.to, status));
    if (!transition) {
      window.alert('La definición histórica no contiene esa transición para el estado actual.');
      return;
    }
    const target = canonicalTicketState(transition.to);
    const source = canonicalTicketState(transition.from);
    // Solo open -> in_progress es la asignación inicial. Reanudar desde
    // espera también termina en progreso, pero no debe pedir otro agente.
    if (source === 'abierto' && target === 'en_progreso') {
      handleAssign();
      return;
    }
    let motivo: string | undefined;
    // Una definición puede modelar reopen como closed -> in_progress. La
    // intención se reconoce por el origen cerrado, no únicamente por el
    // nombre del estado destino.
    if (source === 'cerrado' || target === 'abierto' || target === 'reabierto') {
      const value = window.prompt('Motivo de la reapertura:');
      if (value === null) return;
      motivo = value.trim();
      if (!motivo) {
        window.alert('El motivo de reapertura es obligatorio.');
        return;
      }
    }
    updateStatus.mutate(
      { id: ticket!.id, status, actorName: currentUserName, transitionKey: transition.key, motivo },
      { onError: (err) => window.alert(err.message) },
    );
  }

  function handleMerge() {
    const raw = window.prompt('Ticket IDs to merge into this one (comma separated):');
    if (!raw) return;
    const mergedIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (mergedIds.length === 0) return;
    mergeTickets.mutate(
      { primaryId: ticket!.id, mergedIds, actorName: currentUserName },
      { onError: (err) => window.alert(err.message) },
    );
  }

  function handleUnmerge(mergedId: string) {
    unmergeTicket.mutate(
      { primaryId: ticket!.id, mergedId, actorName: currentUserName },
      { onError: (err) => window.alert(err.message) },
    );
  }

  function handleFilesSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    uploadAttachment.mutate(
      { file, uploaderName: currentUserName },
      { onError: (err) => window.alert(err.message) },
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function submitComment(isInternal: boolean) {
    const body = commentBody.trim();
    if (!body) return;
    addComment.mutate(
      { authorName: currentUserName, body, isInternal },
      {
        onSuccess: () => setCommentBody(''),
        onError: (err) => window.alert(err.message),
      },
    );
  }

  function toggleWatch() {
    if (isWatching) {
      removeWatcher.mutate(currentUserName, { onError: (err) => window.alert(err.message) });
    } else {
      addWatcher.mutate(currentUserName, { onError: (err) => window.alert(err.message) });
    }
  }

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  function startEditingFields() {
    if (!entityRecord.data) return;
    setEditData(structuredClone(entityRecord.data.data));
    setEditNotice('');
    updateEntityMutation.reset();
    setIsEditingFields(true);
  }

  function submitFieldChanges(event: FormEvent) {
    event.preventDefault();
    const record = entityRecord.data;
    const specification = definitionManifest.data?.specification;
    if (!record || !specification || !editPage) return;
    // Start from the record's existing data so fields outside this edit
    // layout/audience (or conditionally hidden right now) keep their value —
    // only fields the user could actually see and edit this session are
    // touched. An explicit clear of a visible, optional field is respected.
    const data: Record<string, unknown> = { ...record.data };
    const visibleCatalogKeys = visiblePageFieldPlacements(editPage, editData)
      .filter((placement) => placement.source === 'catalog')
      .map((placement) => placement.fieldKey);
    for (const key of visibleCatalogKeys) {
      const field = specification.fields.find((candidate) => candidate.key === key);
      if (!field) continue;
      const value = editData[key];
      const required = isFieldRequired(field, editData);
      if (!required && (value === undefined || value === null || value === '')) {
        delete data[key];
        continue;
      }
      data[key] = value;
    }
    updateEntityMutation.mutate({
      entityId: record.id,
      data,
      expectedUpdatedAt: record.updatedAt,
    });
  }

  const specification = definitionManifest.data?.specification;
  const layoutResolution = resolvedDefinition.data?.layoutResolution;

  function closeEditor() {
    setIsEditingFields(false);
    updateEntityMutation.reset();
  }

  // The edit form is the same surface as the create form — same context type,
  // same renderer, same widgets — so a redesign in the Catalog Builder shows
  // up identically in both places.
  const editContext: FormPageContext | null = specification
    ? {
        entityKey: 'INC',
        kind: 'edit',
        preview: false,
        definitionName: 'Editar datos del incidente',
        definitionVersion: entityRecord.data?.definitionVersion,
        description: 'Formulario interpretado desde la definición con la que se creó este ticket.',
        humanId: ticket?.humanId ?? ticket?.id,
        fields: specification.fields,
        data: editData,
        renderField: renderEditField,
        requester: { displayName: currentUserName },
        stakeholders: {
          directory: stakeholderDirectory.data,
          loading: stakeholderDirectory.isLoading,
          value: entityRecord.data?.stakeholders ?? { userIds: [], unitIds: [] },
          readOnly: true,
          onChange: () => {},
          onRetry: () => void stakeholderDirectory.refetch(),
        },
        // A record that already exists has a real SLA assessment; the widget
        // that estimates one for a record that does not exist yet has nothing
        // to say here.
        sla: { state: 'unavailable', message: 'El SLA de un ticket existente se muestra en su propia tarjeta.', onRetry: () => {} },
        attachments: {
          items: (attachments.data ?? []).map((item) => ({
            id: item.id,
            name: item.fileName,
            size: item.sizeBytes,
            type: item.contentType,
          })),
          maxFiles: 10,
          maxBytesPerFile: 10 * 1024 * 1024,
          canRemove: false,
          onAddFiles: (files) => {
            const file = files[0];
            if (file) uploadAttachment.mutate({ file, uploaderName: currentUserName });
          },
          onRemove: () => {},
        },
        submit: {
          submitLabel: 'Guardar cambios',
          cancelLabel: 'Cancelar',
          pending: updateEntityMutation.isPending,
          errorMessage: updateEntityMutation.isError
            ? updateEntityMutation.error instanceof ApiError && updateEntityMutation.error.status === 409
              ? 'El ticket cambió mientras lo editabas. Recarga sus datos antes de volver a guardar.'
              : updateEntityMutation.error.message
            : undefined,
          onCancel: closeEditor,
          disabled: false,
        },
      }
    : null;
  const context: TicketPageContext | null = specification
    ? {
        entityKey: 'INC',
        preview: false,
        ticket,
        currentUserName,
        can,
        onNavigate: navigate,
        fields: specification.fields,
        entityData: entityRecord.data?.data ?? {},
        fieldsLoading: entityRecord.isLoading || definitionManifest.isLoading,
        fieldsError: entityRecord.isError || definitionManifest.isError,
        assets: {
          siteAssetId: ticket.assetContext?.siteAssetId,
          links: ticket.assetContext?.links ?? [],
        },
        sla: { assessment: slaAssessment.data, loading: slaAssessment.isLoading },
        attachments: {
          items: attachments.data ?? [],
          canUpload: can(PERMISSIONS.ticketsAttach),
          onUpload: handleFilesSelected,
          onTriggerPicker: triggerFilePicker,
          uploadPending: uploadAttachment.isPending,
          uploadError: uploadAttachment.error?.message,
        },
        activity: {
          timeline,
          entries: activity.data ?? [],
          tab: activityTab,
          onTabChange: setActivityTab,
          loading: activity.isLoading || comments.isLoading,
          canComment: can(PERMISSIONS.ticketsComment),
          canAddInternalNote: !location.pathname.startsWith('/portal') && can(PERMISSIONS.ticketsEdit),
          commentBody,
          onCommentBodyChange: setCommentBody,
          onSubmitComment: submitComment,
          commentPending: addComment.isPending,
          commentError: addComment.error?.message,
        },
        mergedTickets: {
          items: mergedTickets.data?.items ?? [],
          loading: mergedTickets.isLoading,
          onUnmerge: handleUnmerge,
          canUnmerge: can('sigdesk.tickets.merge'),
        },
        stakeholders: {
          userIds: entityRecord.data?.stakeholders?.userIds ?? [],
          unitIds: entityRecord.data?.stakeholders?.unitIds ?? [],
          directory: stakeholderDirectory.data,
          loading: stakeholderDirectory.isLoading,
        },
        relations: {
          items: entityRelations.data ?? [],
          linkedProblemIds,
        },
        actions: {
          isEditingFields,
          onStartEditingFields: startEditingFields,
          canEditFields: can('sigdesk.tickets.edit') && Boolean(ticket.entityId),
          canAssign: can(PERMISSIONS.ticketsAssign),
          onAssign: handleAssign,
          onStatusChange: handleStatusChange,
          statusOptions,
          canChangeStatus,
          updateStatusPending: updateStatus.isPending,
          updateStatusError: updateStatus.error?.message,
          onMerge: handleMerge,
          canMerge: can('sigdesk.tickets.merge'),
          onOpenProblemDialog: () => setShowProblemDialog(true),
          canManageProblem: Boolean(
            ticket.entityId &&
              can(PERMISSIONS.problemsView) &&
              can(PERMISSIONS.problemsCreate) &&
              can(PERMISSIONS.problemsEdit),
          ),
          onOpenChangeDialog: () => setShowChangeDialog(true),
          canCreateChange: Boolean(
            ticket.entityId && can(PERMISSIONS.ticketsEdit) && can(PERMISSIONS.changesCreate),
          ),
          isWatching,
          watchersCount: watchers.data?.length ?? 1,
          onToggleWatch: toggleWatch,
          onResolve: () => handleStatusChange(resolveTransition ? statusFromApi(resolveTransition.to) : 'Resolved'),
          canResolve: Boolean(resolveTransition),
          canReopen,
          onReopen: () => handleStatusChange(reopenTransition ? statusFromApi(reopenTransition.to) : 'Open'),
        },
      }
    : null;

  return (
    <div data-testid="ticket-detail" className="h-[calc(100vh-80px)] overflow-y-auto p-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-on-surface-variant hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Board
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => handleFilesSelected(event.target.files)}
      />

      {isEditingFields && (
        <div className="mb-8 rounded-3xl border border-primary/40 bg-surface-container-low/95 backdrop-blur-md p-6 sm:p-8 shadow-[0_10px_35px_rgba(0,0,0,0.3)] transition-all">
          <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-4">
            <div>
              <h2 className="text-lg font-black text-on-surface">Editar datos del incidente</h2>
              <p className="mt-1 text-xs text-on-surface-variant font-medium">
                Formulario interpretado desde INC v{entityRecord.data?.definitionVersion}.
              </p>
            </div>
            <button
              type="button"
              aria-label="Cancelar edición"
              onClick={closeEditor}
              className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {editPage && editContext && (
            <CatalogFormPage
              page={editPage}
              context={editContext}
              onSubmit={submitFieldChanges}
              className="mt-6"
            />
          )}
        </div>
      )}

      {editNotice && !isEditingFields && (
        <div className="mb-8 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          {editNotice}
        </div>
      )}

      {/* Values come from the exact INC definition used at creation; the page
          structure comes from the backend-resolved layout. resolvedDefinition
          is part of the loading gate so the layout is never rendered empty
          and then swapped in a moment later. */}
      {entityRecord.isLoading || definitionManifest.isLoading || resolvedDefinition.isLoading ? (
        <div className="rounded-2xl border border-border/40 bg-surface-container-low p-5 text-sm text-on-surface-variant">
          Cargando la vista definida en Catalog Builder…
        </div>
      ) : entityRecord.isError || definitionManifest.isError ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
          <p className="text-sm font-bold text-amber-300">No se pudo cargar la definición del ticket</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            El ticket sigue disponible, pero sus campos dinámicos no pueden mostrarse en este momento.
          </p>
        </div>
      ) : (
        // fileInputRef is only ever dereferenced inside event-handler closures
        // (triggerFilePicker/handleFilesSelected) threaded through `context`;
        // this rule's static analysis can't trace refs through a plain props
        // object and false-positives on it.
        // eslint-disable-next-line react-hooks/refs
        page && context ? (
          <>
            {layoutResolution && (
              <div
                data-testid="definition-provenance"
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium mb-3 bg-gray-100 text-gray-600"
                title={`Resolución de layout: ${layoutResolution}`}
              >
                {
                  // These are the exact three strings the resolved-definition
                  // contract produces — never "active".
                  layoutResolution === 'latest-compatible' ? 'Layout activo' :
                  layoutResolution === 'previous-compatible' ? 'Versión anterior compatible' :
                  layoutResolution === 'legacy-synthesized' ? 'Generado (sin layout)' :
                  layoutResolution
                }
              </div>
            )}
            <TicketPageLayout page={page} context={context} onAssignClick={handleAssign} />
          </>
        ) : null
      )}

      {ticket.entityId && (
        <>
          <IncidentProblemDialog
            open={showProblemDialog}
            ticket={ticket}
            currentUserName={currentUserName}
            linkedProblemIds={linkedProblemIds}
            onClose={() => setShowProblemDialog(false)}
            onLinked={() => {
              void queryClient.invalidateQueries({
                queryKey: ['catalog-entity-relations', 'INC', ticket.entityId],
              });
            }}
          />
          <IncidentChangeDialog
            open={showChangeDialog}
            ticket={ticket}
            currentUserName={currentUserName}
            onClose={() => setShowChangeDialog(false)}
            onLinked={() => {
              void queryClient.invalidateQueries({
                queryKey: ['catalog-entity-relations', 'INC', ticket.entityId],
              });
            }}
          />
        </>
      )}
    </div>
  );
}
