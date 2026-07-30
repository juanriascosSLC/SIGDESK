import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, GitBranch, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DynamicField } from '@/features/catalog/DynamicField';
import {
  createEntityRelation,
  isFieldRequired,
  isFieldVisible,
  type EntityRecord,
  type FieldDefinition,
} from '@/features/catalog/metamodel';
import { createChange, getChangeDefinition } from '@/features/changes/api';

type Props = {
  open: boolean;
  problem: EntityRecord;
  currentUserName: string;
  onClose: () => void;
  onLinked: () => void;
};

const legacyRelationFields = new Set(['relatedProblemId', 'relatedIncidentIds']);

function initialChangeData(
  fields: FieldDefinition[],
  problem: EntityRecord,
  currentUserName: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) data[field.key] = field.defaultValue;
  }
  const rootCause = String(problem.data.rootCause || problem.data.description || '');
  return {
    ...data,
    title: `Resolver ${problem.humanId}: ${String(problem.data.title || 'causa raíz')}`,
    description: `Cambio controlado para resolver ${problem.humanId}. ${rootCause}`,
    changeType: data.changeType || 'normal',
    requester: currentUserName,
    changeOwner: currentUserName,
    serviceAffected: problem.data.serviceAffected || 'Servicio por determinar',
    reason: `Eliminar la causa raíz documentada en ${problem.humanId}: ${rootCause}`,
    impact: problem.data.impact || data.impact || 'medium',
    urgency: data.urgency || 'medium',
    likelihood: data.likelihood || 'medium',
  };
}

export function ProblemChangeDialog({
  open,
  problem,
  currentUserName,
  onClose,
  onLinked,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const idempotencyKey = useRef(crypto.randomUUID());
  const definitionQuery = useQuery({
    queryKey: ['changes', 'definition'],
    queryFn: getChangeDefinition,
    enabled: open,
  });

  useEffect(() => {
    if (!open || !definitionQuery.data) return;
    // The Change definition is loaded by its owning module; once available,
    // create the guided RFC draft from the current PRB.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData(
      initialChangeData(
        definitionQuery.data.specification.fields,
        problem,
        currentUserName,
      ),
    );
    idempotencyKey.current = crypto.randomUUID();
  }, [currentUserName, definitionQuery.data, open, problem]);

  const createFields = useMemo(() => {
    const specification = definitionQuery.data?.specification;
    if (!specification) return [];
    const keys =
      specification.views?.create ??
      specification.fields.map((field) => field.key);
    return specification.fields.filter(
      (field) =>
        keys.includes(field.key) &&
        field.key !== 'riskLevel' &&
        !legacyRelationFields.has(field.key) &&
        isFieldVisible(field, formData),
    );
  }, [definitionQuery.data, formData]);

  const workflowMutation = useMutation({
    mutationFn: async () => {
      const specification = definitionQuery.data?.specification;
      if (!specification) throw new Error('La definición RFC no está disponible.');
      const data: Record<string, unknown> = {};
      for (const field of specification.fields) {
        if (
          field.key === 'riskLevel' ||
          legacyRelationFields.has(field.key) ||
          !isFieldVisible(field, formData)
        ) {
          continue;
        }
        const value = formData[field.key];
        if (!isFieldRequired(field, formData) && (value === '' || value == null)) continue;
        data[field.key] = value;
      }
      const change = await createChange(data, idempotencyKey.current);
      await createEntityRelation('PRB', problem.id, 'resolvedBy', 'RFC', change.id);
      return change;
    },
    onSuccess: (change) => {
      void queryClient.invalidateQueries({ queryKey: ['changes'] });
      onLinked();
      onClose();
      navigate(`/app/changes/${encodeURIComponent(change.humanId)}`);
    },
  });

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    workflowMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-primary/30 bg-surface-container-low shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/40 bg-surface-container-low/95 p-6 backdrop-blur-md">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary">
              <GitBranch className="h-4 w-4" /> PRB → RFC
            </div>
            <h2 className="text-xl font-black text-on-surface">Crear cambio para resolver la causa raíz</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Change Management calculará el riesgo y administrará la RFC; el PRB solo conservará la relación tipada.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-5 p-6 md:grid-cols-2">
          {createFields.map((field) => (
            <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
              <DynamicField
                field={field}
                value={formData[field.key]}
                required={isFieldRequired(field, formData)}
                onChange={(value) =>
                  setFormData((current) => ({ ...current, [field.key]: value }))
                }
              />
            </div>
          ))}
        </div>
        {workflowMutation.isError && (
          <div className="mx-6 mb-4 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {workflowMutation.error.message}
          </div>
        )}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border/40 bg-surface-container-low/95 p-6">
          <button type="button" onClick={onClose} className="secondary-button">Cancelar</button>
          <button type="submit" disabled={workflowMutation.isPending || !definitionQuery.data} className="primary-button disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" />
            {workflowMutation.isPending ? 'Creando y vinculando…' : 'Crear RFC y vincular'}
          </button>
        </div>
      </form>
    </div>
  );
}
