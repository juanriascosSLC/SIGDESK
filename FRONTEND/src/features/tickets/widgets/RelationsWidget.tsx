import { Link2 } from 'lucide-react';
import type { TicketPageContext } from './context';

export function RelationsWidget({ context }: { context: TicketPageContext }) {
  const { ticket, relations, onNavigate } = context;
  if (relations.items.length === 0) return null;

  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
      <h3 className="mb-4 flex items-center gap-2 border-b border-border/40 pb-3 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <Link2 className="h-4 w-4 text-cyan-400" />
        Relaciones ITSM
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {relations.items.map((relation) => {
          const outbound = relation.sourceEntityId === ticket.entityId;
          const entityKey = outbound ? relation.targetEntityKey : relation.sourceEntityKey;
          const humanId = outbound ? relation.targetHumanId : relation.sourceHumanId;
          const label = outbound ? relation.relationLabel : relation.inverseLabel;
          const destination =
            entityKey === 'PRB'
              ? `/app/problems/${encodeURIComponent(humanId)}`
              : entityKey === 'RFC'
                ? `/app/changes/${encodeURIComponent(humanId)}`
                : `/app/tickets/${encodeURIComponent(humanId)}`;
          return (
            <button
              key={relation.id}
              onClick={() => onNavigate(destination)}
              className="rounded-2xl border border-border/40 bg-surface-container p-4 text-left hover:border-primary/40"
            >
              <div className="text-[10px] font-black uppercase text-on-surface-variant">{label}</div>
              <div className="mt-1 font-mono text-sm font-bold text-primary">{humanId}</div>
              <div className="text-xs text-on-surface-variant">
                {entityKey} · contrato v{relation.contractVersion}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
