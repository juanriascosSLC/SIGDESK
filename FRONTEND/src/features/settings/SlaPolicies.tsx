import { useEffect, useMemo, useState } from 'react';
import { formatDate } from '@/i18n/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ShieldAlert,
  Timer,
} from 'lucide-react';
import {
  createSlaPolicyDraft,
  listSlaPolicies,
  previewSlaPolicy,
  publishSlaPolicy,
  updateSlaPolicyDraft,
  type SlaPolicy,
  type SlaTarget,
} from '@/features/sla/api';

const priorities = ['critical', 'high', 'medium', 'low'];
const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

function emptyPolicy(): SlaPolicy {
  return {
    resourceId: 'sla:policy:',
    name: '',
    contractVersion: '1',
    calendar: {
      timezone: 'America/Bogota',
      alwaysOn: true,
      windows: weekdays.slice(0, 5).map(({ value }) => ({
        weekday: value,
        start: '08:00',
        end: '18:00',
      })),
    },
    targets: [
      { priority: 'critical', responseMinutes: 15, resolutionMinutes: 240 },
      { priority: 'high', responseMinutes: 30, resolutionMinutes: 480 },
      { priority: 'medium', responseMinutes: 120, resolutionMinutes: 960 },
      { priority: 'low', responseMinutes: 480, resolutionMinutes: 2400 },
    ],
    pauseStates: ['on_hold', 'pending_review', 'waiting_customer'],
    responseStates: ['in_progress', 'resolved'],
    resolutionStates: ['resolved'],
    escalations: [
      { thresholdPercent: 75, channel: 'notifications', recipient: 'assigned-team' },
      { thresholdPercent: 100, channel: 'notifications', recipient: 'service-owner' },
    ],
  };
}

