import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Lock, X } from 'lucide-react';
import { ALLOWED_SPANS, type DesignerSpan } from './designer-grid-model';

// Wraps the REAL rendered widget/field/content (same component runtime and
// preview use) with the chrome needed to edit it in place: selection ring,
// drag handle, remove button, resize handle, locked indicator. This is what
// makes the designer WYSIWYG instead of showing technical placeholder cards.
export function EditableSlot({
  cellId,
  span,
  locked,
  selected,
  onSelect,
  onRemove,
  onResize,
  onResizeEnd,
  children,
}: {
  cellId: string;
  span: DesignerSpan;
  locked: boolean;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onResize: (nextSpan: DesignerSpan) => void;
  onResizeEnd: (nextSpan: DesignerSpan) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cellId,
    data: { type: 'existing', cellId },
    disabled: locked,
  });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const resizeStartRef = useRef({ x: 0, span });
  const lastSpanRef = useRef(span);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) return;
    const row = wrapperRef.current?.closest('[data-designer-row]') as HTMLElement | null;
    const rowWidth = row?.getBoundingClientRect().width ?? 0;
    const columnWidth = rowWidth / 12;

    function handleMove(event: PointerEvent) {
      if (!columnWidth) return;
      const deltaColumns = Math.round((event.clientX - resizeStartRef.current.x) / columnWidth);
      const target = Math.min(12, Math.max(1, resizeStartRef.current.span + deltaColumns));
      const snapped = [...ALLOWED_SPANS].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
      lastSpanRef.current = snapped;
      onResize(snapped);
    }
    function handleUp() {
      setResizing(false);
      onResizeEnd(lastSpanRef.current);
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = { x: event.clientX, span };
    lastSpanRef.current = span;
    setResizing(true);
  }

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node;
        setNodeRef(node);
      }}
      onClick={onSelect}
      data-testid={`page-designer-slot-${cellId}`}
      className={`group/slot relative h-full cursor-pointer rounded-2xl transition-shadow ${
        selected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/40'
      } ${isDragging ? 'opacity-40' : ''}`}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 20 } : undefined}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl border border-dashed border-transparent group-hover/slot:border-primary/30" />
      <div className="absolute -top-3 left-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/slot:opacity-100">
        {!locked && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar"
            data-testid={`page-designer-drag-${cellId}`}
            className="cursor-grab rounded-lg border border-border/50 bg-surface-container p-1 text-on-surface-variant shadow active:cursor-grabbing"
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}
        {locked && (
          <span
            aria-label="Bloqueado"
            className="rounded-lg border border-border/50 bg-surface-container p-1 text-on-surface-variant shadow"
          >
            <Lock className="h-3 w-3" />
          </span>
        )}
      </div>
      {!locked && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label="Quitar"
          data-testid={`page-designer-remove-${cellId}`}
          className="absolute -top-3 right-2 z-10 rounded-lg border border-border/50 bg-surface-container p-1 text-on-surface-variant opacity-0 shadow transition-opacity hover:text-red-400 group-hover/slot:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <div className="pointer-events-none h-full">
        <div className="pointer-events-auto h-full">{children}</div>
      </div>
      <div
        onPointerDown={startResize}
        data-testid={`page-designer-resize-${cellId}`}
        role="separator"
        aria-label="Cambiar ancho"
        className="absolute -right-1.5 top-1/2 z-10 h-10 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border border-border/50 bg-surface-container opacity-0 shadow transition-opacity group-hover/slot:opacity-100"
      />
    </div>
  );
}
