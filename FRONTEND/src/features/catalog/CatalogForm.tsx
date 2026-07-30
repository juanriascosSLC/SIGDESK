import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getTicket } from '@/features/tickets/api';
import {
  createEntity,
  isFieldRequired,
  getPublishedDefinition,
  transitionEntity,
  type FieldDefinition,
  type Placement,
} from './metamodel';
import { DynamicField } from './DynamicField';
import { DynamicLayout } from './runtime/DynamicLayout';
import {
  filterDocumentByFieldVisibility,
  resolveAudienceKeyFromPath,
  resolveLayoutDocument,
  visibleFieldPlacements,
} from './runtime/layout-normalizer';

function initialValue(field: FieldDefinition): unknown {
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
    }: {
      entityData: Record<string, unknown>;
      idempotencyKey: string;
    }) => createEntity(categoryId, entityData, idempotencyKey),
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
  const createdEntity = transitionMutation.data ?? createMutation.data;
  const ticketProjectionQuery = useQuery({
    queryKey: ['tickets', 'projection', createdEntity?.humanId ?? ''],
    queryFn: () => getTicket(createdEntity!.humanId),
    enabled: definition?.entityKey === 'INC' && Boolean(createdEntity?.humanId),
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
    createMutation.mutate({
      entityData: Object.fromEntries(activeKeys.map((key) => [key, effectiveData[key]])),
      idempotencyKey: crypto.randomUUID(),
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
