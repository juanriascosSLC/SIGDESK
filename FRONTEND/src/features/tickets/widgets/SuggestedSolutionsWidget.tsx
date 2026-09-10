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
      return { relation, entityKey, humanId };
    })
    .filter((candidate) => candidate.entityKey === 'PRB');

  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
      <h3 className="mb-4 flex items-center gap-2 border-b border-border/40 pb-3 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <Lightbulb className="h-4 w-4 text-status-warning-icon" />
        Suggested solutions
      </h3>
      {problemRelations.length === 0 ? (
        <p className="text-sm italic text-on-surface-variant">
          No related problems yet — once one is linked, its known solution
          will appear here.
        </p>
      ) : (
        <div className="space-y-2">
          {problemRelations.map(({ relation, humanId }) => (
            <button
              key={relation.id}
              onClick={() => onNavigate(`/app/problems/${encodeURIComponent(humanId)}`)}
              className="w-full rounded-2xl border border-status-warning-border bg-status-warning-bg p-4 text-left hover:border-status-warning-icon transition-colors"
            >
              <div className="text-[10px] font-black uppercase text-status-warning-fg">Related problem</div>
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
