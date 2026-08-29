import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getTicket } from '@/features/tickets/api';
import {
  createEntity,
  isFieldRequired,
  getPublishedDefinition,
  listAgentesIT,
  listRecursos,
  transitionEntity,
  type BindingValue,
  type FieldDefinition,
  type Placement,
} from './metamodel';
import { BindingPicker } from './BindingPicker';
import { DynamicField } from './DynamicField';
import { DynamicLayout } from './runtime/DynamicLayout';
import {
  filterDocumentByFieldVisibility,
  resolveAudienceKeyFromPath,
  resolveLayoutDocument,
  visibleFieldPlacements,
} from './runtime/layout-normalizer';

function initialValue(field: FieldDefinition): unknown {
  // TODO-103 — un campo bindsTo guarda un BindingValue (objeto) o nada, nunca
  // un string vacío: `''` pasaría el chequeo de "valor presente" de
  // isFieldRequired/evaluateCondition de forma incorrecta para este shape.
  if (field.bindsTo) return null;
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'boolean') return false;
  return '';
}

export default function CatalogForm() {
  const { categoryId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  const createMutation = useMutation({
    mutationFn: ({
      entityData,
      idempotencyKey,
      binding,
    }: {
      entityData: Record<string, unknown>;
      idempotencyKey: string;
      binding?: { recursoId?: string; agenteItId?: string };
    }) => createEntity(categoryId, entityData, idempotencyKey, binding),
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
  const createDocument = definition
    ? filterDocumentByFieldVisibility(
        resolveLayoutDocument(definition.specification, 'create', audienceKey),
        definition.specification.fields,
        effectiveData,
      )
    : null;

  // TODO-103 — campos bindsTo requieren un fetch real de recurso/agente IT.
  // Restricción de audiencia (review de Diseño de esta sesión): la búsqueda
  // libre de catálogo completo NUNCA se habilita para `requester` (portal
  // self-service) — resource_service/organization_service no filtran por
  // responsable todavía (TODO-24), así que mostrarles el inventario completo
  // sería una fuga de alcance real. El backend YA exige el permiso real
  // (recursos:read:global/agentes_it:read:global) — esto es solo UX, no la
  // mitigación de seguridad (esa ya vive en el backend, Fase A).
  const bindingFields = definition?.specification.fields.filter((field) => field.bindsTo) ?? [];
  const needsRecursoPicker = bindingFields.some((field) => field.bindsTo === 'recursoId');
  const needsAgentePicker = bindingFields.some((field) => field.bindsTo === 'agenteItId');
  const restrictedForRequester = audienceKey === 'requester';
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
  const createdEntity = transitionMutation.data ?? createMutation.data;
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
    setFormState((current) => ({
      definitionId: definition?.id,
      data: {
        ...(current.definitionId === definition?.id ? current.data : {}),
        [key]: value,
      },
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const activeKeys = createDocument
      ? visibleFieldPlacements(createDocument, effectiveData)
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
    const binding: { recursoId?: string; agenteItId?: string } = {};
    for (const field of bindingFields) {
      const bound = effectiveData[field.key] as BindingValue | null;
      if (!bound) continue;
      if (field.bindsTo === 'recursoId') binding.recursoId = bound.id;
      if (field.bindsTo === 'agenteItId') binding.agenteItId = bound.id;
    }
    createMutation.mutate({
      entityData: Object.fromEntries(dataKeys.map((key) => [key, effectiveData[key]])),
      idempotencyKey: crypto.randomUUID(),
      binding,
    });
  }

  if (definitionQuery.isLoading) {
    return <div className="p-8 text-on-surface-variant">Interpretando definición…</div>;
  }
  if (definitionQuery.isError || !definition) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="text-primary mb-6">← Volver</button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-red-300">
          No existe una definición publicada para <strong>{categoryId.toUpperCase()}</strong>.
        </div>
      </div>
    );
  }

  if (createdEntity) {
    const availableTransitions = definition.specification.lifecycle.transitions.filter(
      (transition) => transition.from === createdEntity.state,
    );
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-surface-container-low border border-emerald-500/30 rounded-3xl p-10 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-5" />
          <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300 mb-2">
            Registro creado
          </div>
          <h1 className="text-3xl font-black text-on-surface">{createdEntity.humanId}</h1>
          <p className="text-on-surface-variant mt-3">
            Ejecutando {definition.entityKey} v{createdEntity.definitionVersion} en estado{' '}
            <strong className="text-on-surface">{createdEntity.state}</strong>.
          </p>
          <p className="text-[11px] font-mono text-on-surface-variant mt-2">
            definición {createdEntity.definitionVersionId} · esquema {createdEntity.schemaVersion}
          </p>
          {definition.entityKey === 'INC' && (
            <div className="mt-5 rounded-xl border border-border/40 bg-surface-container p-4">
              {ticketProjectionQuery.data ? (
                <p className="text-sm text-emerald-300">
                  El registro ya está disponible en Tickets.
                </p>
              ) : ticketProjectionQuery.isError ? (
                <p className="text-sm text-amber-300">
                  El registro fue creado. La proyección en Tickets continúa en segundo plano.
                </p>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  Sincronizando con el módulo Tickets…
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
            {ticketProjectionQuery.data && (
              <button
                onClick={() =>
                  navigate(
                    `${location.pathname.startsWith('/portal') ? '/portal' : '/app'}/tickets/${ticketProjectionQuery.data.id}`,
                  )
                }
                className="px-5 py-3 rounded-xl bg-emerald-500 text-slate-950 font-black"
              >
                Ver ticket
              </button>
            )}
            <button
              onClick={() => {
                createMutation.reset();
                transitionMutation.reset();
                setFormState({ definitionId: definition.id, data: {} });
              }}
              className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-black"
            >
              Crear otro
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-5 py-3 rounded-xl border border-border/50 text-on-surface font-bold"
            >
              Volver al catálogo
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
        Volver al catálogo
      </button>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-on-surface">{definition.name}</h1>
            <span className="font-mono text-xs text-primary">
              {definition.entityKey} · v{definition.version}
            </span>
          </div>
          <p className="text-sm text-on-surface-variant">{definition.specification.description}</p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="bg-surface-container-low border border-border/40 rounded-3xl p-8 space-y-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
      >
        {createDocument && (
          <DynamicLayout
            document={createDocument}
            data={effectiveData}
            renderPlacement={(placement: Placement) => {
              if (placement.kind !== 'field' || placement.source !== 'catalog' || !placement.fieldKey) {
                return null;
              }
              const field = definition.specification.fields.find(
                (candidate) => candidate.key === placement.fieldKey,
              );
              if (!field) return null;
              if (field.bindsTo) {
                const kind = field.bindsTo === 'recursoId' ? 'recurso' : 'agenteIt';
                const query = kind === 'recurso' ? recursosQuery : agentesQuery;
                const items = kind === 'recurso'
                  ? (query.data ?? []).filter(
                      (item) => !field.resourceType || item.tipo === field.resourceType,
                    )
                  : query.data ?? [];
                return (
                  <BindingPicker
                    label={field.label}
                    kind={kind}
                    items={items}
                    loading={query.isLoading}
                    isError={query.isError}
                    onRetry={() => query.refetch()}
                    value={(effectiveData[field.key] as BindingValue | null) ?? null}
                    onSelect={(value) => updateField(field.key, value)}
                    required={isFieldRequired(field, effectiveData)}
                    restrictedMessage={
                      restrictedForRequester
                        ? 'No encontramos tu equipo asignado todavía — contacta a IT para crear esta solicitud.'
                        : undefined
                    }
                  />
                );
              }
              return (
                <DynamicField
                  field={field}
                  value={effectiveData[field.key]}
                  required={isFieldRequired(field, effectiveData)}
                  onChange={(value) => updateField(field.key, value)}
                />
              );
            }}
          />
        )}

        <div className="pt-4 border-t border-border/40 flex items-center justify-end gap-4">
          {createMutation.isError && (
            <p className="mr-auto text-sm text-red-400">{createMutation.error.message}</p>
          )}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-3 rounded-xl border border-border/50 text-on-surface font-bold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-black disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creando…' : `Crear ${definition.entityKey}`}
          </button>
        </div>
      </form>
    </div>
  );
}
