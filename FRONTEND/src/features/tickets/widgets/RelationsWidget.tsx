import { Link2, Trash2 } from 'lucide-react';
import type { TicketPageContext } from './context';

export function RelationsWidget({ context }: { context: TicketPageContext }) {
  const { ticket, relations, onNavigate } = context;

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
            <div
              key={relation.id}
              className="flex items-start gap-2 rounded-2xl border border-border/40 bg-surface-container p-4 hover:border-primary/40"
            >
              <button onClick={() => onNavigate(destination)} className="min-w-0 flex-1 text-left">
                <div className="text-[10px] font-black uppercase text-on-surface-variant">{label}</div>
                <div className="mt-1 font-mono text-sm font-bold text-primary">{humanId}</div>
                <div className="text-xs text-on-surface-variant">
                  {entityKey} · contrato v{relation.contractVersion}
                </div>
              </button>
              {relations.canDelete?.(relation) && relations.onDelete && (
                <button
                  type="button"
                  onClick={() => relations.onDelete?.(relation.id)}
                  aria-label={`Remove relation with ${humanId}`}
                  className="rounded-lg p-2 text-on-surface-variant hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {relations.items.length === 0 && !relations.management && (
          <p className="md:col-span-2 text-sm italic text-on-surface-variant">Sin relaciones registradas.</p>
        )}
      </div>
      {relations.management && <div className="mt-5 border-t border-border/40 pt-5">{relations.management}</div>}
    </div>
  );
}
