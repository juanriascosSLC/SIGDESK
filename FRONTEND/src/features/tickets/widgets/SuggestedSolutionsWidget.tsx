import { Lightbulb } from 'lucide-react';
import type { TicketPageContext } from './context';

// No standalone "suggestions" feature exists yet — this surfaces real,
// already-linked Problem Management records (entityRelations, the same data
// RelationsWidget uses) as candidates with a known fix, rather than
// fabricating a recommendation engine.
export function SuggestedSolutionsWidget({ context }: { context: TicketPageContext }) {
  const { ticket, relations, onNavigate } = context;
  const problemRelations = relations.items
    .map((relation) => {
      const outbound = relation.sourceEntityId === ticket.entityId;
      const entityKey = outbound ? relation.targetEntityKey : relation.sourceEntityKey;
      const humanId = outbound ? relation.targetHumanId : relation.sourceHumanId;
      const entityId = outbound ? relation.targetEntityId : relation.sourceEntityId;
      return { relation, entityKey, humanId, entityId };
    })
    .filter((candidate) => candidate.entityKey === 'PRB');

  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
      <h3 className="mb-4 flex items-center gap-2 border-b border-border/40 pb-3 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        Suggested solutions
      </h3>
      {problemRelations.length === 0 ? (
        <p className="text-sm italic text-on-surface-variant">
          No related problems yet — once one is linked, its known solution
          will appear here.
        </p>
      ) : (
        <div className="space-y-2">
          {problemRelations.map(({ relation, humanId, entityId }) => (
            <button
              key={relation.id}
              // Bug found 2026-09-09: navigated with humanId; /app/problems/:id
              // expects the internal entity id (see RelationsWidget.tsx and
              // api.ts's id-vs-humanId invariant) -- a humanId here is a 400.
              onClick={() => onNavigate(`/app/problems/${encodeURIComponent(entityId)}`)}
              className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-left hover:border-amber-500/40"
            >
              <div className="text-[10px] font-black uppercase text-amber-300">Related problem</div>
              <div className="mt-1 font-mono text-sm font-bold text-on-surface">{humanId}</div>
              <p className="mt-1 text-xs text-on-surface-variant">
                Review its known solution before investigating from scratch.
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
