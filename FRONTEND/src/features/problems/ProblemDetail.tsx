import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Pencil,
  Plus,
  Save,
  SearchCode,
  Trash2,
  X,
} from 'lucide-react';
import { DynamicField } from '@/features/catalog/DynamicField';
import { SearchableEntityPicker } from '@/features/catalog/SearchableEntityPicker';
import {
  createEntityRelation,
  deleteEntityRelation,
  getEntity,
  getEntityManifest,
  isFieldRequired,
  isFieldVisible,
  listEntities,
  listEntityRelations,
  transitionEntity,
  updateEntity,
  type EntityRelation,
  type FieldDefinition,
} from '@/features/catalog/metamodel';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { listChanges } from '@/features/changes/api';
import { ProblemChangeDialog } from './ProblemChangeDialog';

const stateLabels: Record<string, string> = {
  under_investigation: 'En investigación',
  known_error: 'Error conocido',
  resolved: 'Resuelto',
};

function displayValue(field: FieldDefinition, value: unknown): string {
  if (value == null || value === '') return '—';
  if (field.type === 'select') {
    return field.options?.find((option) => option.value === value)?.label ?? String(value);
  }
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

function relationHref(relation: EntityRelation, problemId: string): string {
  const outbound = relation.sourceEntityId === problemId;
  const key = outbound ? relation.targetEntityKey : relation.sourceEntityKey;
  const id = outbound ? relation.targetHumanId : relation.sourceHumanId;
  if (key === 'INC') return `/app/tickets/${encodeURIComponent(id)}`;
  if (key === 'RFC') return `/app/changes/${encodeURIComponent(id)}`;
  if (key === 'PRB') return `/app/problems/${encodeURIComponent(id)}`;
  return '#';
}

export default function ProblemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can, displayName } = useAuth();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [showChangeDialog, setShowChangeDialog] = useState(false);
  const [notice, setNotice] = useState('');

  const problemQuery = useQuery({
    queryKey: ['problems', id],
    queryFn: () => getEntity('PRB', id!),
    enabled: Boolean(id),
  });
  const manifestQuery = useQuery({
    queryKey: ['problems', id, 'manifest'],
    queryFn: () => getEntityManifest('PRB', id!),
    enabled: Boolean(id),
  });
  const relationsQuery = useQuery({
    queryKey: ['problems', id, 'relations'],
    queryFn: () => listEntityRelations('PRB', id!),
    enabled: Boolean(id),
  });
  const incidentsQuery = useQuery({
    queryKey: ['catalog-entities', 'INC', 'relation-picker'],
    queryFn: () => listEntities('INC'),
    enabled: Boolean(
      id &&
        can(PERMISSIONS.problemsEdit) &&
        can(PERMISSIONS.ticketsView),
    ),
  });
  const changesQuery = useQuery({
    queryKey: ['changes'],
    queryFn: listChanges,
    enabled: Boolean(
      id &&
        can(PERMISSIONS.problemsEdit) &&
        can(PERMISSIONS.changesView),
    ),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      data,
      expectedUpdatedAt,
    }: {
      data: Record<string, unknown>;
      expectedUpdatedAt: string;
    }) => updateEntity('PRB', id!, data, expectedUpdatedAt),
    onSuccess: (updated) => {
      queryClient.setQueryData(['problems', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
      setEditing(false);
      setNotice('Investigación actualizada.');
    },
  });
  const transitionMutation = useMutation({
    mutationFn: (transitionKey: string) => transitionEntity('PRB', id!, transitionKey),
    onSuccess: (updated) => {
      queryClient.setQueryData(['problems', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
      setNotice(`Estado actualizado a ${stateLabels[updated.state] ?? updated.state}.`);
    },
  });
  const createRelationMutation = useMutation({
    mutationFn: ({
      relationKey,
      targetEntityKey,
      targetEntityId,
    }: {
      relationKey: string;
      targetEntityKey: string;
      targetEntityId: string;
    }) => createEntityRelation('PRB', id!, relationKey, targetEntityKey, targetEntityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['problems', id, 'relations'] });
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
      setNotice('Relación creada y validada contra la definición publicada.');
    },
  });
  const deleteRelationMutation = useMutation({
    mutationFn: (relationId: string) => deleteEntityRelation('PRB', id!, relationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['problems', id, 'relations'] });
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
    },
  });

  const editableFields = useMemo(() => {
    const specification = manifestQuery.data?.specification;
    if (!specification) return [];
    const keys = specification.views?.edit ?? specification.fields.map((field) => field.key);
    return specification.fields.filter(
      (field) => keys.includes(field.key) && isFieldVisible(field, editData),
    );
  }, [editData, manifestQuery.data]);

  if (problemQuery.isLoading || manifestQuery.isLoading || relationsQuery.isLoading) {
    return <div className="p-8 text-on-surface-variant">Cargando problema…</div>;
  }
  if (
    problemQuery.isError ||
    manifestQuery.isError ||
    relationsQuery.isError ||
    !problemQuery.data ||
    !manifestQuery.data
  ) {
    const error = problemQuery.error ?? manifestQuery.error ?? relationsQuery.error;
    return (
      <div className="p-8">
        <button onClick={() => navigate('/app/problems')} className="secondary-button mb-5">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
          No se pudo cargar el problema: {error?.message}
        </div>
      </div>
    );
  }

  const problem = problemQuery.data;
  const specification = manifestQuery.data.specification;
  const relations = relationsQuery.data ?? [];
  const availableTransitions = specification.lifecycle.transitions.filter(
    (transition) =>
      transition.from === problem.state &&
      can(PERMISSIONS.problemsResolve),
  );

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    const data: Record<string, unknown> = {};
    for (const field of specification.fields) {
      if (!isFieldVisible(field, editData)) continue;
      const value = editData[field.key];
      if (!isFieldRequired(field, editData) && (value === '' || value == null)) continue;
      data[field.key] = value;
    }
    updateMutation.mutate({ data, expectedUpdatedAt: problem.updatedAt });
  }

  const actionError =
    updateMutation.error ??
    transitionMutation.error ??
    createRelationMutation.error ??
    deleteRelationMutation.error;

  return (
    <div className="min-h-screen bg-surface-container-lowest p-6 lg:p-8">
      <div className="w-full space-y-6">
        <button onClick={() => navigate('/app/problems')} className="secondary-button">
          <ArrowLeft className="h-4 w-4" /> Volver a problemas
        </button>

        <section className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs font-bold text-primary">
                <SearchCode className="h-4 w-4" />
                {problem.humanId} · PRB v{problem.definitionVersion}
              </div>
              <h1 className="text-3xl font-black text-on-surface">
                {String(problem.data.title || 'Problema sin título')}
              </h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Registro de causa raíz separado de los incidentes y cambios vinculados.
              </p>
            </div>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black uppercase text-primary">
              {stateLabels[problem.state] ?? problem.state}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {can(PERMISSIONS.problemsEdit) && !editing && (
              <button
                onClick={() => {
                  setEditData(structuredClone(problem.data));
                  setEditing(true);
                  setNotice('');
                }}
                className="secondary-button"
              >
                <Pencil className="h-4 w-4" /> Editar investigación
              </button>
            )}
            {can(PERMISSIONS.problemsEdit) &&
              can(PERMISSIONS.changesView) &&
              can(PERMISSIONS.changesCreate) && (
                <button
                  onClick={() => setShowChangeDialog(true)}
                  className="primary-button"
                >
                  <Plus className="h-4 w-4" /> Crear RFC para resolver
                </button>
              )}
            {availableTransitions.map((transition) => (
              <button
                key={transition.key}
                onClick={() => transitionMutation.mutate(transition.key)}
                disabled={transitionMutation.isPending}
                className="primary-button disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {transition.label}
              </button>
            ))}
          </div>
        </section>

        {notice && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {notice}
          </div>
        )}
        {actionError && (
          <div className="flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {actionError.message}
          </div>
        )}

        {editing ? (
          <form onSubmit={submitEdit} className="rounded-3xl border border-primary/30 bg-surface-container-low">
            <div className="flex items-center justify-between border-b border-border/40 p-6">
              <h2 className="text-lg font-black text-on-surface">Actualizar análisis</h2>
              <button type="button" onClick={() => setEditing(false)} className="p-2 text-on-surface-variant">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-5 p-6 md:grid-cols-2">
              {editableFields.map((field) => (
                <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <DynamicField
                    field={field}
                    value={editData[field.key]}
                    required={isFieldRequired(field, editData)}
                    onChange={(value) => setEditData((current) => ({ ...current, [field.key]: value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t border-border/40 p-6">
              <button type="button" onClick={() => setEditing(false)} className="secondary-button">Cancelar</button>
              <button type="submit" disabled={updateMutation.isPending} className="primary-button disabled:opacity-50">
                <Save className="h-4 w-4" /> Guardar
              </button>
            </div>
          </form>
        ) : (
          <section className="grid gap-4 rounded-3xl border border-border/40 bg-surface-container-low p-6 md:grid-cols-2">
            {specification.fields.map((field) => (
              <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                <div className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{field.label}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-on-surface">
                  {displayValue(field, problem.data[field.key])}
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
          <div className="mb-5 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black text-on-surface">Relaciones de negocio</h2>
          </div>
          <p className="mb-5 text-sm text-on-surface-variant">
            Los vínculos conservan ambos IDs, las versiones de definición y el contrato relacional con que fueron creados.
          </p>

          {can(PERMISSIONS.problemsEdit) && (
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              {(specification.relations ?? []).map((relation) => {
                const query =
                  relation.targetEntityKey === 'INC'
                    ? incidentsQuery
                    : changesQuery;
                const excludedIds = new Set(
                  relations
                    .filter(
                      (existing) =>
                        existing.sourceEntityId === problem.id &&
                        existing.relationKey === relation.key,
                    )
                    .map((existing) => existing.targetEntityId),
                );
                return (
                  <SearchableEntityPicker
                    key={relation.key}
                    label={relation.label}
                    entityKey={relation.targetEntityKey}
                    items={query.data ?? []}
                    excludedIds={excludedIds}
                    loading={query.isLoading}
                    pending={createRelationMutation.isPending}
                    onSelect={(target) =>
                      createRelationMutation.mutate({
                        relationKey: relation.key,
                        targetEntityKey: relation.targetEntityKey,
                        targetEntityId: target.id,
                      })
                    }
                  />
                );
              })}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {relations.map((relation) => {
              const outbound = relation.sourceEntityId === problem.id;
              const entityKey = outbound ? relation.targetEntityKey : relation.sourceEntityKey;
              const humanId = outbound ? relation.targetHumanId : relation.sourceHumanId;
              const label = outbound ? relation.relationLabel : relation.inverseLabel;
              return (
                <div key={relation.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-surface-container p-4">
                  <Link to={relationHref(relation, problem.id)} className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase text-on-surface-variant">{label}</div>
                    <div className="mt-1 font-mono text-sm font-bold text-primary">{humanId}</div>
                    <div className="text-xs text-on-surface-variant">{entityKey} · contrato v{relation.contractVersion}</div>
                  </Link>
                  {can(PERMISSIONS.problemsEdit) && (
                    <button
                      onClick={() => deleteRelationMutation.mutate(relation.id)}
                      className="rounded-xl p-2 text-on-surface-variant hover:bg-red-500/10 hover:text-red-300"
                      aria-label="Eliminar relación"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {relations.length === 0 && (
              <div className="md:col-span-2 rounded-2xl border border-dashed border-border/40 p-8 text-center text-sm text-on-surface-variant">
                Aún no hay INC ni RFC vinculados a este problema.
              </div>
            )}
          </div>
        </section>
      </div>
      <ProblemChangeDialog
        open={showChangeDialog}
        problem={problem}
        currentUserName={displayName}
        onClose={() => setShowChangeDialog(false)}
        onLinked={() => {
          void queryClient.invalidateQueries({
            queryKey: ['problems', id, 'relations'],
          });
        }}
      />
    </div>
  );
}
