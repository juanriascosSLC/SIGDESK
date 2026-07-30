import type { ReactNode } from 'react';
import { evaluateCondition, type LayoutSection, type Placement } from '../metamodel';

export function DynamicSection({
  section,
  data,
  renderPlacement,
}: {
  section: LayoutSection;
  data: Record<string, unknown>;
  renderPlacement: (placement: Placement, section: LayoutSection) => ReactNode;
}) {
  const visiblePlacements = section.placements.filter(
    (placement) => !placement.visibleWhen || evaluateCondition(placement.visibleWhen, data),
  );
  if (visiblePlacements.length === 0) return null;

  return (
    <section
      data-testid={`layout-section-${section.id}`}
      className="rounded-2xl border border-border/40 bg-surface-container-low/60 p-5"
    >
      {(section.title || section.description) && (
        <header className="mb-4">
          {section.title && <h3 className="text-sm font-black text-on-surface">{section.title}</h3>}
          {section.description && (
            <p className="mt-1 text-xs text-on-surface-variant">{section.description}</p>
          )}
        </header>
      )}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }}
      >
        {visiblePlacements.map((placement) => (
          <div
            key={placement.id}
            style={{ gridColumn: `span ${placement.columnSpan} / span ${placement.columnSpan}` }}
          >
            {renderPlacement(placement, section)}
          </div>
        ))}
      </div>
    </section>
  );
}
