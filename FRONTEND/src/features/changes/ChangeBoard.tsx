import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DynamicField } from '@/features/catalog/DynamicField';
import {
  isFieldRequired,
  isFieldVisible,
  type FieldDefinition,
} from '@/features/catalog/metamodel';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { ApiError } from '@/lib/apiClient';
import { createChange, getChangeDefinition, listChanges } from './api';
import {
  changeStateLabels,
  changeStateStyles,
  formatDateTime,
  riskStyles,
  textData,
} from './presentation';

const boardColumns = [
  { key: 'draft', label: 'Borradores', states: ['draft'] },
  { key: 'assessment', label: 'Evaluación', states: ['assessment'] },
  { key: 'cab', label: 'CAB', states: ['pending_approval'] },
  { key: 'approved', label: 'Aprobados', states: ['approved', 'scheduled'] },
  { key: 'execution', label: 'Ejecución', states: ['implementing'] },
  {
    key: 'closed',
    label: 'Finalizados',
    states: ['completed', 'failed', 'rolled_back', 'closed', 'rejected'],
  },
];

function initialFormData(
  fields: FieldDefinition[],
  requester: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) data[field.key] = field.defaultValue;
  }
  if (fields.some((field) => field.key === 'requester')) {
    data.requester = requester;
  }
  return data;
}

