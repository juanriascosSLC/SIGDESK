import type { ReactNode } from 'react';
import { evaluateCondition, type LayoutDocument, type LayoutSection, type Placement } from '../metamodel';
import { DynamicSection } from './DynamicSection';

export interface DynamicLayoutProps {
  document: LayoutDocument;
  data: Record<string, unknown>;
  renderPlacement: (placement: Placement, section: LayoutSection) => ReactNode;
  className?: string;
}

// Shared layout renderer used by CatalogForm, TicketDetail (detail + edit)
// and TemplatePreview — the same component, not a lookalike. It only knows
// how to walk sections/placements and evaluate visibility; every caller
// decides how an individual placement is actually painted via
// `renderPlacement`, so this module never needs to know about Tickets, SLA,
// or any other module's data shape.
export function DynamicLayout({ document, data, renderPlacement, className }: DynamicLayoutProps) {
  const visibleSections = document.sections.filter(
    (section) => !section.visibleWhen || evaluateCondition(section.visibleWhen, data),
  );
  if (visibleSections.length === 0) return null;

  return (
    <div className={`space-y-5 ${className ?? ''}`}>
      {visibleSections.map((section) => (
        <DynamicSection
          key={section.id}
          section={section}
          data={data}
          renderPlacement={renderPlacement}
        />
      ))}
    </div>
  );
}
