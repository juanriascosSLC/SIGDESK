import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileCheck2,
  GitBranch,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DynamicField } from '@/features/catalog/DynamicField';
import {
  isFieldRequired,
  isFieldVisible,
  listEntityRelations,
  type FieldDefinition,
  type TransitionDefinition,
} from '@/features/catalog/metamodel';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { ApiError } from '@/lib/apiClient';
import {
  getChange,
  getChangeManifest,
  transitionChange,
  updateChange,
} from './api';
import {
  changeStateLabels,
  changeStateStyles,
  formatDateTime,
  riskStyles,
  textData,
} from './presentation';

function fieldValue(field: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'date') {
    const date = new Date(`${String(value)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }
  if (field.type === 'datetime') return formatDateTime(value);
  if (field.type === 'select') {
    return field.options?.find((option) => option.value === value)?.label ?? String(value);
  }
  return String(value);
}

function transitionPermission(key: string): string {
  if (['approve', 'reject'].includes(key)) return PERMISSIONS.changesApprove;
  if (
    ['start', 'complete', 'fail', 'rollback', 'close', 'close_after_rollback'].includes(key)
  ) {
    return PERMISSIONS.changesImplement;
  }
  return PERMISSIONS.changesEdit;
}

function transitionStyle(key: string): string {
  if (['reject', 'fail', 'rollback'].includes(key)) {
    return 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20';
  }
  if (['approve', 'complete', 'close', 'close_after_rollback'].includes(key)) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20';
  }
  return 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20';
}

function widthClass(width?: string): string {
  if (width === 'full') return 'md:col-span-2 xl:col-span-3';
  if (width === 'half') return 'xl:col-span-1';
  return '';
}

export default function ChangeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [notice, setNotice] = useState('');

  const changeQuery = useQuery({
    queryKey: ['changes', id],
    queryFn: () => getChange(id!),
    enabled: Boolean(id),
  });
  const manifestQuery = useQuery({
    queryKey: ['changes', id, 'manifest'],
    queryFn: () => getChangeManifest(id!),
    enabled: Boolean(id && changeQuery.data),
  });
  const relationsQuery = useQuery({
    queryKey: ['changes', id, 'relations'],
    queryFn: () => listEntityRelations('RFC', id!),
    enabled: Boolean(id && changeQuery.data),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      data,
      expectedUpdatedAt,
    }: {
      data: Record<string, unknown>;
      expectedUpdatedAt: string;
    }) => updateChange(id!, data, expectedUpdatedAt),
    onSuccess: (updated) => {
      queryClient.setQueryData(['changes', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['changes'] });
      setEditData(structuredClone(updated.data));
      setIsEditing(false);
      setNotice('Datos actualizados y riesgo recalculado.');
    },
  });
  const transitionMutation = useMutation({
    mutationFn: async (transition: TransitionDefinition) => {
      let current = changeQuery.data!;
      let data = current.data;
      if (transition.key === 'reject') {
        const reason = window.prompt('Justificación obligatoria del rechazo:');
        if (!reason?.trim()) throw new Error('El rechazo requiere una justificación.');
        data = { ...data, approvalNotes: reason.trim() };
        current = await updateChange(current.id, data, current.updatedAt);
        queryClient.setQueryData(['changes', id], current);
      }
      if (['complete', 'fail'].includes(transition.key)) {
        const result = window.prompt(
          transition.key === 'complete'
            ? 'Describe el resultado y las validaciones realizadas:'
            : 'Describe la falla observada y el estado actual:',
        );
        if (!result?.trim()) throw new Error('Debes registrar el resultado de implementación.');
        data = { ...current.data, implementationResult: result.trim() };
        current = await updateChange(current.id, data, current.updatedAt);
        queryClient.setQueryData(['changes', id], current);
      }
      return transitionChange(current.id, transition.key);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['changes', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['changes'] });
      setNotice(`Estado actualizado a ${changeStateLabels[updated.state] ?? updated.state}.`);
    },
  });

  const editableFields = useMemo(() => {
    const specification = manifestQuery.data?.specification;
    if (!specification) return [];
    const keys =
      specification.views?.edit ??
      specification.fields.map((field) => field.key);
    return specification.fields.filter(
      (field) =>
        field.key !== 'riskLevel' &&
        keys.includes(field.key) &&
        isFieldVisible(field, editData),
    );
  }, [editData, manifestQuery.data]);

  const detailFields = useMemo(() => {
    const specification = manifestQuery.data?.specification;
    const change = changeQuery.data;
    if (!specification || !change) return [];
    const placements =
      specification.detailLayout?.fields?.filter(
        (placement) => placement.source === 'catalog',
      ) ??
      specification.fields.map((field) => ({
        source: 'catalog' as const,
        fieldKey: field.key,
        width: field.type === 'textarea' ? 'full' : 'half',
      }));
    return placements
      .map((placement) => ({
        placement,
        field: specification.fields.find(
          (field) => field.key === placement.fieldKey,
        ),
      }))
      .filter(
        (
          item,
        ): item is {
          placement: (typeof placements)[number];
          field: FieldDefinition;
        } =>
          Boolean(
            item.field &&
              isFieldVisible(item.field, change.data),
          ),
      );
  }, [changeQuery.data, manifestQuery.data]);

  if (changeQuery.isLoading || manifestQuery.isLoading) {
    return (
      <div className="min-h-screen bg-surface-container-lowest p-8 text-on-surface-variant">
        Cargando solicitud de cambio…
      </div>
    );
  }
  if (changeQuery.isError || manifestQuery.isError || !changeQuery.data || !manifestQuery.data) {
    const message =
      changeQuery.error?.message ??
      manifestQuery.error?.message ??
      'La RFC solicitada no existe.';
    return (
      <div className="min-h-screen bg-surface-container-lowest p-8">
        <button onClick={() => navigate('/app/changes')} className="secondary-button mb-6">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          {message}
        </div>
      </div>
    );
  }

  const change = changeQuery.data;
  const specification = manifestQuery.data.specification;
  const risk = textData(change, 'riskLevel') || 'medium';
  const availableTransitions = specification.lifecycle.transitions.filter(
    (transition) =>
      transition.from === change.state &&
      can(transitionPermission(transition.key)),
  );
  const relatedIncidents = textData(change, 'relatedIncidentIds')
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  function startEditing() {
    setEditData(structuredClone(change.data));
    updateMutation.reset();
    setNotice('');
    setIsEditing(true);
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    const data: Record<string, unknown> = {};
    for (const field of specification.fields) {
      if (field.key === 'riskLevel' || !isFieldVisible(field, editData)) continue;
      const value = editData[field.key];
      if (!isFieldRequired(field, editData) && (value === '' || value == null)) {
        continue;
      }
      data[field.key] = value;
    }
    updateMutation.mutate({
      data,
      expectedUpdatedAt: change.updatedAt,
    });
  }

  const actionError = transitionMutation.error ?? updateMutation.error;

  return (
    <div className="min-h-screen bg-surface-container-lowest p-6 lg:p-8">
      <div className="w-full">
        <button
          onClick={() => navigate('/app/changes')}
          className="mb-6 flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al tablero
        </button>

        <header className="mb-6 rounded-3xl border border-border/40 bg-surface-container-low p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-primary">
                  {change.humanId}
                </span>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${changeStateStyles[change.state] ?? changeStateStyles.draft}`}>
                  {changeStateLabels[change.state] ?? change.state}
                </span>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${riskStyles[risk] ?? riskStyles.medium}`}>
                  Riesgo {risk}
                </span>
              </div>
              <h1 className="text-3xl font-black text-on-surface">
                {textData(change, 'title') || 'Solicitud de cambio'}
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-on-surface-variant">
                {textData(change, 'description')}
              </p>
            </div>
            {can(PERMISSIONS.changesEdit) && (
              <button
                onClick={startEditing}
                disabled={isEditing}
                className="secondary-button disabled:opacity-40"
              >
                <Pencil className="h-4 w-4" />
                Editar datos
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border/40 pt-5">
            {availableTransitions.map((transition) => (
              <button
                key={transition.key}
                onClick={() => {
                  transitionMutation.reset();
                  setNotice('');
                  transitionMutation.mutate(transition);
                }}
                disabled={transitionMutation.isPending || isEditing}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition disabled:opacity-40 ${transitionStyle(transition.key)}`}
              >
                {['reject', 'fail', 'rollback'].includes(transition.key) ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {transition.label}
              </button>
            ))}
            {availableTransitions.length === 0 && (
              <span className="text-xs text-on-surface-variant">
                No hay acciones disponibles para tu permiso y el estado actual.
              </span>
            )}
          </div>
        </header>

        {notice && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            {notice}
          </div>
        )}
        {actionError && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {actionError instanceof ApiError && actionError.status === 409
                ? 'La RFC cambió mientras la editabas. Recarga la página antes de continuar.'
                : actionError.message}
            </span>
          </div>
        )}

        {isEditing && (
          <form
            onSubmit={submitEdit}
            className="mb-6 rounded-3xl border border-primary/30 bg-surface-container-low p-6"
          >
            <div className="flex items-start justify-between border-b border-border/40 pb-4">
              <div>
                <h2 className="font-black text-on-surface">Editar RFC</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Campos interpretados desde la definición inmutable v{change.definitionVersion}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5"
                aria-label="Cancelar edición"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {editableFields.map((field) => (
                <div
                  key={field.key}
                  className={field.type === 'textarea' ? 'md:col-span-2' : ''}
                >
                  <DynamicField
                    field={field}
                    value={editData[field.key]}
                    required={isFieldRequired(field, editData)}
                    onChange={(value) =>
                      setEditData((current) => ({ ...current, [field.key]: value }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-border/40 pt-5">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="secondary-button"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="primary-button disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}

        <div className="mb-6 rounded-3xl border border-border/40 bg-surface-container-low p-6">
          <div className="mb-5 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h2 className="font-black text-on-surface">Ciclo de vida</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {specification.lifecycle.states.map((state) => (
              <div
                key={state.key}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                  state.key === change.state
                    ? changeStateStyles[state.key] ?? changeStateStyles.draft
                    : 'border-border/40 bg-surface-container text-on-surface-variant'
                }`}
              >
                <CircleDot className="h-3.5 w-3.5" />
                {state.label}
              </div>
            ))}
          </div>
        </div>

        <section className="mb-6 rounded-3xl border border-border/40 bg-surface-container-low p-6">
          <div className="mb-5 flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <h2 className="font-black text-on-surface">Definición y plan del cambio</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {detailFields.map(({ field, placement }) => (
              <div
                key={field.key}
                className={`rounded-2xl border border-border/30 bg-surface-container p-4 ${widthClass(placement.width)}`}
              >
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                  {('label' in placement ? placement.label : undefined) || field.label}
                </div>
                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-on-surface">
                  {fieldValue(field, change.data[field.key])}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-black text-on-surface">Trazabilidad</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-on-surface-variant">Definición ejecutable</dt>
                <dd className="font-mono text-on-surface">RFC v{change.definitionVersion}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-on-surface-variant">Creada</dt>
                <dd className="text-right text-on-surface">{formatDateTime(change.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-on-surface-variant">Última actualización</dt>
                <dd className="text-right text-on-surface">{formatDateTime(change.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-on-surface-variant">Checksum</dt>
                <dd className="max-w-[220px] truncate font-mono text-xs text-on-surface">
                  {change.manifestChecksum}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
            <div className="mb-4 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <h2 className="font-black text-on-surface">Relaciones ITSM</h2>
            </div>
            <div className="space-y-4">
              {(relationsQuery.data?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {relationsQuery.data?.map((relation) => {
                    const outbound = relation.sourceEntityId === change.id;
                    const entityKey = outbound ? relation.targetEntityKey : relation.sourceEntityKey;
                    const humanId = outbound ? relation.targetHumanId : relation.sourceHumanId;
                    const label = outbound ? relation.relationLabel : relation.inverseLabel;
                    const destination =
                      entityKey === 'PRB'
                        ? `/app/problems/${encodeURIComponent(humanId)}`
                        : entityKey === 'INC'
                          ? `/app/tickets/${encodeURIComponent(humanId)}`
                          : '#';
                    return (
                      <button
                        key={relation.id}
                        onClick={() => navigate(destination)}
                        className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-left"
                      >
                        <span className="block text-[9px] font-black uppercase text-on-surface-variant">{label}</span>
                        <span className="font-mono text-xs font-bold text-primary">{humanId}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div>
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                  Problema relacionado
                </div>
                <div className="text-sm text-on-surface">
                  {relationsQuery.data?.some((relation) =>
                    relation.sourceEntityKey === 'PRB' || relation.targetEntityKey === 'PRB'
                  )
                    ? 'Gestionado mediante relaciones versionadas'
                    : textData(change, 'relatedProblemId') || 'Sin PRB relacionado'}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                  Incidentes relacionados
                </div>
                <div className="flex flex-wrap gap-2">
                  {relatedIncidents.map((incident) => (
                    <button
                      key={incident}
                      onClick={() => navigate(`/app/tickets/${encodeURIComponent(incident)}`)}
                      className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 font-mono text-xs font-bold text-primary"
                    >
                      {incident}
                    </button>
                  ))}
                  {relatedIncidents.length === 0 && (
                    <span className="text-sm text-on-surface">Sin INC relacionados</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
