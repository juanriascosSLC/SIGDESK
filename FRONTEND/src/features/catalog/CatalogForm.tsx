import { useCallback, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getTicket, priorityToApi, uploadAttachment } from '@/features/tickets/api';
import { recursoTypeMatches, listAssetSites, listSiteAssets } from '@/features/assets/api';
import { useAuth } from '@/features/auth/useAuth';
import { previewSlaForEntity } from '@/features/sla/api';
import {
  assetConditionData,
  bindingCountIssue,
  bindingEmptyValue,
  bindingIsMultiple,
  bindingList,
  bindingPrincipal,
  createEntity,
  isFieldRequired,
  getPublishedDefinition,
  getStakeholderDirectory,
  listAgentesIT,
  listRecursos,
  transitionEntity,
  type BindingValue,
  type FieldDefinition,
  type PagePlacement,
  type AssetContextInput,
  type StakeholdersInput,
} from './metamodel';
import { BindingPicker } from './BindingPicker';
import { CatalogFormPage } from './CatalogFormPage';
import { DynamicField } from './DynamicField';
import type { FormPageContext } from './form-widgets/context';
import { FormStakeholdersWidget } from './form-widgets/FormStakeholdersWidget';
import { resolveAudienceKeyFromPath } from './runtime/layout-normalizer';
import {
  filterPageByFieldVisibility,
  resolveFormPageLayout,
  visiblePageFieldPlacements,
} from './runtime/form-page-normalizer';
import { findPagePlacementsByWidgetKey } from './runtime/page-layout-normalizer';

const MAX_FORM_ATTACHMENTS = 10;
const MAX_FORM_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function pendingAttachmentId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function initialValue(field: FieldDefinition): unknown {
  // TODO-106 — un campo bindsTo guarda un BindingValue (objeto), una lista de
  // ellos si acepta varios dispositivos, o vacío — nunca un string vacío:
  // `''` pasaría el chequeo de "valor presente" de
  // isFieldRequired/evaluateCondition de forma incorrecta para este shape.
  if (field.bindsTo) return bindingEmptyValue(field);
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'boolean') return false;
  // Un multiselect guarda una LISTA. Arrancar en '' haría que el primer
  // envío sin tocar el campo mandara una cadena donde el servidor espera una
  // colección (validarMultiseleccion la rechaza por tipo).
  if (field.type === 'multiselect') return [];
  return '';
}