export default function SlaPolicies() {
  const queryClient = useQueryClient();
  const policiesQuery = useQuery({
    queryKey: ['sla-policies'],
    queryFn: listSlaPolicies,
  });
  const [selected, setSelected] = useState<SlaPolicy>(emptyPolicy);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [notice, setNotice] = useState('');

  const policies = useMemo(() => policiesQuery.data ?? [], [policiesQuery.data]);
  const groupedPolicies = useMemo(() => {
    const groups = new Map<string, SlaPolicy[]>();
    policies.forEach((policy) => {
      groups.set(policy.resourceId, [...(groups.get(policy.resourceId) ?? []), policy]);
    });
    return [...groups.entries()];
  }, [policies]);

  useEffect(() => {
    if (selected.id || isCreatingNew || policies.length === 0) return;
    const published = policies.find((policy) => policy.status === 'published') ?? policies[0];
    const selection = window.setTimeout(() => setSelected(structuredClone(published)), 0);
    return () => window.clearTimeout(selection);
  }, [policies, selected.id, isCreatingNew]);

  const saveMutation = useMutation({
    mutationFn: (policy: SlaPolicy) =>
      policy.status === 'draft'
        ? updateSlaPolicyDraft(policy)
        : createSlaPolicyDraft(policy),
    onSuccess: async (policy) => {
      await queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      setSelected(structuredClone(policy));
      setIsCreatingNew(false);
      setNotice(`${policy.name} v${policy.version} was saved as a draft.`);
    },
  });
  const publishMutation = useMutation({
    mutationFn: ({ resourceId, version }: { resourceId: string; version: number }) =>
      publishSlaPolicy(resourceId, version),
    onSuccess: async (policy) => {
      await queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      await queryClient.invalidateQueries({ queryKey: ['catalog-definitions'] });
      await queryClient.invalidateQueries({ queryKey: ['catalog-resources'] });
      setSelected(structuredClone(policy));
      setNotice(`${policy.name} v${policy.version} is active and available in Entity Builder.`);
    },
  });
  const previewMutation = useMutation({
    mutationFn: ({ priority }: { priority: string }) =>
      previewSlaPolicy(selected.resourceId, selected.version ?? 0, priority),
  });

  const mutationError =
    policiesQuery.error ?? saveMutation.error ?? publishMutation.error ?? previewMutation.error;

  function choosePolicy(policy: SlaPolicy) {
    setSelected(structuredClone(policy));
    setIsCreatingNew(false);
    setNotice('');
    previewMutation.reset();
  }

  function startNew() {
    setSelected(emptyPolicy());
    setIsCreatingNew(true);
    setNotice('');
    previewMutation.reset();
  }

  function updateTarget(priority: string, changes: Partial<SlaTarget>) {
    setSelected((current) => ({
      ...current,
      targets: current.targets.map((target) =>
        target.priority === priority ? { ...target, ...changes } : target,
      ),
    }));
  }

  function saveDraft() {
    saveMutation.mutate({
      ...selected,
      resourceId: selected.resourceId.trim().toLowerCase(),
      name: selected.name.trim(),
    });
  }

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-on-surface flex items-center gap-3">
            <Timer className="w-7 h-7 text-primary" />
            SLA Policies
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Calendars, targets, and due dates calculated by the owning module.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={startNew} className="secondary-button">
            <Plus className="w-4 h-4" /> New policy
          </button>
          <button
            onClick={saveDraft}
            disabled={saveMutation.isPending || !selected.name}
            className="primary-button disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending
              ? 'Saving…'
              : selected.status === 'draft'
                ? 'Save changes'
                : 'Create draft'}
          </button>
          <button
            onClick={() =>
              selected.version &&
              publishMutation.mutate({
                resourceId: selected.resourceId,
                version: selected.version,
              })
            }
            disabled={selected.status !== 'draft' || publishMutation.isPending}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black flex items-center gap-2 disabled:opacity-30"
          >
            <Rocket className="w-4 h-4" />
            {publishMutation.isPending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </header>

      <div className="grid xl:grid-cols-[300px_minmax(0,1fr)] gap-6">
        <aside className="panel-card p-4.5 h-fit shadow-md">
          <div className="flex items-center justify-between px-2 mb-4">
            <span className="section-eyebrow font-bold text-xs uppercase tracking-wider text-on-surface-variant">Versioned policies</span>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-black text-primary">{groupedPolicies.length}</span>
          </div>
          {policiesQuery.isLoading && (
            <p className="p-3 text-sm text-on-surface-variant italic">Loading policies…</p>
          )}
          <div className="space-y-4">
            {groupedPolicies.map(([resourceId, versions]) => (
              <div key={resourceId} className="space-y-1.5 bg-surface-container-low/50 p-2.5 rounded-2xl border border-border/30">
                <p className="px-2 truncate text-sm font-bold text-on-surface">
                  {versions[0]?.name}
                </p>
                <p className="px-2 truncate text-[10px] font-mono text-on-surface-variant/70">
                  {resourceId}
                </p>
                <div className="space-y-1 mt-2">
                  {versions.map((policy) => (
                    <button
                      key={policy.id}
                      onClick={() => choosePolicy(policy)}
                      className={`w-full rounded-xl border px-3 py-2 flex items-center justify-between text-xs font-medium transition-all ${selected.id === policy.id
                          ? 'border-primary/60 bg-primary/15 text-primary font-bold shadow-[0_0_12px_rgba(34,211,238,0.12)]'
                          : 'border-transparent hover:bg-surface-container text-on-surface'
                        }`}
                    >
                      <span>Version {policy.version}</span>
                      <Status value={policy.status} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="space-y-6 min-w-0">
          <section className="panel-card p-6 grid md:grid-cols-2 gap-5 shadow-md">
            <Field label="Policy name">
              <input
                className="friendly-input rounded-xl border-border/50 focus:border-primary/50 focus:ring-primary/30"
                value={selected.name}
                onChange={(event) =>
                  setSelected((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="e.g. Commercial request handling"
              />
            </Field>
            <Field label="Stable identifier">
              <input
                className="friendly-input font-mono rounded-xl border-border/50 focus:border-primary/50 focus:ring-primary/30"
                value={selected.resourceId}
                disabled={Boolean(selected.id)}
                onChange={(event) =>
                  setSelected((current) => ({ ...current, resourceId: event.target.value }))
                }
                placeholder="sla:policy:name"
              />
            </Field>
            <Field label="Timezone">
              <select
                className="friendly-input rounded-xl border-border/50 focus:border-primary/50 cursor-pointer"
                value={selected.calendar.timezone}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    calendar: { ...current.calendar, timezone: event.target.value },
                  }))
                }
              >
                <option value="America/Bogota">America/Bogota</option>
                <option value="America/Mexico_City">America/Mexico_City</option>
                <option value="America/New_York">America/New_York</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
            <Field label="Calendar">
              <label className="friendly-input rounded-xl border-border/50 flex items-center justify-between cursor-pointer hover:border-primary/40 transition-colors">
                <span className="font-semibold">{selected.calendar.alwaysOn ? '24 hours × 7 days' : 'Business hours'}</span>
                <input
                  type="checkbox"
                  checked={selected.calendar.alwaysOn}
                  onChange={(event) =>
                    setSelected((current) => ({
                      ...current,
                      calendar: { ...current.calendar, alwaysOn: event.target.checked },
                    }))
                  }
                  className="w-4 h-4 rounded accent-primary cursor-pointer"
                />
              </label>
            </Field>
          </section>

          {!selected.calendar.alwaysOn && (
            <section className="panel-card p-6 shadow-md">
              <h2 className="font-black text-on-surface flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-primary" /> Operating hours
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {(selected.calendar.windows ?? []).map((window, index) => (
                  <div
                    key={window.weekday}
                    className="rounded-2xl border border-border/40 bg-surface-container/70 p-3.5"
                  >
                    <span className="text-xs font-black uppercase text-on-surface tracking-wider">
                      {weekdays.find((day) => day.value === window.weekday)?.label}
                    </span>
                    <div className="flex gap-2 mt-2.5">
                      {(['start', 'end'] as const).map((key) => (
                        <input
                          key={key}
                          type="time"
                          className="friendly-input px-2.5 py-1.5 text-xs font-mono rounded-xl border-border/40"
                          value={window[key]}
                          onChange={(event) =>
                            setSelected((current) => {
                              const windows = [...(current.calendar.windows ?? [])];
                              windows[index] = { ...windows[index], [key]: event.target.value };
                              return {
                                ...current,
                                calendar: { ...current.calendar, windows },
                              };
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel-card p-6 overflow-x-auto shadow-md">
            <h2 className="font-black text-on-surface flex items-center gap-2 mb-4">
              <Clock3 className="w-5 h-5 text-primary" /> Targets by priority
            </h2>
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-left text-xs uppercase tracking-wider text-on-surface-variant border-b border-border/30">
                <tr>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">First response</th>
                  <th className="py-3 px-3">Resolution</th>
                  <th className="py-3 px-3 text-right">Validate now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {priorities.map((priority) => {
                  const target = selected.targets.find((item) => item.priority === priority);
                  if (!target) return null;
                  const isCritical = priority === 'critical';
                  const isHigh = priority === 'high';
                  return (
                    <tr key={priority} className="hover:bg-surface-container/30 transition-colors">
                      <td className="py-3.5 px-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${isCritical ? 'bg-status-danger-bg text-status-danger-fg border-status-danger-border' :
                            isHigh ? 'bg-status-warning-bg text-status-warning-fg border-status-warning-border' :
                              'bg-surface-container-high text-on-surface-variant border-border/40'
                          }`}>
                          {priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <MinutesInput
                          value={target.responseMinutes}
                          onChange={(value) => updateTarget(priority, { responseMinutes: value })}
                        />
                      </td>
                      <td className="py-3.5 px-3">
                        <MinutesInput
                          value={target.resolutionMinutes}
                          onChange={(value) => updateTarget(priority, { resolutionMinutes: value })}
                        />
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <button
                          className="secondary-button py-1.5 px-3 text-xs rounded-xl disabled:opacity-40"
                          disabled={!selected.version || previewMutation.isPending}
                          onClick={() => previewMutation.mutate({ priority })}
                        >
                          Calculate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="panel-card p-6 grid md:grid-cols-3 gap-5 shadow-md">
            <Field label="States that pause clock">
              <input
                className="friendly-input font-mono rounded-xl border-border/50 text-xs"
                value={(selected.pauseStates ?? []).join(', ')}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    pauseStates: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </Field>
            <Field label="States that satisfy response">
              <input
                className="friendly-input font-mono rounded-xl border-border/50 text-xs"
                value={(selected.responseStates ?? []).join(', ')}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    responseStates: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </Field>
            <Field label="States that satisfy resolution">
              <input
                className="friendly-input font-mono rounded-xl border-border/50 text-xs"
                value={(selected.resolutionStates ?? []).join(', ')}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    resolutionStates: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </Field>
            <div className="md:col-span-3 rounded-2xl border border-status-warning-border bg-status-warning-bg p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-status-warning-fg flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-status-warning-icon" /> Operational escalation
              </p>
              <p className="text-xs text-on-surface-variant mt-1.5">
                Automatic alert at 75% of target time and breach notice at 100%.
              </p>
            </div>
          </section>

          {previewMutation.data && (
            <div className="rounded-2xl border border-status-info-border bg-status-info-bg p-4 text-sm text-status-info-fg shadow-sm">
              <strong>Live calculation ({previewMutation.data.priority}):</strong> response before{' '}
              <span className="underline decoration-cyan-400 font-bold">{formatDateTime(previewMutation.data.responseDueAt)}</span> and resolution before{' '}
              <span className="underline decoration-cyan-400 font-bold">{formatDateTime(previewMutation.data.resolutionDueAt)}</span>.
            </div>
          )}
          {mutationError && (
            <div className="rounded-2xl border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger-fg" role="alert">
              <p>{mutationError.message}</p>
              {policiesQuery.isError && (
                <button type="button" onClick={() => void policiesQuery.refetch()} className="secondary-button mt-3" data-testid="sla-policies-retry">
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              )}
            </div>
          )}
          {notice && (
            <div className="rounded-2xl border border-status-success-border bg-status-success-bg p-4 text-sm text-status-success-fg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-status-success-icon" /> {notice}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}

function MinutesInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="friendly-input w-28 py-1.5 px-3 font-mono rounded-xl border-border/50 text-xs focus:ring-primary/40 focus:border-primary/50"
      />
      <span className="text-xs font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded-lg border border-border/40">min</span>
    </div>
  );
}

function Status({ value }: { value?: string }) {
  const classes =
    value === 'published'
      ? 'bg-status-success-bg text-status-success-fg border-status-success-border'
      : value === 'draft'
        ? 'bg-status-warning-bg text-status-warning-fg border-status-warning-border'
        : 'bg-surface-container-high text-on-surface-variant border-border/40';
  const label = value === 'published' ? 'Active' : value === 'draft' ? 'Draft' : 'Previous';
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${classes}`}>{label}</span>;
}

