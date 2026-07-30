import { Copy, GripVertical, Trash2 } from 'lucide-react';
import type { LayoutSection, Placement } from '@/features/catalog/metamodel';
import { PlacementCard } from './PlacementCard';

export function LayoutSectionCard({
  section,
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
  section: LayoutSection;
  labelFor: (placement: Placement) => string;
  selectedId: string | null;
  draggedPlacementId: string | null;
  onSelectSection: () => void;
  onSelectPlacement: (placementId: string) => void;
  onRemovePlacement: (placementId: string) => void;
  onRemoveSection: () => void;
  onDuplicateSection: () => void;
  onSectionDragStart: () => void;
  onSectionDrop: () => void;
  onPlacementDragStart: (placementId: string) => void;
  onDropAt: (index: number) => void;
}) {
  return (
    <section
      data-testid={`template-designer-section-${section.id}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onSectionDrop();
      }}
      className={`rounded-2xl border p-4 transition-colors ${
        selectedId === section.id
          ? 'border-primary/60 bg-primary/5'
          : 'border-border/40 bg-surface-container-low/60'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.stopPropagation();
            onSectionDragStart();
          }}
          onClick={onSelectSection}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-on-surface-variant" />
          <span className="truncate text-sm font-black text-on-surface">
            {section.title || 'Sección sin título'}
          </span>
          <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 text-[9px] font-bold text-on-surface-variant">
            {section.columns} col
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onDuplicateSection}
            aria-label="Duplicar sección"
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemoveSection}
            aria-label="Eliminar sección"
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div
        data-testid={`template-designer-section-${section.id}-canvas`}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDropAt(section.placements.length);
        }}
      >
        {section.placements.map((placement, index) => (
          <div
            key={placement.id}
            style={{ gridColumn: `span ${placement.columnSpan} / span ${placement.columnSpan}` }}
          >
            <PlacementCard
              placement={placement}
              label={labelFor(placement)}
              selected={selectedId === placement.id}
              isDragging={draggedPlacementId === placement.id}
              onSelect={() => onSelectPlacement(placement.id)}
              onRemove={() => onRemovePlacement(placement.id)}
              onDragStart={() => onPlacementDragStart(placement.id)}
              onDropAt={() => onDropAt(index)}
            />
          </div>
        ))}
        {section.placements.length === 0 && (
          <div className="col-span-full rounded-xl border-2 border-dashed border-border/40 py-6 text-center text-xs text-on-surface-variant">
            Arrastra campos aquí
          </div>
        )}
      </div>
    </section>
  );
}
