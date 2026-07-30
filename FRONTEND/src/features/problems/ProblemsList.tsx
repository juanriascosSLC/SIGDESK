import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Link2,
  Plus,
  SearchCode,
  Wrench,
  X,
} from 'lucide-react';
import { DynamicField } from '@/features/catalog/DynamicField';
import {
  createEntity,
  getEntityPresentation,
  isFieldRequired,
  isFieldVisible,
  listEntities,
  listEntityRelations,
  type EntityRecord,
  type FieldDefinition,
} from '@/features/catalog/metamodel';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { ApiError } from '@/lib/apiClient';

const stateLabels: Record<string, string> = {
  under_investigation: 'En investigación',
  known_error: 'Error conocido',
  resolved: 'Resuelto',
};

function initialFormData(fields: FieldDefinition[]): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, field.defaultValue]),
  );
}

function text(problem: EntityRecord, key: string): string {
  const value = problem.data[key];
  return value == null ? '' : String(value);
}

function stateStyle(state: string) {
  if (state === 'known_error') {
    return 'border-red-500/30 bg-red-500/15 text-red-300';
  }
  if (state === 'resolved') {
    return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
  }
  return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
}

export default function ProblemsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const definitionQuery = useQuery({
    queryKey: ['problems', 'definition'],
    queryFn: () => getEntityPresentation('PRB'),
  });
  const problemsQuery = useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      const problems = await listEntities('PRB');
      const relationEntries = await Promise.all(
        problems.map(async (problem) => [
          problem.id,
          await listEntityRelations('PRB', problem.id),
        ] as const),
      );
      return {
        problems,
        relations: new Map(relationEntries),
      };
    },
    refetchInterval: 20_000,
  });
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      createEntity('PRB', data, crypto.randomUUID()),
    onSuccess: (problem) => {
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
      setShowCreate(false);
      navigate(`/app/problems/${problem.id}`);
    },
  });

  const createFields = useMemo(() => {
    const specification = definitionQuery.data?.specification;
    if (!specification) return [];
    const keys = specification.views?.create ??
      specification.fields.map((field) => field.key);
    return specification.fields.filter(
      (field) => keys.includes(field.key) && isFieldVisible(field, formData),
    );
  }, [definitionQuery.data, formData]);

  const filteredProblems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (problemsQuery.data?.problems ?? []).filter((problem) =>
      !term || [problem.humanId, text(problem, 'title'), text(problem, 'serviceAffected')]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [problemsQuery.data, search]);

  function openCreate() {
    setFormData(initialFormData(definitionQuery.data?.specification.fields ?? []));
    createMutation.reset();
    setShowCreate(true);
  }

  function submitProblem(event: FormEvent) {
    event.preventDefault();
    const specification = definitionQuery.data?.specification;
    if (!specification) return;
    const data: Record<string, unknown> = {};
    for (const field of specification.fields) {
      if (!isFieldVisible(field, formData)) continue;
      const value = formData[field.key];
      if (!isFieldRequired(field, formData) && (value === '' || value == null)) continue;
      data[field.key] = value;
    }
    createMutation.mutate(data);
  }

  const problems = problemsQuery.data?.problems ?? [];
  const investigating = problems.filter((problem) => problem.state === 'under_investigation').length;
  const knownErrors = problems.filter((problem) => problem.state === 'known_error').length;
  const resolved = problems.filter((problem) => problem.state === 'resolved').length;

  return (
    <div className="min-h-screen bg-surface-container-lowest p-6 lg:p-8">
      <div className="w-full space-y-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              <SearchCode className="h-4 w-4" />
              Análisis de causa raíz
            </div>
            <h1 className="text-3xl font-black text-on-surface">Problem Management</h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              PRB independientes que investigan incidentes recurrentes y coordinan los RFC necesarios.
            </p>
          </div>
          {can(PERMISSIONS.problemsCreate) && (
            <button
              onClick={openCreate}
              disabled={!definitionQuery.data}
              className="primary-button disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Nuevo problema
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'En investigación', value: investigating, Icon: FlaskConical, color: 'text-amber-400' },
            { label: 'Errores conocidos', value: knownErrors, Icon: AlertOctagon, color: 'text-red-400' },
            { label: 'Resueltos', value: resolved, Icon: CheckCircle2, color: 'text-emerald-400' },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="rounded-2xl border border-border/40 bg-surface-container-low p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div className={`mt-3 text-3xl font-black ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-border/50 bg-surface-container-low px-4">
          <SearchCode className="h-4 w-4 text-on-surface-variant" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por PRB, título o servicio…"
            className="w-full bg-transparent py-3 text-sm text-on-surface outline-none"
          />
        </label>

        {(problemsQuery.isError || definitionQuery.isError) && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
            No se pudo cargar Problem Management: {(problemsQuery.error ?? definitionQuery.error)?.message}
          </div>
        )}
        {(problemsQuery.isLoading || definitionQuery.isLoading) && (
          <div className="rounded-2xl border border-border/40 bg-surface-container-low p-12 text-center text-on-surface-variant">
            Cargando problemas…
          </div>
        )}
        {!problemsQuery.isLoading && !problemsQuery.isError && (
          <div className="overflow-x-auto rounded-3xl border border-border/40 bg-surface-container-low">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/40 bg-surface-container/50 text-xs uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Problema</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Incidentes</th>
                  <th className="px-6 py-4">Workaround</th>
                  <th className="px-6 py-4">Impacto</th>
                  <th className="px-6 py-4">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredProblems.map((problem) => {
                  const relations = problemsQuery.data?.relations.get(problem.id) ?? [];
                  const incidentCount = relations.filter(
                    (relation) =>
                      relation.sourceEntityId === problem.id &&
                      relation.targetEntityKey === 'INC',
                  ).length;
                  return (
                    <tr
                      key={problem.id}
                      onClick={() => navigate(`/app/problems/${problem.id}`)}
                      className="cursor-pointer bg-surface-container transition-colors hover:bg-surface-container-highest"
                    >
                      <td className="px-6 py-4 font-mono text-xs font-bold text-primary">{problem.humanId}</td>
                      <td className="max-w-[480px] truncate px-6 py-4 font-semibold text-on-surface">
                        {text(problem, 'title') || 'Problema sin título'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${stateStyle(problem.state)}`}>
                          {stateLabels[problem.state] ?? problem.state}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                          <Link2 className="h-3 w-3" />
                          {incidentCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-on-surface-variant">
                        {text(problem, 'workaround') ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400"><Wrench className="h-3 w-3" /> Disponible</span>
                        ) : 'Sin registrar'}
                      </td>
                      <td className="px-6 py-4 uppercase text-on-surface-variant">{text(problem, 'impact') || '—'}</td>
                      <td className="px-6 py-4 text-on-surface-variant">{text(problem, 'owner') || 'Sin asignar'}</td>
                    </tr>
                  );
                })}
                {filteredProblems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-on-surface-variant">
                      No hay problemas que coincidan. Crea un PRB cuando exista una causa recurrente que investigar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <form onSubmit={submitProblem} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-primary/30 bg-surface-container-low">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/40 bg-surface-container-low/95 p-6">
              <div>
                <h2 className="text-xl font-black text-on-surface">Crear problema</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Formulario generado desde PRB v{definitionQuery.data?.version}.
                </p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Cerrar" className="p-2 text-on-surface-variant">
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
                    onChange={(value) => setFormData((current) => ({ ...current, [field.key]: value }))}
                  />
                </div>
              ))}
            </div>
            {createMutation.isError && (
              <div className="mx-6 mb-4 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {createMutation.error instanceof ApiError ? createMutation.error.message : 'No se pudo crear el problema.'}
              </div>
            )}
            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border/40 bg-surface-container-low/95 p-6">
              <button type="button" onClick={() => setShowCreate(false)} className="secondary-button">Cancelar</button>
              <button type="submit" disabled={createMutation.isPending} className="primary-button disabled:opacity-50">
                {createMutation.isPending ? 'Creando…' : 'Crear PRB'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
