import { Building2, Users } from 'lucide-react';
import type { FormPageContext } from './context';

export function FormStakeholdersWidget({ context }: { context: FormPageContext }) {
  const { directory, loading, errorMessage, value, onChange, onRetry, readOnly, hidden } = context.stakeholders;

  // Portal requesters must not enumerate the internal Organization directory.
  // Audience-specific layouts can omit the widget; this guard also protects a
  // default layout that an administrator made available to every audience.
  if (hidden) return null;

  const toggle = (key: 'userIds' | 'unitIds', id: string) => {
    if (readOnly) return;
    const current = value[key];
    onChange({
      ...value,
      [key]: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    });
  };

  return (
    <section
      className="rounded-3xl border border-border/40 bg-surface-container-low p-6"
      data-testid="stakeholder-picker"
    >
      <div className="mb-4">
        <h2 className="text-sm font-black text-on-surface">Stakeholders and Interested Teams</h2>
        <p className="mt-1 text-xs text-on-surface-variant">
          They will receive record updates without becoming assignees or gaining extra permissions.
        </p>
      </div>
      {loading && <p className="text-sm text-on-surface-variant">Loading directory…</p>}
      {errorMessage && (
        <div className="flex items-center justify-between gap-3 text-sm text-amber-300">
          <span>{errorMessage}</span>
          <button type="button" onClick={onRetry} className="font-bold text-cyan-400">Retry</button>
        </div>
      )}
      {directory && (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-on-surface-variant">
              <Building2 className="h-4 w-4" /> Areas / teams
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {directory.units.map((unit) => (
                <label key={unit.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-on-surface/[0.04]">
                  <input type="checkbox" disabled={readOnly} checked={value.unitIds.includes(unit.id)} onChange={() => toggle('unitIds', unit.id)} />
                  <span className="text-sm text-on-surface">{unit.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-on-surface-variant">
              <Users className="h-4 w-4" /> People
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {directory.users.map((person) => (
                <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-on-surface/[0.04]">
                  <input type="checkbox" disabled={readOnly} checked={value.userIds.includes(person.id)} onChange={() => toggle('userIds', person.id)} />
                  <span className="min-w-0">
                    <span className="block text-sm text-on-surface">{person.name}</span>
                    <span className="block truncate text-[11px] text-on-surface-variant">{person.email}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
