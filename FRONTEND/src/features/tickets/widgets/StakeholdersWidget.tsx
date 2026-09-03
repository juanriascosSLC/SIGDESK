import { Building2, Users } from 'lucide-react';
import type { TicketPageContext } from './context';

export function StakeholdersWidget({ context }: { context: TicketPageContext }) {
  const { userIds, unitIds, directory, loading } = context.stakeholders;
  const users = userIds.map((id) => directory?.users.find((item) => item.id === id));
  const units = unitIds.map((id) => directory?.units.find((item) => item.id === id));

  return (
    <section className="rounded-3xl border border-border/40 bg-surface-container-low p-6" data-testid="ticket-stakeholders-widget">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <Users className="h-4 w-4 text-primary" />
        Interesados
      </h3>
      <p className="mb-4 text-xs text-on-surface-variant">
        Reciben notificaciones; no son responsables del registro.
      </p>
      {loading && <p className="text-sm text-on-surface-variant">Resolviendo directorio…</p>}
      {!loading && userIds.length === 0 && unitIds.length === 0 && (
        <p className="text-sm text-on-surface-variant">No stakeholders or interested areas.</p>
      )}
      {!loading && (unitIds.length > 0 || userIds.length > 0) && (
        <div className="space-y-4">
          {unitIds.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-on-surface-variant">
                <Building2 className="h-3.5 w-3.5" /> Areas / teams
              </p>
              <div className="flex flex-wrap gap-2">
                {unitIds.map((id, index) => (
                  <span key={id} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-on-surface">
                    {units[index]?.name ?? 'Interested area'}
                  </span>
                ))}
              </div>
            </div>
          )}
          {userIds.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-on-surface-variant">Personas</p>
              <div className="space-y-2">
                {userIds.map((id, index) => (
                  <div key={id} className="rounded-xl bg-on-surface/[0.03] px-3 py-2">
                    <p className="text-sm font-medium text-on-surface">{users[index]?.name ?? 'Persona interesada'}</p>
                    {users[index]?.email && <p className="text-xs text-on-surface-variant">{users[index]?.email}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
