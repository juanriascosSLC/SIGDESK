import { Link2, Trash2 } from 'lucide-react';
import type { TicketPageContext } from './context';

export function RelationsWidget({ context }: { context: TicketPageContext }) {
  const { ticket, relations, onNavigate } = context;

  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
      <h3 className="mb-4 flex items-center gap-2 border-b border-border/40 pb-3 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <Link2 className="h-4 w-4 text-cyan-400" />
        Related Cases
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {relations.items.map((relation) => {
          // Fixed 2026-09-06: comparing only the raw numeric id is not
          // enough to tell "this ticket is the relation's source" apart
          // from "this ticket's id just happens to equal the SOURCE's id"
          // — ids are only unique WITHIN one entity type, not globally.
          // In the shared production database this rarely surfaces
          // (INC/PRB/RFC ids accumulate into disjoint ranges over time),
          // but it reproduces reliably in an isolated per-run stack, where
          // tickets_service's and problem_service's own first record both
          // get id "1" in their own separate databases: a PRB #1
          // "investigates" INC #1 was rendered as INC #1 investigating
          // itself, showing the wrong side of the relation. `ticket.category`
          // is always this ticket's own entityKey (`category <- entityKey`,
          // api.ts), so comparing it alongside the id disambiguates for real.
          // NB: that invariant was NOT actually held by ConfiguredRecordDetail
          // (it mapped `category` from record.data), which silently flipped
          // every relation on the PRB/RFC detail pages. It now maps
          // record.entityKey. Any new Ticket producer has to honour it too —
          // configured-record-detail.spec.ts is the regression guard.
          const outbound = relation.sourceEntityId === ticket.entityId && relation.sourceEntityKey === ticket.category;
          const entityKey = outbound ? relation.targetEntityKey : relation.sourceEntityKey;
          const humanId = outbound ? relation.targetHumanId : relation.sourceHumanId;
          // Bug found 2026-09-09: navigation used humanId in the URL, but
          // /app/tickets/:id (and the equivalent problems/changes routes)
          // feed the path straight into getTicket/getEntity, which parse it
          // as the internal int64 id -- a humanId there is a 400 per
          // api.ts's own documented id-vs-humanId invariant. Navigate with
          // the real entity id; keep humanId only as the visible label.
          const entityId = outbound ? relation.targetEntityId : relation.sourceEntityId;
          const label = outbound ? relation.relationLabel : relation.inverseLabel;
          const destination =
            entityKey === 'PRB'
              ? `/app/problems/${encodeURIComponent(entityId)}`
              : entityKey === 'RFC'
                ? `/app/changes/${encodeURIComponent(entityId)}`
                : `/app/tickets/${encodeURIComponent(entityId)}`;
          return (
            <div
              key={relation.id}
              className="flex items-start gap-2 rounded-2xl border border-border/40 bg-surface-container p-4 hover:border-primary/40"
            >
              <button onClick={() => onNavigate(destination)} className="min-w-0 flex-1 text-left">
                <div className="text-[10px] font-black uppercase text-on-surface-variant">{label}</div>
                <div className="mt-1 font-mono text-sm font-bold text-primary">{humanId}</div>
                <div className="text-xs text-on-surface-variant">
                  {entityKey} · contract v{relation.contractVersion}
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
          <p className="md:col-span-2 text-sm italic text-on-surface-variant">No relations recorded.</p>
        )}
      </div>
      {relations.management && <div className="mt-5 border-t border-border/40 pt-5">{relations.management}</div>}
    </div>
  );
}
