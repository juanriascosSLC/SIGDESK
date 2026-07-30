import type { TicketPageContext } from './context';

// Renders the `description` catalog field with prose styling — a more
// prominent presentation than the generic field card, for the entity's main
// narrative text.
export function DescriptionWidget({ context }: { context: TicketPageContext }) {
  const field = context.fields.find((candidate) => candidate.key === 'description');
  const value = context.entityData.description;
  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low p-6">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        {field?.label ?? 'Descripción'}
      </h3>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
        {typeof value === 'string' && value.trim() ? value : '—'}
      </p>
    </div>
  );
}
