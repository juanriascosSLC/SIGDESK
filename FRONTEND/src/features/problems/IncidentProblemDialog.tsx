import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, GitBranch, Link2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DynamicField } from '@/features/catalog/DynamicField';
import { SearchableEntityPicker } from '@/features/catalog/SearchableEntityPicker';
import {
  createEntity,
  createEntityRelation,
  getEntityPresentation,
  isFieldRequired,
  isFieldVisible,
  listEntities,
  type EntityRecord,
  type FieldDefinition,
} from '@/features/catalog/metamodel';
import type { Ticket } from '@/features/tickets/types';

type Props = {
  open: boolean;
  ticket: Ticket;
  currentUserName: string;
  linkedProblemIds: Set<string>;
  onClose: () => void;
  onLinked: () => void;
};

function initialProblemData(
  fields: FieldDefinition[],
  ticket: Ticket,
  currentUserName: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) data[field.key] = field.defaultValue;
  }
  const priority = ticket.priority.toLowerCase();
  return {
    ...data,
    title: `Problema recurrente: ${ticket.title}`,
    description: `Investigación de causa raíz iniciada desde ${ticket.id}. ${ticket.description}`,
    impact: ['low', 'medium', 'high', 'critical'].includes(priority)
      ? priority
      : 'medium',
    serviceAffected:
      ticket.site || ticket.assetId || ticket.category || 'Servicio por determinar',
    owner: currentUserName,
  };
}

export function IncidentProblemDialog({
  open,
  ticket,
  currentUserName,
  linkedProblemIds,
  onClose,
  onLinked,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const idempotencyKey = useRef(crypto.randomUUID());

  const definitionQuery = useQuery({
    queryKey: ['catalog-definition', 'PRB', 'published'],
    queryFn: () => getEntityPresentation('PRB'),
    enabled: open,
  });
  const problemsQuery = useQuery({
    queryKey: ['problems', 'relation-picker'],
    queryFn: () => listEntities('PRB'),
    enabled: open && mode === 'link',
  });

  useEffect(() => {
    if (!open || !definitionQuery.data) return;
    // The published metamodel arrives asynchronously; opening the workflow
    // establishes a fresh, definition-driven draft for this specific INC.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData(
      initialProblemData(
        definitionQuery.data.specification.fields,
        ticket,
        currentUserName,
      ),
    );
    idempotencyKey.current = crypto.randomUUID();
  }, [currentUserName, definitionQuery.data, open, ticket]);

  const createFields = useMemo(() => {
    const specification = definitionQuery.data?.specification;
    if (!specification) return [];
    const keys =
      specification.views?.create ??
      specification.fields.map((field) => field.key);
    return specification.fields.filter(
      (field) => keys.includes(field.key) && isFieldVisible(field, formData),
    );
  }, [definitionQuery.data, formData]);

  const workflowMutation = useMutation({
    mutationFn: async (existing?: EntityRecord) => {
      if (!ticket.entityId) throw new Error('El ticket no está vinculado a una entidad INC.');
      let problem = existing;
      if (!problem) {
        const specification = definitionQuery.data?.specification;
        if (!specification) throw new Error('La definición PRB no está disponible.');
        const data: Record<string, unknown> = {};
        for (const field of specification.fields) {
          if (!isFieldVisible(field, formData)) continue;
          const value = formData[field.key];
          if (!isFieldRequired(field, formData) && (value === '' || value == null)) continue;
          data[field.key] = value;
        }
        problem = await createEntity('PRB', data, idempotencyKey.current);
      }
      await createEntityRelation(
        'PRB',
        problem.id,
        'investigates',
        'INC',
        ticket.entityId,
      );
      return problem;
    },
    onSuccess: (problem) => {
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
      onLinked();
      onClose();
      navigate(`/app/problems/${encodeURIComponent(problem.humanId)}`);
    },
  });

  if (!open) return null;

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    workflowMutation.mutate(undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-primary/30 bg-surface-container-low shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/40 bg-surface-container-low/95 p-6 backdrop-blur-md">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary">
              <GitBranch className="h-4 w-4" /> INC → PRB
            </div>
            <h2 className="text-xl font-black text-on-surface">Gestionar problema asociado</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              El incidente permanece en Tickets; la investigación de causa raíz se administra como PRB.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-border/40 px-6 pt-5">
          {(['create', 'link'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setMode(tab);
                workflowMutation.reset();
              }}
              className={`border-b-2 px-4 py-3 text-xs font-black ${
                mode === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant'
              }`}
            >
              {tab === 'create' ? 'Crear nuevo PRB' : 'Vincular PRB existente'}
            </button>
          ))}
        </div>

        {mode === 'create' ? (
          <form onSubmit={submitCreate}>
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
            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border/40 bg-surface-container-low/95 p-6">
              <button type="button" onClick={onClose} className="secondary-button">Cancelar</button>
              <button type="submit" disabled={workflowMutation.isPending || !definitionQuery.data} className="primary-button disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" />
                {workflowMutation.isPending ? 'Creando y vinculando…' : 'Crear PRB y vincular'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6">
            <SearchableEntityPicker
              label="Selecciona el problema que investiga este incidente"
              entityKey="PRB"
              items={problemsQuery.data ?? []}
              excludedIds={linkedProblemIds}
              loading={problemsQuery.isLoading}
              pending={workflowMutation.isPending}
              onSelect={(problem) => workflowMutation.mutate(problem)}
            />
          </div>
        )}

        {workflowMutation.isError && (
          <div className="mx-6 mb-6 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {workflowMutation.error.message}
          </div>
        )}
        {mode === 'link' && !workflowMutation.isPending && (
          <div className="flex justify-end border-t border-border/40 p-6">
            <button type="button" onClick={onClose} className="secondary-button">
              <Link2 className="h-4 w-4" /> Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
