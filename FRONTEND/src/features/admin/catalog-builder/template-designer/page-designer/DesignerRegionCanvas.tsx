import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { PagePlacement, RegionName } from '@/features/catalog/metamodel';
import { EditableSlot } from './EditableSlot';
import { buildEmptyRegionId, buildNewRowId, buildSlotId } from './designer-actions';
import type { DesignerRegionLayout, DesignerSpan } from './designer-grid-model';

// Insertion point between/around cells and rows — a thin bar that widens and
// highlights while a drag is active, so the exact drop position is always
// visible before releasing. `accepted=false` (the active drag's widget isn't
// allowed in this region) dims it instead of highlighting it.
function GapDropZone({ id, active, accepted }: { id: string; active: boolean; accepted: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !active || !accepted });
  if (!active) return null;
  return (
    <div
      ref={setNodeRef}
      data-testid={`page-designer-drop-${id}`}
      className={`my-0.5 w-2 shrink-0 self-stretch rounded-full transition-all ${
        !accepted ? 'bg-transparent' : isOver ? 'w-3.5 bg-primary' : 'bg-primary/20'
      }`}
    />
  );
}

function NewRowDropZone({ id, active, accepted }: { id: string; active: boolean; accepted: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !active || !accepted });
  if (!active) return <div className="h-1" />;
  return (
    <div
      ref={setNodeRef}
      data-testid={`page-designer-drop-${id}`}
      className={`my-1 flex h-4 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
        !accepted ? 'border-transparent' : isOver ? 'border-primary bg-primary/10' : 'border-primary/25'
      }`}
    />
  );
}

export function DesignerRegionCanvas({
  region,
  regionName,
  isDragActive,
  dragAccepted,
  selectedId,
  onSelect,
  onRemove,
  onResize,
  onResizeEnd,
  renderCellContent,
  emptyHint,
}: {
  region: DesignerRegionLayout;
  regionName: RegionName;
  isDragActive: boolean;
  dragAccepted: boolean;
  selectedId: string | null;
  onSelect: (placementId: string) => void;
  onRemove: (placementId: string) => void;
  onResize: (placementId: string, span: DesignerSpan) => void;
  onResizeEnd: (placementId: string, span: DesignerSpan) => void;
  renderCellContent: (placement: PagePlacement) => ReactNode;
  emptyHint: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: buildEmptyRegionId(regionName),
    disabled: region.rows.length > 0 || !isDragActive || !dragAccepted,
  });

  if (region.rows.length === 0) {
    return (
      <div
        ref={setNodeRef}
        data-testid={`page-designer-region-${regionName}`}
        className={`rounded-xl border-2 border-dashed p-6 text-center text-xs text-on-surface-variant transition-colors ${
          isOver ? 'border-primary bg-primary/5 text-primary' : 'border-border/30'
        }`}
      >
        {emptyHint}
      </div>
    );
  }

  return (
    <div data-testid={`page-designer-region-${regionName}`} className="space-y-0">
      <NewRowDropZone id={buildNewRowId(regionName, 0)} active={isDragActive} accepted={dragAccepted} />
      {region.rows.map((row, rowIndex) => (
        <div key={row.id}>
          <div data-designer-row className="flex items-stretch">
            <GapDropZone
              id={buildSlotId(regionName, rowIndex, 0)}
              active={isDragActive}
              accepted={dragAccepted}
            />
            {row.cells.map((cell, cellIndex) => (
              <div key={cell.id} className="flex items-stretch" style={{ flex: `${cell.span} 0 0%` }}>
                <div className="min-w-0 flex-1 py-1">
                  <EditableSlot
                    cellId={cell.id}
                    span={cell.span}
                    locked={Boolean(cell.placement.locked)}
                    selected={selectedId === cell.placement.id}
                    onSelect={() => onSelect(cell.placement.id)}
                    onRemove={() => onRemove(cell.placement.id)}
                    onResize={(span) => onResize(cell.placement.id, span)}
                    onResizeEnd={(span) => onResizeEnd(cell.placement.id, span)}
                  >
                    {renderCellContent(cell.placement)}
                  </EditableSlot>
                </div>
                <GapDropZone
                  id={buildSlotId(regionName, rowIndex, cellIndex + 1)}
                  active={isDragActive}
                  accepted={dragAccepted}
                />
              </div>
            ))}
          </div>
          <NewRowDropZone
            id={buildNewRowId(regionName, rowIndex + 1)}
            active={isDragActive}
            accepted={dragAccepted}
          />
        </div>
      ))}
    </div>
  );
}
