import { useDroppable } from '@dnd-kit/core';
import { MousePointerClick, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PagePlacement, RegionName } from '@/features/catalog/metamodel';
import { EditableSlot } from './EditableSlot';
import { buildEmptyRegionId, buildNewRowId, buildSlotId } from './designer-actions';
import type { DesignerRegionLayout, DesignerSpan } from './designer-grid-model';

export interface SlotDescriptor {
  label: string;
  icon?: LucideIcon;
  canDuplicate: boolean;
}

// ─── Drop zones ──────────────────────────────────────────────────────────
//
// These occupy the SAME space whether or not a drag is in progress: only
// their colour changes. That is a correctness requirement, not a stylistic
// one.
//
// dnd-kit measures every droppable's rect when a drag begins. These zones
// used to collapse to nothing (or to a 4px sliver) while idle and expand on
// drag start — so the very render that made them droppable also pushed every
// region below the first one hundreds of pixels down the page, and dnd-kit
// went on comparing the pointer against rects that no longer described
// anything. Dropping onto the footer resolved to `over: null` and the drag
// was silently discarded. The canvas also visibly lurched the instant you
// picked anything up.
//
// For the same reason the "is over" state is drawn with a ring and a colour,
// never with a size change: growing the zone under the cursor would reflow
// the page mid-drag and reintroduce the same staleness.
function GapDropZone({ id, active }: { id: string; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !active });
  return (
    <div className="relative my-2 w-2 shrink-0 self-stretch" aria-hidden={!active}>
      {/* The measured hit area, deliberately wider than the visible bar and
          absolutely positioned so growing it costs no layout. Never takes
          pointer events: dnd-kit resolves drops geometrically, so this must
          not sit between the cursor and the cards underneath it. */}
      <div ref={setNodeRef} className="pointer-events-none absolute inset-y-0 -inset-x-2.5" />
      <div
        data-testid={`page-designer-drop-${id}`}
        className={`h-full w-full rounded-full transition-colors ${
          !active ? 'bg-transparent' : isOver ? 'bg-primary ring-4 ring-primary/25' : 'bg-primary/25'
        }`}
      />
    </div>
  );
}

function NewRowDropZone({ id, active }: { id: string; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !active });
  return (
    <div className="relative my-0.5 h-2.5" aria-hidden={!active}>
      <div ref={setNodeRef} className="pointer-events-none absolute inset-x-0 -inset-y-3" />
      <div
        data-testid={`page-designer-drop-${id}`}
        className={`h-full w-full rounded-full border-2 border-dashed transition-colors ${
          !active
            ? 'border-transparent'
            : isOver
              ? 'border-primary bg-primary ring-4 ring-primary/25'
              : 'border-primary/30'
        }`}
      />
    </div>
  );
}

export function DesignerRegionCanvas({
  region,
  regionName,
  isDragActive,
  dragAccepted,
  selectedId,
  describe,
  onSelect,
  onRemove,
  onDuplicate,
  onMove,
  onResize,
  onResizeEnd,
  renderCellContent,
  emptyHint,
  locked,
}: {
  region: DesignerRegionLayout;
  regionName: RegionName;
  isDragActive: boolean;
  dragAccepted: boolean;
  selectedId: string | null;
  describe: (placement: PagePlacement) => SlotDescriptor;
  onSelect: (placementId: string) => void;
  onRemove: (placementId: string) => void;
  onDuplicate: (placementId: string) => void;
  onMove: (placementId: string, direction: 'left' | 'right' | 'up' | 'down') => void;
  onResize: (placementId: string, span: DesignerSpan) => void;
  onResizeEnd: (placementId: string, span: DesignerSpan) => void;
  renderCellContent: (placement: PagePlacement) => ReactNode;
  emptyHint: string;
  /** A fixed region: nothing may be dropped into it, at all. */
  locked: boolean;
}) {
  const droppableActive = isDragActive && dragAccepted && !locked;
  const { setNodeRef, isOver } = useDroppable({
    id: buildEmptyRegionId(regionName),
    disabled: !droppableActive,
  });

  if (region.rows.length === 0) {
    return (
      <div
        ref={setNodeRef}
        data-testid={`page-designer-region-${regionName}`}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-xs transition-colors ${
          isOver
            ? 'border-primary bg-primary/10 text-primary'
            : droppableActive
              ? 'border-primary/40 text-on-surface-variant'
              : 'border-border/30 text-on-surface-variant/70'
        }`}
      >
        <MousePointerClick className="h-4 w-4 opacity-60" />
        {emptyHint}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} data-testid={`page-designer-region-${regionName}`}>
      <NewRowDropZone id={buildNewRowId(regionName, 0)} active={droppableActive} />
      {region.rows.map((row, rowIndex) => (
        <div key={row.id}>
          <div data-designer-row className="flex items-stretch">
            <GapDropZone id={buildSlotId(regionName, rowIndex, 0)} active={droppableActive} />
            {row.cells.map((cell, cellIndex) => {
              const descriptor = describe(cell.placement);
              return (
                <div key={cell.id} className="flex items-stretch" style={{ flex: `${cell.span} 0 0%` }}>
                  <div className="min-w-0 flex-1 py-2">
                    <EditableSlot
                      cellId={cell.id}
                      span={cell.span}
                      locked={Boolean(cell.placement.locked)}
                      selected={selectedId === cell.placement.id}
                      label={descriptor.label}
                      icon={descriptor.icon}
                      canDuplicate={descriptor.canDuplicate}
                      neighbours={{
                        canMoveLeft: cellIndex > 0,
                        canMoveRight: cellIndex < row.cells.length - 1,
                        canMoveUp: rowIndex > 0,
                        canMoveDown: rowIndex < region.rows.length - 1,
                      }}
                      onSelect={() => onSelect(cell.placement.id)}
                      onRemove={() => onRemove(cell.placement.id)}
                      onDuplicate={() => onDuplicate(cell.placement.id)}
                      onMove={(direction) => onMove(cell.placement.id, direction)}
                      onResize={(span) => onResize(cell.placement.id, span)}
                      onResizeEnd={(span) => onResizeEnd(cell.placement.id, span)}
                    >
                      {renderCellContent(cell.placement)}
                    </EditableSlot>
                  </div>
                  <GapDropZone id={buildSlotId(regionName, rowIndex, cellIndex + 1)} active={droppableActive} />
                </div>
              );
            })}
          </div>
          <NewRowDropZone id={buildNewRowId(regionName, rowIndex + 1)} active={droppableActive} />
        </div>
      ))}
    </div>
  );
}