export default function ChangeBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can, displayName } = useAuth();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const changesQuery = useQuery({
    queryKey: ['changes'],
    queryFn: listChanges,
    refetchInterval: 20_000,
  });
  const definitionQuery = useQuery({
    queryKey: ['changes', 'definition'],
    queryFn: getChangeDefinition,
  });
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      createChange(data, crypto.randomUUID()),
    onSuccess: (change) => {
      void queryClient.invalidateQueries({ queryKey: ['changes'] });
      setShowCreate(false);
      navigate(`/app/changes/${change.id}`);
    },
  });

  const createFields = useMemo(() => {
    const specification = definitionQuery.data?.specification;
    if (!specification) return [];
    const keys =
      specification.views?.create ??
      specification.fields.map((field) => field.key);
    return specification.fields.filter(
      (field) =>
        keys.includes(field.key) &&
        isFieldVisible(field, formData),
    );
  }, [definitionQuery.data, formData]);

  const filteredChanges = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (changesQuery.data ?? []).filter((change) => {
      if (riskFilter && textData(change, 'riskLevel') !== riskFilter) return false;
      if (!term) return true;
      return [
        change.humanId,
        textData(change, 'title'),
        textData(change, 'serviceAffected'),
        textData(change, 'requester'),
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [changesQuery.data, riskFilter, search]);

  function openCreate() {
    const fields = definitionQuery.data?.specification.fields ?? [];
    setFormData(initialFormData(fields, displayName));
    createMutation.reset();
    setShowCreate(true);
  }

  function submitChange(event: FormEvent) {
    event.preventDefault();
    const specification = definitionQuery.data?.specification;
    if (!specification) return;
    const data: Record<string, unknown> = {};
    for (const field of specification.fields) {
      if (field.key === 'riskLevel' || !isFieldVisible(field, formData)) continue;
      const value = formData[field.key];
      if (!isFieldRequired(field, formData) && (value === '' || value == null)) {
        continue;
      }
      data[field.key] = value;
    }
    createMutation.mutate(data);
  }

  const openCount = (changesQuery.data ?? []).filter(
    (change) => !['closed', 'rejected'].includes(change.state),
  ).length;
  const cabCount = (changesQuery.data ?? []).filter(
    (change) => change.state === 'pending_approval',
  ).length;
  const scheduledCount = (changesQuery.data ?? []).filter(
    (change) => ['scheduled', 'implementing'].includes(change.state),
  ).length;

  return (
    <div className="min-h-screen bg-surface-container-lowest p-6 lg:p-8">
      <div className="w-full">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              <ShieldCheck className="h-4 w-4" />
              Gobierno de cambios
            </div>
            <h1 className="text-3xl font-black text-on-surface">Change Management</h1>
            <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
              Solicitudes RFC versionadas por Catalog Builder, con riesgo calculado,
              aprobación CAB y ejecución controlada.
            </p>
          </div>
          {can(PERMISSIONS.changesCreate) && (
            <button
              onClick={openCreate}
              disabled={!definitionQuery.data}
              className="primary-button disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Nueva RFC
            </button>
          )}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Cambios abiertos', value: openCount, Icon: ClipboardList, color: 'text-primary' },
            { label: 'Esperando CAB', value: cabCount, Icon: ShieldCheck, color: 'text-amber-400' },
            { label: 'Programados / activos', value: scheduledCount, Icon: CalendarClock, color: 'text-emerald-400' },
          ].map(({ label, value, Icon, color }) => (
            <div
              key={label}
              className="rounded-2xl border border-border/40 bg-surface-container-low/90 backdrop-blur-md p-5 shadow-sm transition-all hover:border-border/70 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  {label}
                </span>
                <div className="p-2 rounded-xl bg-surface-container/70 border border-border/40">
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </div>
              <div className="mt-3 text-3xl font-black tracking-tight text-on-surface">{value}</div>
            </div>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <label className="flex min-w-[280px] flex-1 items-center gap-3 rounded-2xl border border-border/50 bg-surface-container-low/90 backdrop-blur-md px-4 shadow-sm focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all">
            <Search className="h-4 w-4 text-on-surface-variant/70" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por RFC, título, servicio o solicitante…"
              className="w-full bg-transparent py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none"
            />
          </label>
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
            className="friendly-input max-w-[220px] rounded-2xl border-border/50 cursor-pointer bg-[#1d2026] text-[#e1e2eb]"
            style={{ colorScheme: 'dark' }}
          >
            <option value="" className="bg-[#191c22] text-[#e1e2eb]">Todos los riesgos</option>
            <option value="low" className="bg-[#191c22] text-[#e1e2eb]">Riesgo bajo</option>
            <option value="medium" className="bg-[#191c22] text-[#e1e2eb]">Riesgo medio</option>
            <option value="high" className="bg-[#191c22] text-[#e1e2eb]">Riesgo alto</option>
            <option value="critical" className="bg-[#191c22] text-[#e1e2eb]">Riesgo crítico</option>
          </select>
        </div>

        {changesQuery.isLoading && (
          <div className="rounded-2xl border border-border/40 bg-surface-container-low p-12 text-center text-on-surface-variant font-medium">
            Cargando solicitudes de cambio…
          </div>
        )}
        {changesQuery.isError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300 font-medium">
            No se pudieron cargar los cambios: {changesQuery.error.message}
          </div>
        )}
        {!changesQuery.isLoading && !changesQuery.isError && (
          <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
            {boardColumns.map((column) => {
              const items = filteredChanges.filter((change) =>
                column.states.includes(change.state),
              );
              return (
                <section
                  key={column.key}
                  className="min-h-[360px] rounded-3xl border border-border/40 bg-surface-container-low/60 backdrop-blur-md p-3.5 flex flex-col shadow-sm"
                >
                  <div className="mb-3.5 flex items-center justify-between px-1.5 pt-1">
                    <h2 className="text-xs font-black uppercase tracking-wider text-on-surface">
                      {column.label}
                    </h2>
                    <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-[10px] font-black text-on-surface-variant border border-border/40">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {items.map((change) => {
                      const risk = textData(change, 'riskLevel') || 'medium';
                      return (
                        <button
                          key={change.id}
                          onClick={() => navigate(`/app/changes/${change.id}`)}
                          className="w-full rounded-2xl border border-border/50 bg-surface-container/90 backdrop-blur-sm p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_8px_25px_rgba(0,0,0,0.25)] group"
                        >
                          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-black text-primary group-hover:underline">
                              {change.humanId}
                            </span>
                            <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-xs ${riskStyles[risk] ?? riskStyles.medium}`}>
                              {risk}
                            </span>
                          </div>
                          <h3 className="line-clamp-2 text-sm font-bold text-on-surface leading-snug group-hover:text-primary transition-colors">
                            {textData(change, 'title') || 'RFC sin título'}
                          </h3>
                          <p className="mt-2 line-clamp-1 text-xs text-on-surface-variant/80 font-medium">
                            {textData(change, 'serviceAffected') || 'Sin servicio informado'}
                          </p>
                          <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border/30 pt-3">
                            <span className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${changeStateStyles[change.state] ?? changeStateStyles.draft}`}>
                              {changeStateLabels[change.state] ?? change.state}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-medium">
                              {formatDateTime(change.data.plannedStart)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    {items.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border/30 p-8 text-center text-xs text-on-surface-variant/60 italic">
                        Sin RFC en esta etapa
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <form
            onSubmit={submitChange}
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-primary/30 bg-surface-container-low shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/40 bg-surface-container-low/95 p-6 backdrop-blur-md">
              <div>
                <h2 className="text-xl font-black text-on-surface">Crear solicitud de cambio</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Formulario generado desde RFC v{definitionQuery.data?.version}. El riesgo se calcula en el módulo de Change Management.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-5 p-6 md:grid-cols-2">
              {createFields.map((field) => (
                <div
                  key={field.key}
                  className={field.type === 'textarea' ? 'md:col-span-2' : ''}
                >
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
            {createMutation.isError && (
              <div className="mx-6 mb-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {createMutation.error instanceof ApiError
                    ? createMutation.error.message
                    : 'No se pudo crear la RFC.'}
                </span>
              </div>
            )}
            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border/40 bg-surface-container-low/95 p-6 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="secondary-button"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="primary-button disabled:opacity-50"
              >
                {createMutation.isPending ? (
                  'Creando…'
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Crear RFC
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
