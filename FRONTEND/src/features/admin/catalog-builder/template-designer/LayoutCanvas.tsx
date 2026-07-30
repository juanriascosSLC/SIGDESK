import type { LayoutDocument, Placement } from '@/features/catalog/metamodel';
import { LayoutSectionCard } from './LayoutSectionCard';

export function LayoutCanvas({
  document,
  labelFor,
  selectedId,
  draggedPlacementId,
  onSelectSection,
  onSelectPlacement,
  onRemovePlacement,
  onRemoveSection,
  onDuplicateSection,
  onSectionDragStart,
  onSectionDrop,
  onPlacementDragStart,
  onDropAt,
}: {
  document: LayoutDocument;
  labelFor: (placement: Placement) => string;
  selectedId: string | null;
  draggedPlacementId: string | null;
  onSelectSection: (sectionId: string) => void;
  onSelectPlacement: (placementId: string) => void;
  onRemovePlacement: (placementId: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onSectionDragStart: (sectionId: string) => void;
  onSectionDrop: (sectionId: string) => void;
  onPlacementDragStart: (placementId: string) => void;
  onDropAt: (sectionId: string, index: number) => void;
}) {
  if (document.sections.length === 0) {
    return (
      <div
        data-testid="template-designer-empty-canvas"
        className="rounded-2xl border-2 border-dashed border-border/40 py-16 text-center text-sm text-on-surface-variant"
      >
        Agrega una sección para empezar a diseñar.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {document.sections.map((section) => (
        <LayoutSectionCard
          key={section.id}
          section={section}
          labelFor={labelFor}
          selectedId={selectedId}
          draggedPlacementId={draggedPlacementId}
          onSelectSection={() => onSelectSection(section.id)}
          onSelectPlacement={onSelectPlacement}
          onRemovePlacement={onRemovePlacement}
          onRemoveSection={() => onRemoveSection(section.id)}
          onDuplicateSection={() => onDuplicateSection(section.id)}
          onSectionDragStart={() => onSectionDragStart(section.id)}
          onSectionDrop={() => onSectionDrop(section.id)}
          onPlacementDragStart={onPlacementDragStart}
          onDropAt={(index) => onDropAt(section.id, index)}
        />
      ))}
    </div>
  );
}
