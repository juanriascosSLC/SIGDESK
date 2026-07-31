import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
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
import { listTickets } from './api';
import type { TicketStatus } from './types';
import { KNOWN_TICKET_STATUSES } from './types';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/useAuth';
import { getSlaAssessment } from '@/features/sla/api';
import {
  getEntity,
  getEntityManifest,
  isFieldRequired,
  updateEntity,
  type LayoutDocument,
  type Placement,
} from '@/features/catalog/metamodel';
import { getResolvedDefinition } from '@/features/catalog/api';
import { DynamicField } from '@/features/catalog/DynamicField';
import { DynamicLayout } from '@/features/catalog/runtime/DynamicLayout';
import { filterDocumentByFieldVisibility, resolveLayoutDocument, visibleFieldPlacements } from '@/features/catalog/runtime/layout-normalizer';
import { resolveTicketPageLayout } from '@/features/catalog/runtime/page-layout-normalizer';
import { listEntityRelations } from '@/features/catalog/metamodel';
import { ApiError } from '@/lib/apiClient';
import { PERMISSIONS } from '@/features/auth/permissions';
import { IncidentProblemDialog } from '@/features/problems/IncidentProblemDialog';
import { TicketPageLayout } from './TicketPageLayout';
import type { TicketPageContext, TimelineItem } from './widgets/context';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { displayName: currentUserName, can } = useAuth();
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
  // The historical manifest used at creation time governs this ticket's DATA:
  // field definitions, types, options and validation. A republish must never
  // change what the ticket means. Its page LAYOUT comes from the currently
  // published definition instead (see publishedDefinition below).
  const definitionManifest = useQuery({
    queryKey: [
      'catalog-definition-manifest',
      'INC',
      entityRecord.data?.definitionVersion ?? 'unknown',
    ],
    queryFn: () => getEntityManifest('INC', ticket!.entityId!),
    enabled: Boolean(ticket?.entityId && entityRecord.data?.definitionVersion),
  });
  // Resolved definition: single backend call that returns the correct
  // versioned layout (active, latest-compatible, or legacy-synthesized).
  // Replaces the previous publishedDefinition + resolveTicketPageLayout
  // client-side resolution.
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

  const isWatching = (watchers.data ?? []).some((w) => w.watcherName === currentUserName);
  const ticketStatus = ticket?.status;

  // The ticket's own state must always be selectable/visible even when the
  // catalog Definition declares a state this UI has no design for yet.
  const statusOptions = useMemo(() => {
    const options: TicketStatus[] = [...KNOWN_TICKET_STATUSES];
    if (ticketStatus && !options.includes(ticketStatus)) options.push(ticketStatus);
    return options;
  }, [ticketStatus]);

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

  const editDocument = useMemo((): LayoutDocument | null => {
    const specification = definitionManifest.data?.specification;
    if (!specification) return null;
    return filterDocumentByFieldVisibility(
      resolveLayoutDocument(specification, 'edit', 'agent'),
      specification.fields,
      editData,
    );
  }, [definitionManifest.data, editData]);

  function renderEditPlacement(placement: Placement) {
    if (placement.kind !== 'field' || placement.source !== 'catalog' || !placement.fieldKey) {
      return null;
    }
    const field = definitionManifest.data?.specification.fields.find(
      (candidate) => candidate.key === placement.fieldKey,
    );
    if (!field) return null;
    return (
      <DynamicField
        field={field}
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
    const name = window.prompt('Assign to:', ticket!.assignee || currentUserName);
    if (name === null) return;
    assignTicket.mutate(
      { id: ticket!.id, assigneeName: name.trim() || null, actorName: currentUserName },
      { onError: (err) => window.alert(err.message) },
    );
  }

  function handleStatusChange(status: TicketStatus) {
    updateStatus.mutate(
      { id: ticket!.id, status, actorName: currentUserName },
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
    if (!record || !specification || !editDocument) return;
    // Start from the record's existing data so fields outside this edit
    // layout/audience (or conditionally hidden right now) keep their value —
    // only fields the user could actually see and edit this session are
    // touched. An explicit clear of a visible, optional field is respected.
    const data: Record<string, unknown> = { ...record.data };
    const visibleCatalogKeys = visibleFieldPlacements(editDocument, editData)
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
  // The provenance badge origin from resolvedDefinition – does not affect
  // the page layout structure which comes from the historical manifest.
  const layoutResolution = resolvedDefinition.data?.layoutResolution;
  const page = specification
    ? resolveTicketPageLayout(undefined, specification, 'agent')
    : null;
  const context: TicketPageContext | null = specification
    ? {
        ticket,
        currentUserName,
        can,
        onNavigate: navigate,
        fields: specification.fields,
        entityData: entityRecord.data?.data ?? {},
        fieldsLoading: entityRecord.isLoading || definitionManifest.isLoading,
        fieldsError: entityRecord.isError || definitionManifest.isError,
        sla: { assessment: slaAssessment.data, loading: slaAssessment.isLoading },
        attachments: {
          items: attachments.data ?? [],
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
        relations: {
          items: entityRelations.data ?? [],
          linkedProblemIds,
        },
        actions: {
          isEditingFields,
          onStartEditingFields: startEditingFields,
          canEditFields: can('sigdesk.tickets.edit') && Boolean(ticket.entityId),
          onAssign: handleAssign,
          onStatusChange: handleStatusChange,
          statusOptions,
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
          isWatching,
          watchersCount: watchers.data?.length ?? 1,
          onToggleWatch: toggleWatch,
          onResolve: () => handleStatusChange('Resolved'),
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
        <form
          onSubmit={submitFieldChanges}
          className="mb-8 rounded-3xl border border-primary/40 bg-surface-container-low/95 backdrop-blur-md p-6 sm:p-8 shadow-[0_10px_35px_rgba(0,0,0,0.3)] transition-all"
        >
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
              onClick={() => {
                setIsEditingFields(false);
                updateEntityMutation.reset();
              }}
              className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-6">
            {editDocument && (
              <DynamicLayout
                document={editDocument}
                data={editData}
                renderPlacement={renderEditPlacement}
              />
            )}
          </div>
          {updateEntityMutation.isError && (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 font-medium">
              {updateEntityMutation.error instanceof ApiError &&
              updateEntityMutation.error.status === 409
                ? 'El ticket cambió mientras lo editabas. Recarga sus datos antes de volver a guardar.'
                : updateEntityMutation.error.message}
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border/40 pt-5">
            <button
              type="button"
              onClick={() => {
                setIsEditingFields(false);
                updateEntityMutation.reset();
              }}
              className="px-5 py-2.5 rounded-xl bg-surface-container border border-border/60 text-on-surface font-semibold text-sm hover:bg-surface-container-high hover:border-border transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updateEntityMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm inline-flex items-center gap-2 hover:opacity-90 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              <span>{updateEntityMutation.isPending ? 'Guardando…' : 'Guardar cambios'}</span>
            </button>
          </div>
        </form>
      )}

      {editNotice && !isEditingFields && (
        <div className="mb-8 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          {editNotice}
        </div>
      )}

      {/* Values come from the exact INC definition used at creation; the page
          structure comes from the currently published one. publishedDefinition
          is part of the loading gate so the layout is never rendered from the
          historical fallback and then swapped a moment later. */}
      {entityRecord.isLoading || definitionManifest.isLoading ? (
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
                {layoutResolution === 'active' ? 'Layout activo' :
                 layoutResolution === 'latest-compatible' ? 'Versión compatible' :
                 'Generado (sin layout)'}
              </div>
            )}
            <TicketPageLayout page={page} context={context} onAssignClick={handleAssign} />
          </>
        ) : null
      )}

      {ticket.entityId && (
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
      )}
    </div>
  );
}
