import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, X } from 'lucide-react';
import {
  useTicket,
  useUpdateTicketStatus,
  useAssignTicketOrganizational,
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
import { AssignTicketDialog, ReopenTicketDialog, ResolveWithSlaBreachDialog, MergeIntoTicketDialog, WatchToggleDialog } from './dialogs/TicketDialogs';
import { useToast } from '@/components/ui';
import type { AssignmentTarget } from '@/features/organization/AssignmentPicker';
import { canonicalTicketState, listTickets, statusFromApi, statusToApi, ticketStatesMatch } from './api';
import type { TicketStatus } from './types';
import { KNOWN_TICKET_STATUSES } from './types';
import { assigneeText, isTicketAssigned } from './identity-labels';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorState } from '@/components/ui/states';
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
  const assignTicketOrganizational = useAssignTicketOrganizational();
  const mergeTickets = useMergeTickets();
  const unmergeTicket = useUnmergeTicket();
  const toast = useToast();
  const [activityTab, setActivityTab] = useState<'all' | 'comments' | 'history'>('all');
  const [commentBody, setCommentBody] = useState('');
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [editNotice, setEditNotice] = useState('');
  const [showProblemDialog, setShowProblemDialog] = useState(false);
  const [showChangeDialog, setShowChangeDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showWatchDialog, setShowWatchDialog] = useState(false);
  const [pendingResolveTransitionKey, setPendingResolveTransitionKey] = useState<string | undefined>(undefined);
  // Bug found 2026-09-09: justificacionIncumplimientoSla was typed and
  // threaded through api.ts/hooks.ts but no dialog ever collected it. Mirrors
  // showReopenDialog/pendingResolveTransitionKey below, kept separate so the
  // two confirmation flows (reopen vs. resolve-with-breached-SLA) never share
  // state.
  const [showSlaJustificationDialog, setShowSlaJustificationDialog] = useState(false);
  const [pendingSlaTransition, setPendingSlaTransition] = useState<{ key: string; status: TicketStatus } | undefined>(undefined);
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
      setEditNotice('Changes saved. Tickets and SLA are syncing.');
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
    // Fixed 2026-09-06: a `bindsTo` field (site/device/IT-agent) was being
    // handed to `DynamicField`, which has no notion of `bindsTo` at all and
    // falls through to a plain, empty, `required` text input — since its
    // real value lives in `ticket.assetContext`, never in `editData`. That
    // silently failed HTML5 constraint validation on every submit
    // (`form.checkValidity()` false with zero visibly-`:invalid` elements
    // inside the form, because none of this ever surfaced an error to the
    // user), so "Edit fields" -> "Save changes" could never succeed for any
    // ticket whose edit layout includes a binding field — this path had no
    // existing test coverage. This inline editor has no UI for changing an
    // asset binding at all (that happens through dedicated flows, e.g.
    // reassignment), so a bindsTo field is simply not editable here, same
    // as it was never functionally editable before this fix either — the
    // only change is that its placement now renders nothing instead of an
    // input that can never be filled in and always blocks the whole form.
    if (field.bindsTo) return null;
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
      <ErrorState
        title="Ticket not available"
        description={error?.message || 'The requested ticket could not be found.'}
        onRetry={() => void refetch()}
      />
    );
  }

  // Every one of these used to be a window.alert/prompt/confirm — see
  // dialogs/TicketDialogs.tsx for the real dialogs that replaced them.

  function handleAssign() {
    const transition = lifecycleTransitions?.find(
      (candidate) => canonicalTicketState(candidate.to) === 'en_progreso',
    );
    if (!transition) {
      toast.show({
        tone: 'warning',
        title: "Can't assign this ticket",
        description: 'The historical definition has no transition into "In Progress" from the current state.',
      });
      return;
    }
    setShowAssignDialog(true);
  }

  function confirmAssign(target: AssignmentTarget, overwriteExisting: boolean) {
    assignTicketOrganizational.mutate(
      { id: ticket!.id, target },
      {
        onSuccess: () => {
          setShowAssignDialog(false);
          toast.show({ tone: 'success', title: overwriteExisting ? 'Ticket reassigned' : 'Ticket assigned' });
        },
        onError: (err) => toast.show({ tone: 'error', title: 'Assignment failed', description: err.message }),
      },
    );
  }

  function handleStatusChange(status: TicketStatus) {
    const transition = lifecycleTransitions?.find((candidate) => ticketStatesMatch(candidate.to, status));
    if (!transition) {
      toast.show({
        tone: 'warning',
        title: "Can't change status",
        description: "The historical definition doesn't contain that transition from the current state.",
      });
      return;
    }
    const target = canonicalTicketState(transition.to);
    const source = canonicalTicketState(transition.from);
    // A definition may model reopen as closed -> in_progress. The intent is
    // recognized by the closed ORIGIN, not just the destination state's name.
    if (source === 'cerrado' || target === 'abierto' || target === 'reabierto') {
      setPendingResolveTransitionKey(transition.key);
      setShowReopenDialog(true);
      return;
    }
    // Bug found 2026-09-09: resolving with a breached SLA had no UI path to
    // provide justificacionIncumplimientoSla at all. resolutionBreached is
    // the same real, already-fetched signal the SLA chip uses elsewhere
    // (features/sla's SlaAssessment) — not a guess, and not re-derived from
    // dates here, so it can't drift from what the chip already shows.
    if (target === 'resuelto' && slaAssessment.data?.resolutionBreached) {
      setPendingSlaTransition({ key: transition.key, status });
      setShowSlaJustificationDialog(true);
      return;
    }
    updateStatus.mutate(
      { id: ticket!.id, status, actorName: currentUserName, transitionKey: transition.key },
      { onError: (err) => toast.show({ tone: 'error', title: "Couldn't update status", description: err.message }) },
    );
  }

  function confirmSlaJustification(justification: string) {
    if (!pendingSlaTransition) return;
    updateStatus.mutate(
      {
        id: ticket!.id,
        status: pendingSlaTransition.status,
        actorName: currentUserName,
        transitionKey: pendingSlaTransition.key,
        justificacionIncumplimientoSla: justification,
      },
      {
        onSuccess: () => {
          setShowSlaJustificationDialog(false);
          setPendingSlaTransition(undefined);
          toast.show({ tone: 'success', title: 'Ticket resolved' });
        },
        onError: (err) => toast.show({ tone: 'error', title: "Couldn't resolve ticket", description: err.message }),
      },
    );
  }

  function confirmReopen(reason: string) {
    if (!pendingResolveTransitionKey) return;
    updateStatus.mutate(
      { id: ticket!.id, status: 'Open', transitionKey: pendingResolveTransitionKey, motivo: reason },
      {
        onSuccess: () => {
          setShowReopenDialog(false);
          setPendingResolveTransitionKey(undefined);
          toast.show({ tone: 'success', title: 'Ticket reopened' });
        },
        onError: (err) => toast.show({ tone: 'error', title: "Couldn't reopen ticket", description: err.message }),
      },
    );
  }

  function handleMerge() {
    setShowMergeDialog(true);
  }

  function confirmMerge(mergedIds: string[]) {
    mergeTickets.mutate(
      { primaryId: ticket!.id, mergedIds, actorName: currentUserName },
      {
        onSuccess: () => {
          setShowMergeDialog(false);
          toast.show({ tone: 'success', title: `Merged ${mergedIds.length} ticket${mergedIds.length === 1 ? '' : 's'}` });
        },
        onError: (err) => toast.show({ tone: 'error', title: 'Merge failed', description: err.message }),
      },
    );
  }

  function handleUnmerge(mergedId: string) {
    unmergeTicket.mutate(
      { primaryId: ticket!.id, mergedId, actorName: currentUserName },
      { onError: (err) => toast.show({ tone: 'error', title: "Couldn't unmerge ticket", description: err.message }) },
    );
  }

  function handleFilesSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    uploadAttachment.mutate(
      { file, uploaderName: currentUserName },
      { onError: (err) => toast.show({ tone: 'error', title: 'Upload failed', description: err.message }) },
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
        onError: (err) => toast.show({ tone: 'error', title: "Couldn't add comment", description: err.message }),
      },
    );
  }

  function toggleWatch() {
    setShowWatchDialog(true);
  }

  function confirmToggleWatch() {
    const mutation = isWatching ? removeWatcher : addWatcher;
    mutation.mutate(currentUserName, {
      onSuccess: () => setShowWatchDialog(false),
      onError: (err) =>
        toast.show({
          tone: 'error',
          title: isWatching ? "Couldn't stop watching" : "Couldn't watch ticket",
          description: err.message,
        }),
    });
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
      // Same reason as `renderEditField`'s `bindsTo` guard: this inline
      // editor never collects a real value for an asset binding, so it
      // must never touch it in the submitted payload either — leaving
      // whatever `record.data` already had untouched, not overwriting it
      // with `undefined`.
      if (!field || field.bindsTo) continue;
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
  // same renderer, same widgets — so a redesign in the Entity Builder shows
  // up identically in both places.
  const editContext: FormPageContext | null = specification
    ? {
        entityKey: 'INC',
        kind: 'edit',
        preview: false,
        definitionName: 'Edit Incident Details',
        definitionVersion: entityRecord.data?.definitionVersion,
        description: 'Form interpreted from the definition this ticket was created with.',
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
        sla: { state: 'unavailable', message: 'The SLA of an existing ticket is displayed on its own card.', onRetry: () => {} },
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
          submitLabel: 'Save changes',
          cancelLabel: 'Cancel',
          pending: updateEntityMutation.isPending,
          errorMessage: updateEntityMutation.isError
            ? updateEntityMutation.error instanceof ApiError && updateEntityMutation.error.status === 409
              ? 'This ticket changed while you were editing it. Reload its data before saving again.'
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
        currentUserId: deskUserId,
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
              <h2 className="text-lg font-black text-on-surface">Edit Incident Details</h2>
              <p className="mt-1 text-xs text-on-surface-variant font-medium">
                Form interpreted from INC v{entityRecord.data?.definitionVersion}.
              </p>
            </div>
            <button
              type="button"
              aria-label="Cancel editing"
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
          Loading view defined in Entity Builder…
        </div>
      ) : entityRecord.isError || definitionManifest.isError ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
          <p className="text-sm font-bold text-amber-300">We couldn't load the ticket's definition</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            The ticket is still available, but its dynamic fields can't be shown right now.
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
                title={`Layout resolution: ${layoutResolution}`}
              >
                {
                  // These are the exact three strings the resolved-definition
                  // contract produces — never "active".
                  layoutResolution === 'latest-compatible' ? 'Active layout' :
                  layoutResolution === 'previous-compatible' ? 'Previous compatible version' :
                  layoutResolution === 'legacy-synthesized' ? 'Generated (no layout)' :
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

      <AssignTicketDialog
        open={showAssignDialog}
        onClose={() => setShowAssignDialog(false)}
        onConfirm={confirmAssign}
        currentAssignee={isTicketAssigned(ticket) ? assigneeText(ticket) : null}
        loading={assignTicketOrganizational.isPending}
        error={assignTicketOrganizational.error?.message}
      />
      <ReopenTicketDialog
        open={showReopenDialog}
        onClose={() => {
          setShowReopenDialog(false);
          setPendingResolveTransitionKey(undefined);
        }}
        onConfirm={confirmReopen}
        loading={updateStatus.isPending}
        error={updateStatus.error?.message}
      />
      <ResolveWithSlaBreachDialog
        open={showSlaJustificationDialog}
        onClose={() => {
          setShowSlaJustificationDialog(false);
          setPendingSlaTransition(undefined);
        }}
        onConfirm={confirmSlaJustification}
        loading={updateStatus.isPending}
        error={updateStatus.error?.message}
      />
      <MergeIntoTicketDialog
        open={showMergeDialog}
        onClose={() => setShowMergeDialog(false)}
        onConfirm={confirmMerge}
        currentTicketId={ticket.id}
        loading={mergeTickets.isPending}
        error={mergeTickets.error?.message}
      />
      <WatchToggleDialog
        open={showWatchDialog}
        onClose={() => setShowWatchDialog(false)}
        onConfirm={confirmToggleWatch}
        isWatching={isWatching}
        loading={addWatcher.isPending || removeWatcher.isPending}
        error={addWatcher.error?.message || removeWatcher.error?.message}
      />
    </div>
  );
}