export default function CatalogForm() {
  const { categoryId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { displayName, user, canSearchAssets } = useAuth();
  const definitionQuery = useQuery({
    queryKey: ['catalog-definition', categoryId],
    queryFn: () => getPublishedDefinition(categoryId),
    enabled: Boolean(categoryId),
  });
  const definition = definitionQuery.data;
  const [formState, setFormState] = useState<{
    definitionId?: string;
    data: Record<string, unknown>;
  }>({ data: {} });
  const [submitError, setSubmitError] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [stakeholders, setStakeholders] = useState<StakeholdersInput>({ userIds: [], unitIds: [] });
  const data = formState.definitionId === definition?.id ? formState.data : {};
  const effectiveData = definition
    ? Object.fromEntries(
        definition.specification.fields.map((field) => [
          field.key,
          Object.prototype.hasOwnProperty.call(data, field.key)
            ? data[field.key]
            : initialValue(field),
        ]),
      )
    : data;
  // Las condiciones NO se evalúan contra `effectiveData`: un campo
  // multi-dispositivo guarda una lista, y `isPresent` trata `[]` como
  // presente, así que un `visibleWhen: {operator: 'exists'}` daría verdadero
  // con cero dispositivos elegidos. `assetConditionData` proyecta cada campo
  // a su dispositivo PRINCIPAL bajo su propia clave y deja la colección
  // completa bajo la clave reservada, para los cuantificadores any/all.
  // `effectiveData` sigue siendo el de render.
  const conditionData = definition
    ? assetConditionData(definition.specification.fields, effectiveData)
    : effectiveData;
  const createMutation = useMutation({
    mutationFn: async ({
      entityData,
      idempotencyKey,
      binding,
      attachments,
    }: {
      entityData: Record<string, unknown>;
      idempotencyKey: string;
      binding?: { recursoId?: string; agenteItId?: string; assetContext?: AssetContextInput; stakeholders?: StakeholdersInput };
      attachments: File[];
    }) => {
      const entity = await createEntity(categoryId, entityData, idempotencyKey, binding);
      const attachmentErrors: string[] = [];
      if (categoryId.toUpperCase() === 'INC') {
        for (const file of attachments) {
          try {
            await uploadAttachment(entity.id, file, displayName);
          } catch (error) {
            attachmentErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'no se pudo cargar'}`);
          }
        }
      }
      return { entity, attachmentErrors };
    },
  });
  const transitionMutation = useMutation({
    mutationFn: ({
      entityId,
      transitionKey,
    }: {
      entityId: string;
      transitionKey: string;
    }) => transitionEntity(categoryId, entityId, transitionKey),
  });

  const audienceKey = resolveAudienceKeyFromPath(location.pathname);
  // Metamodel 1.6: the create form is a full page on the same region/grid
  // model as the ticket detail. A definition published before 1.6 has no
  // `createPage`, and resolveFormPageLayout synthesizes an equivalent one from
  // its `layouts.create` — so nothing changes for it until an admin redesigns.
  const createPage = definition
    ? filterPageByFieldVisibility(
        resolveFormPageLayout(definition.specification, 'create', audienceKey),
        definition.specification.fields,
        conditionData,
      )
    : null;

  // TODO-106 — campos bindsTo requieren un fetch real. La restricción se
  // partió en dos, porque los endpoints NO dan las mismas garantías:
  //
  //   - Activos (siteAssetId/assetId): resource_service ya resuelve el
  //     alcance del actor y filtra dentro de la propia consulta, así que la
  //     puerta es el permiso REAL de la persona (`canSearchAssets`), no la
  //     ruta por la que entró. Un solicitante con `assets:read:depto` ve los
  //     equipos de su área; uno sin permiso sigue viendo el mensaje.
  //   - Recursos y agentes IT: `GET /recursos` exige `recursos:read:global`
  //     sin alcance parcial y devuelve ListarTodos() sin filtrar, así que
  //     abrirlos al portal SÍ sería una fuga. Ahí se mantiene el bloqueo por
  //     audiencia y TODO-106 sigue abierto.
  //
  // (El comentario anterior citaba TODO-24, que es sobre SLOs de latencia.)
  const bindingFields = definition?.specification.fields.filter((field) => field.bindsTo) ?? [];
  // INC is backed by the Ticket aggregate, whose resource is an invariant.
  // A definition may leave its ordinary fields optional, but it must offer at
  // least one way to choose the resource that anchors the incident. Without
  // this guard a malformed published definition reaches POST /entities/INC
  // with an empty recursoId and the user only gets a backend 4xx.
  const incidentResourceFields = bindingFields.filter(
    (field) =>
      field.bindsTo === 'recursoId' ||
      field.bindsTo === 'siteAssetId' ||
      field.bindsTo === 'assetId',
  );
  const needsRecursoPicker = bindingFields.some((field) => field.bindsTo === 'recursoId');
  const needsAgentePicker = bindingFields.some((field) => field.bindsTo === 'agenteItId');
  const needsSitePicker = bindingFields.some((field) => field.bindsTo === 'siteAssetId');
  const needsAssetPicker = bindingFields.some((field) => field.bindsTo === 'assetId');
  const siteField = bindingFields.find((field) => field.bindsTo === 'siteAssetId');
  const selectedSite = siteField ? bindingPrincipal(effectiveData[siteField.key]) : null;
  // Recursos legados y agentes IT: siguen cerrados al portal.
  const restrictedForRequester = audienceKey === 'requester';
  // Activos: gobernado por el permiso real, en cualquier audiencia.
  const assetsRestricted = !canSearchAssets;
  const stakeholderDirectoryQuery = useQuery({
    queryKey: ['organization', 'stakeholder-directory'],
    queryFn: getStakeholderDirectory,
    enabled: !restrictedForRequester,
    staleTime: 5 * 60_000,
  });
  const recursosQuery = useQuery({
    queryKey: ['bindings', 'recursos'],
    queryFn: listRecursos,
    enabled: needsRecursoPicker && !restrictedForRequester,
  });
  const agentesQuery = useQuery({
    queryKey: ['bindings', 'agentes-it'],
    queryFn: listAgentesIT,
    enabled: needsAgentePicker && !restrictedForRequester,
  });
  const sitesQuery = useQuery({
    queryKey: ['assets', 'sites'],
    queryFn: () => listAssetSites(),
    enabled: needsSitePicker && !assetsRestricted,
  });
  const siteAssetsQuery = useQuery({
    queryKey: ['assets', 'site', selectedSite?.id ?? ''],
    queryFn: () => listSiteAssets(selectedSite!.id),
    enabled: needsAssetPicker && Boolean(selectedSite?.id) && !assetsRestricted,
  });
  // The SLA preview only runs when the designed page actually shows it, and
  // only once a priority has been chosen — SLA targets are indexed by priority
  // alone (BACKEND domain/politica_sla.go), so nothing else in the form can
  // change the answer.
  const showsSlaPreview = Boolean(
    createPage && findPagePlacementsByWidgetKey(createPage, 'formSlaPreview').length > 0,
  );
  const priorityValue =
    typeof effectiveData.priority === 'string' ? effectiveData.priority.trim() : '';
  const slaPreviewQuery = useQuery({
    queryKey: ['sla', 'entity-preview', categoryId, priorityValue],
    queryFn: () => previewSlaForEntity(categoryId, priorityValue),
    enabled: showsSlaPreview && Boolean(categoryId) && Boolean(priorityValue),
    retry: false,
  });

  const createdEntity = transitionMutation.data ?? createMutation.data?.entity;
  // The entity id is the ticket aggregate's routable primary key. humanId is
  // display-only and must never be sent to endpoints that parse a numeric id.
  const ticketProjectionQuery = useQuery({
    queryKey: ['tickets', 'projection', createdEntity?.id ?? ''],
    queryFn: () => getTicket(createdEntity!.id),
    enabled: definition?.entityKey === 'INC' && Boolean(createdEntity?.id),
    retry: 10,
    retryDelay: 400,
  });

  function updateField(key: string, value: unknown) {
    setFormState((current) => {
      const previous = current.definitionId === definition?.id ? current.data : {};
      const next: Record<string, unknown> = { ...previous, [key]: value };
      // Cambiar de sitio invalida los dispositivos ya elegidos: el backend
      // rechaza la creación entera con ErrRecursoInvalido si un activo no
      // pertenece al sitio del contexto (resolveAssets). Dejarlos puestos
      // convertiría un cambio de sitio en un error incomprensible al enviar,
      // y con varios dispositivos por campo pasa a ser casi seguro.
      if (siteField && key === siteField.key) {
        for (const field of bindingFields) {
          if (field.bindsTo === 'assetId') next[field.key] = bindingEmptyValue(field);
        }
      }
      return { definitionId: definition?.id, data: next };
    });
  }

  function addPendingAttachments(files: File[]) {
    setAttachmentError('');
    const tooLarge = files.find((file) => file.size > MAX_FORM_ATTACHMENT_BYTES);
    if (tooLarge) {
      setAttachmentError(`"${tooLarge.name}" is over the 10 MB limit.`);
      return;
    }
    setPendingAttachments((current) => {
      const byId = new Map(current.map((file) => [pendingAttachmentId(file), file]));
      for (const file of files) byId.set(pendingAttachmentId(file), file);
      const next = Array.from(byId.values());
      if (next.length > MAX_FORM_ATTACHMENTS) {
        setAttachmentError(`You can attach up to ${MAX_FORM_ATTACHMENTS} files.`);
        return current;
      }
      return next;
    });
  }

  // The one place a field placement becomes an input. Lifted out of the old
  // inline renderPlacement unchanged — it stays here, rather than in the
  // dispatcher, because only this component knows about the resource / IT
  // agent / site / asset queries a `bindsTo` field needs.
  // El mensaje del picker tiene que decir la verdad. El anterior afirmaba
  // «No encontramos tu equipo asignado todavía» SIN haber consultado nada —
  // justo lo que el encabezado de BindingPicker prohíbe por ser falso. Ahora
  // cada caso dice lo que realmente pasa.
  const restrictedMessageFor = useCallback(
    (kind: 'recurso' | 'agenteIt' | 'site' | 'asset'): string | undefined => {
      const isAssetKind = kind === 'site' || kind === 'asset';
      if (isAssetKind) {
        if (assetsRestricted) {
          return 'Your account does not have access to inventory — contact IT to submit this request.';
        }
        if (kind === 'asset' && !selectedSite) {
          return 'Select a site first to view its devices.';
        }
        // Con permiso y sitio elegido, un listado vacío ya lo explica el
        // propio picker («todavía no hay activos registrados»), que es cierto
        // para su alcance.
        return undefined;
      }
      if (restrictedForRequester) {
        return 'This field can only be completed by an agent — contact IT to submit this request.';
      }
      return undefined;
    },
    [assetsRestricted, restrictedForRequester, selectedSite],
  );

  const renderField = useCallback(
    (placement: PagePlacement) => {
      if (!definition || !placement.fieldKey) return null;
      const field = definition.specification.fields.find(
        (candidate) => candidate.key === placement.fieldKey,
      );
      if (!field) return null;
      if (field.bindsTo) {
        const kind = field.bindsTo === 'recursoId' ? 'recurso' : field.bindsTo === 'agenteItId' ? 'agenteIt' : field.bindsTo === 'siteAssetId' ? 'site' : 'asset';
        const assetQuery = kind === 'site' ? sitesQuery : siteAssetsQuery;
        const bindingQuery = kind === 'recurso' ? recursosQuery : agentesQuery;
        const rawItems: BindingValue[] = kind === 'site' || kind === 'asset'
          ? (assetQuery.data?.items ?? []).map((item) => ({ id: item.id, displayName: item.displayName, tipo: item.assetType }))
          : bindingQuery.data ?? [];
        // Only Recurso items are filtered by resourceType: recursoTypeMatches
        // understands Recurso's taxonomy (hardware/infraestructura-red/
        // software-licencia), not Asset's (Kind: site/system/device/
        // component) — applying it to `kind === 'asset'` silently mismatched
        // the two taxonomies (bug found 2026-09-09; see the function's own
        // doc comment in features/assets/api.ts). Asset items pass through
        // unfiltered until a Kind-based equivalent is written.
        const items = kind === 'recurso'
          ? rawItems.filter((item) => recursoTypeMatches(item.tipo, field.resourceType))
          : rawItems;
        const shared = {
          label: placement.label || field.label,
          kind,
          items,
          loading: kind === 'site' || kind === 'asset' ? assetQuery.isLoading : bindingQuery.isLoading,
          isError: kind === 'site' || kind === 'asset' ? assetQuery.isError : bindingQuery.isError,
          onRetry: () => { void (kind === 'site' || kind === 'asset' ? assetQuery.refetch() : bindingQuery.refetch()); },
          required: isFieldRequired(field, conditionData),
          restrictedMessage: restrictedMessageFor(kind),
        } as const;
        if (bindingIsMultiple(field)) {
          return (
            <BindingPicker
              {...shared}
              multiple
              value={bindingList(effectiveData[field.key])}
              onSelect={(value) => updateField(field.key, value)}
              maxItems={field.maxItems}
              countMessage={bindingCountIssue(field, effectiveData[field.key], shared.required)}
            />
          );
        }
        return (
          <BindingPicker
            {...shared}
            value={bindingPrincipal(effectiveData[field.key])}
            onSelect={(value) => updateField(field.key, value)}
          />
        );
      }
      return (
        <DynamicField
          field={placement.label ? { ...field, label: placement.label } : field}
          value={effectiveData[field.key]}
          required={isFieldRequired(field, conditionData)}
          onChange={(value) => updateField(field.key, value)}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [definition, effectiveData, conditionData, restrictedMessageFor, recursosQuery, agentesQuery, sitesQuery, siteAssetsQuery, restrictedForRequester, selectedSite],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!definition) return;
    const activeKeys = createPage
      ? visiblePageFieldPlacements(createPage, conditionData)
          .filter((placement) => placement.source === 'catalog')
          .map((placement) => placement.fieldKey)
      : [];
    // TODO-103 — el gap central que cierra ErrRecursoIDVacio: los campos con
    // bindsTo guardan un BindingValue en effectiveData[key] (nunca se envían
    // dentro de `data` — el backend no los espera ahí, crearEntidadRequest
    // los lee como recursoId/agenteItId top-level). Se extraen acá y se
    // excluyen del payload `data` genérico.
    const bindingKeys = new Set(bindingFields.map((field) => field.key));
    const dataKeys = activeKeys.filter((key) => !bindingKeys.has(key));
    // A field keyed exactly 'priority' ALSO maps to the native ticket
    // priority (crearEntidadRequest.Prioridad, "prioridad" on the wire).
    // It stays in `data` too — unlike a bindsTo field, the server's own
    // required-catalog-field check reads campos_dinamicos, not the native
    // property, so a spec that declares 'priority' required would 422 on
    // every submission ("falta un campo requerido") if this were sent
    // only natively. Sending both is deliberate, not a duplicate source of
    // truth: they're written together from the same single selection in
    // this one function, so they can't drift — data.priority is what makes
    // required-field validation see the choice; prioridad is what actually
    // sets the ticket's SLA-driving native field, which nothing previously
    // wired a catalog field into at all.
    const hasNativePriorityField = activeKeys.includes('priority') && !bindingKeys.has('priority');
    if (definition.entityKey.toUpperCase() === 'INC' && incidentResourceFields.length === 0) {
      setSubmitError(
        'This INC definition has no resource or CMDB field. Add "Site Device" in Catalog Builder → Form fields and publish it before creating the incident.',
      );
      return;
    }
    const missing = definition.specification.fields.find((field) => {
      if (!activeKeys.includes(field.key) || !isFieldRequired(field, conditionData)) return false;
      const value = effectiveData[field.key];
      if (field.bindsTo) return bindingList(value).length === 0;
      return value === null || value === undefined || (typeof value === 'string' && !value.trim());
    });
    if (missing) {
      setSubmitError(`Fill in the required field "${missing.label}".`);
      return;
    }
    // Los topes de un campo multi-dispositivo tienen su propio mensaje: caer
    // en el genérico de arriba diría "completa el campo" cuando el problema
    // es la cantidad. El servidor los verifica igual (resolveAssets), esto
    // es para no llegar hasta allá con un 422 evitable.
    const outOfRange = definition.specification.fields
      .filter((field) => activeKeys.includes(field.key))
      .map((field) => ({
        field,
        issue: bindingCountIssue(field, effectiveData[field.key], isFieldRequired(field, conditionData)),
      }))
      .find((entry) => entry.issue);
    if (outOfRange) {
      setSubmitError(`"${outOfRange.field.label}": ${outOfRange.issue}`);
      return;
    }
    setSubmitError('');
    const binding: { recursoId?: string; agenteItId?: string; assetContext?: AssetContextInput; stakeholders?: StakeholdersInput; prioridad?: string } = {};
    if (hasNativePriorityField) {
      const raw = effectiveData.priority;
      if (typeof raw === 'string' && raw.trim()) binding.prioridad = priorityToApi(raw.trim());
    }
    const assetContext: AssetContextInput = { links: [] };
    for (const field of bindingFields) {
      // Un campo de dispositivos aporta UN link por cada equipo elegido. El
      // primero de la lista es el principal, y viaja marcado: el backend no
      // lo deduce de la posición, así que reordenar el arreglo no puede
      // cambiar en silencio qué dispositivo gobierna las condiciones.
      if (field.bindsTo === 'assetId') {
        bindingList(effectiveData[field.key]).forEach((bound, index) => {
          assetContext.links.push({
            assetId: bound.id,
            role: field.assetRole || 'affected',
            fieldKey: field.key,
            principal: index === 0,
          });
          binding.recursoId ||= bound.id;
        });
        continue;
      }
      const bound = bindingPrincipal(effectiveData[field.key]);
      if (!bound) continue;
      if (field.bindsTo === 'recursoId') binding.recursoId = bound.id;
      if (field.bindsTo === 'agenteItId') binding.agenteItId = bound.id;
      if (field.bindsTo === 'siteAssetId') {
        assetContext.siteAssetId = bound.id;
        assetContext.siteFieldKey = field.key;
        binding.recursoId = bound.id;
      }
    }
    if (assetContext.siteAssetId || assetContext.links.length) binding.assetContext = assetContext;
    if (stakeholders.userIds.length || stakeholders.unitIds.length) {
      binding.stakeholders = stakeholders;
    }
    if (definition.entityKey.toUpperCase() === 'INC' && !binding.recursoId) {
      setSubmitError(
        'Select a resource or CMDB asset to create the incident. This link is required even when every other field is optional.',
      );
      return;
    }
    createMutation.mutate({
      entityData: Object.fromEntries(dataKeys.map((key) => [key, effectiveData[key]])),
      idempotencyKey: crypto.randomUUID(),
      binding,
      attachments: pendingAttachments,
    });
  }

  const slaState: FormPageContext['sla']['state'] = !showsSlaPreview || !priorityValue
    ? 'idle'
    : slaPreviewQuery.isLoading
      ? 'loading'
      : slaPreviewQuery.isError
        ? 'error'
        : slaPreviewQuery.data && !slaPreviewQuery.data.applies
          ? 'unavailable'
          : slaPreviewQuery.data
            ? 'ready'
            : 'idle';
  const slaData = slaPreviewQuery.data;

  const formContext: FormPageContext | null = definition
    ? {
        entityKey: definition.entityKey,
        kind: 'create',
        preview: false,
        definitionName: definition.name,
        definitionVersion: definition.version,
        description: definition.specification.description,
        fields: definition.specification.fields,
        data: effectiveData,
        renderField,
        requester: { displayName, email: user?.email },
        stakeholders: {
          directory: stakeholderDirectoryQuery.data,
          loading: stakeholderDirectoryQuery.isLoading,
          errorMessage: stakeholderDirectoryQuery.isError
            ? 'We could not load the Organization directory.'
            : undefined,
          value: stakeholders,
          readOnly: restrictedForRequester,
          hidden: restrictedForRequester,
          onChange: setStakeholders,
          onRetry: () => void stakeholderDirectoryQuery.refetch(),
        },
        sla: {
          state: slaState,
          preview:
            slaState === 'ready' && slaData?.applies
              ? {
                  policyId: slaData.policyId ?? '',
                  policyVersion: slaData.policyVersion ?? 0,
                  priority: slaData.priority ?? priorityValue,
                  responseTargetMinutes: slaData.responseTargetMinutes ?? 0,
                  resolutionTargetMinutes: slaData.resolutionTargetMinutes ?? 0,
                  responseDueAt: slaData.responseDueAt,
                  resolutionDueAt: slaData.resolutionDueAt,
                }
              : undefined,
          message: slaState === 'unavailable' ? slaData?.reason : slaPreviewQuery.error?.message,
          onRetry: () => void slaPreviewQuery.refetch(),
        },
        attachments: {
          items: pendingAttachments.map((file) => ({
            id: pendingAttachmentId(file),
            name: file.name,
            size: file.size,
            type: file.type,
          })),
          maxFiles: MAX_FORM_ATTACHMENTS,
          maxBytesPerFile: MAX_FORM_ATTACHMENT_BYTES,
          canRemove: true,
          errorMessage: attachmentError || undefined,
          onAddFiles: addPendingAttachments,
          onRemove: (id) => setPendingAttachments((current) => current.filter((file) => pendingAttachmentId(file) !== id)),
        },
        submit: {
          submitLabel: `Create ${definition.entityKey}`,
          cancelLabel: 'Cancel',
          pending: createMutation.isPending,
          errorMessage: createMutation.isError ? createMutation.error.message : undefined,
          warningMessage: !createMutation.isError && submitError ? submitError : undefined,
          onCancel: () => navigate(-1),
          disabled: false,
        },
      }
    : null;

  if (definitionQuery.isLoading) {
    return <div className="p-8 text-on-surface-variant">Loading definition…</div>;
  }
  if (definitionQuery.isError || !definition) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="text-primary mb-6">← Back</button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-red-300">
          There is no published definition for <strong>{categoryId.toUpperCase()}</strong>.
        </div>
      </div>
    );
  }

  if (createdEntity) {
    const availableTransitions = definition.specification.lifecycle.transitions.filter(
      (transition) => transition.from === createdEntity.state,
    );
    const detailPath = definition.entityKey === 'INC'
      ? `${location.pathname.startsWith('/portal') ? '/portal' : '/app'}/tickets/${createdEntity.id}`
      : definition.entityKey === 'PRB'
        ? `/app/problems/${createdEntity.id}`
        : definition.entityKey === 'RFC'
          ? `/app/changes/${createdEntity.id}`
          : null;
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-surface-container-low border border-emerald-500/30 rounded-3xl p-10 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-5" />
          <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300 mb-2">
            Record created
          </div>
          <h1 className="text-3xl font-black text-on-surface">{createdEntity.humanId}</h1>
          <p className="text-on-surface-variant mt-3">
            Running {definition.entityKey} v{createdEntity.definitionVersion} in state{' '}
            <strong className="text-on-surface">{createdEntity.state}</strong>.
          </p>
          <p className="text-[11px] font-mono text-on-surface-variant mt-2">
            definition {createdEntity.definitionVersionId} · schema {createdEntity.schemaVersion}
          </p>
          {(createMutation.data?.attachmentErrors.length ?? 0) > 0 && (
            <div role="alert" className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left text-sm text-amber-200">
              The record was created, but some attachments could not be uploaded. You can add them again from the detail view.
              <ul className="mt-2 list-disc pl-5">
                {createMutation.data?.attachmentErrors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          )}
          {definition.entityKey === 'INC' && (
            <div className="mt-5 rounded-xl border border-border/40 bg-surface-container p-4">
              {ticketProjectionQuery.data ? (
                <p className="text-sm text-emerald-300">
                  The record is already available in Tickets.
                </p>
              ) : ticketProjectionQuery.isError ? (
                <p className="text-sm text-amber-300">
                  The record was created. Its projection into Tickets is still catching up in the background.
                </p>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  Syncing with the Tickets module…
                </p>
              )}
            </div>
          )}
          {availableTransitions.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {availableTransitions.map((transition) => (
                <button
                  key={transition.key}
                  onClick={() =>
                    transitionMutation.mutate({
                      entityId: createdEntity.id,
                      transitionKey: transition.key,
                    })
                  }
                  disabled={transitionMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold disabled:opacity-50"
                >
                  {transition.label}
                </button>
              ))}
            </div>
          )}
          {transitionMutation.isError && (
            <p className="text-sm text-red-400 mt-4">{transitionMutation.error.message}</p>
          )}
          <div className="flex justify-center gap-3 mt-8">
            {detailPath && definition.entityKey !== 'INC' && (
              <button
                onClick={() => navigate(detailPath)}
                className="px-5 py-3 rounded-xl bg-emerald-500 text-slate-950 font-black"
              >
                View {definition.entityKey}
              </button>
            )}
            {ticketProjectionQuery.data && (
              <button
                onClick={() =>
                  navigate(
                    `${location.pathname.startsWith('/portal') ? '/portal' : '/app'}/tickets/${ticketProjectionQuery.data.id}`,
                  )
                }
                className="px-5 py-3 rounded-xl bg-emerald-500 text-slate-950 font-black"
              >
                View ticket
              </button>
            )}
            <button
              onClick={() => {
                createMutation.reset();
                transitionMutation.reset();
                setFormState({ definitionId: definition.id, data: {} });
                setPendingAttachments([]);
                setAttachmentError('');
                setStakeholders({ userIds: [], unitIds: [] });
              }}
              className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-black"
            >
              Create another
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-5 py-3 rounded-xl border border-border/50 text-on-surface font-bold"
            >
              Back to catalog
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 w-full max-w-5xl mx-auto h-full flex flex-col">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-on-surface-variant hover:text-primary mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to catalog
      </button>

      {createPage && formContext && (
        <>
        {!restrictedForRequester && findPagePlacementsByWidgetKey(createPage, 'formStakeholders').length === 0 && (
          <div className="mb-5">
            {/* Compatibility fallback for definitions published before this
                widget existed. A new definition can position the same widget
                anywhere on its grid from Catalog Builder. */}
            <FormStakeholdersWidget context={formContext} />
          </div>
        )}
        <CatalogFormPage
          page={createPage}
          context={formContext}
          onSubmit={submit}
          className="bg-surface-container-low border border-border/40 rounded-3xl p-8 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
        />
        </>
      )}
    </div>
  );
}
