import { GripVertical, X } from 'lucide-react';
import type { Placement } from '@/features/catalog/metamodel';

export function PlacementCard({
  placement,
  label,
  selected,
  isDragging,
  onSelect,
  onRemove,
  onDragStart,
  onDropAt,
}: {
  placement: Placement;
  label: string;
  selected: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDropAt: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropAt();
      }}
      onClick={onSelect}
      data-testid={`template-designer-placement-${placement.id}`}
      className={`group h-full cursor-pointer rounded-xl border p-3 transition-colors ${isDragging ? 'opacity-50' : ''} ${
        selected
          ? 'border-primary/60 bg-primary/10'
          : 'border-border/40 bg-surface-container-low hover:border-primary/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-on-surface-variant" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-on-surface">{label}</p>
          <p className="mt-0.5 truncate font-mono text-[9px] text-on-surface-variant">
            {placement.kind === 'widget'
              ? `widget:${placement.widgetKey}`
              : `${placement.source}:${placement.fieldKey}`}
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Quitar ${label}`}
          className="shrink-0 text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
