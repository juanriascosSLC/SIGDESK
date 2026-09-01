import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, Copy, GripVertical, Lock, MoveLeft, MoveRight, Trash2, type LucideIcon } from 'lucide-react';
import { ALLOWED_SPANS, type DesignerSpan } from './designer-grid-model';

export interface SlotNeighbours {
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function ChromeButton({
  label,
  onClick,
  danger,
  children,
  testId,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`rounded-md p-1 transition-colors disabled:opacity-25 ${
        danger ? 'text-on-surface-variant hover:bg-red-500/15 hover:text-red-300' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}

// Wraps the REAL rendered widget/field/content (same component runtime and
// preview use) with the chrome needed to edit it in place: selection ring,
// drag handle, a labelled toolbar, keyboard-reachable move/duplicate/remove
// buttons, a resize handle and a live width readout.
//
// The rendered child is intentionally inert (`pointer-events: none`): this is
// a canvas, and a click anywhere on a card must select that card. It used to
// re-enable pointer events on the child, which meant clicking RESOLVER or the
// status dropdown of the previewed actions bar operated the *simulated* ticket
// instead of selecting the element the admin was trying to configure.
export function EditableSlot({
  cellId,
  span,
  locked,
  selected,
  label,
  icon: Icon,
  neighbours,
  canDuplicate,
  onSelect,
  onRemove,
  onDuplicate,
  onMove,
  onResize,
  onResizeEnd,
  children,
}: {
  cellId: string;
  span: DesignerSpan;
  locked: boolean;
  selected: boolean;
  label: string;
  icon?: LucideIcon;
  neighbours: SlotNeighbours;
  canDuplicate: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (direction: 'left' | 'right' | 'up' | 'down') => void;
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

  // The chrome is revealed on hover, but stays pinned open while the element
  // is selected — otherwise the buttons vanish the moment the pointer travels
  // to the properties panel.
  const chromeVisible = selected ? 'opacity-100' : 'opacity-0 group-hover/slot:opacity-100 focus-within:opacity-100';

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node;
        setNodeRef(node);
      }}
      role="group"
      aria-label={`${label} — ${span} de 12 columnas`}
      onClick={onSelect}
      data-testid={`page-designer-slot-${cellId}`}
      className={`group/slot relative h-full cursor-pointer rounded-2xl outline-none transition-shadow ${
        selected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/40 focus-within:ring-1 focus-within:ring-primary/40'
      } ${isDragging ? 'opacity-40' : ''}`}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 20 } : undefined}
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl border border-dashed transition-colors ${
          selected ? 'border-primary/40' : 'border-transparent group-hover/slot:border-primary/25'
        }`}
      />

      {/* Toolbar — identity on the left, destructive action on the right, so
          the label never sits under the pointer on its way to Quitar. */}
      <div
        className={`absolute -top-3.5 left-2 right-2 z-20 flex items-center justify-between gap-2 transition-opacity ${chromeVisible}`}
      >
        <div className="flex min-w-0 items-center gap-0.5 rounded-lg border border-border/50 bg-surface-container px-1 py-0.5 shadow-lg">
          {locked ? (
            <span
              aria-label="Bloqueado"
              title="Elemento fijo de esta zona: no se puede mover ni quitar"
              className="p-1 text-on-surface-variant"
            >
              <Lock className="h-3 w-3" />
            </span>
          ) : (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Arrastrar"
              title="Arrastrar para mover"
              data-testid={`page-designer-drag-${cellId}`}
              className="cursor-grab rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface active:cursor-grabbing"
            >
              <GripVertical className="h-3 w-3" />
            </button>
          )}
          {/* The accessible way to select this element: the wrapper stays a
              plain div so the chrome buttons are not nested inside a control. */}
          <button
            type="button"
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            title={`Seleccionar ${label}`}
            className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-surface-container-high"
          >
            {Icon && <Icon className="h-3 w-3 shrink-0 text-primary/80" />}
            <span className="truncate text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
              {label}
            </span>
          </button>
          <span className="shrink-0 rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[9px] font-black text-primary">
            {span}/12
          </span>
        </div>

        {!locked && (
          <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-surface-container px-1 py-0.5 shadow-lg">
            <ChromeButton label="Mover a la izquierda" onClick={() => onMove('left')} disabled={!neighbours.canMoveLeft}>
              <MoveLeft className="h-3 w-3" />
            </ChromeButton>
            <ChromeButton label="Mover a la derecha" onClick={() => onMove('right')} disabled={!neighbours.canMoveRight}>
              <MoveRight className="h-3 w-3" />
            </ChromeButton>
            <ChromeButton label="Subir la fila" onClick={() => onMove('up')} disabled={!neighbours.canMoveUp}>
              <ArrowUp className="h-3 w-3" />
            </ChromeButton>
            <ChromeButton label="Bajar la fila" onClick={() => onMove('down')} disabled={!neighbours.canMoveDown}>
              <ArrowDown className="h-3 w-3" />
            </ChromeButton>
            {canDuplicate && (
              <ChromeButton label="Duplicar" onClick={onDuplicate}>
                <Copy className="h-3 w-3" />
              </ChromeButton>
            )}
            <ChromeButton
              label="Quitar"
              onClick={onRemove}
              danger
              testId={`page-designer-remove-${cellId}`}
            >
              <Trash2 className="h-3 w-3" />
            </ChromeButton>
          </div>
        )}
      </div>

      {/* `inert` on top of pointer-events: since 1.6 the form surfaces render
          REAL inputs here, and pointer-events alone still leaves them in the
          tab order — tabbing across the canvas would drop the caret inside a
          simulated form instead of moving between cards. */}
      <div inert className="pointer-events-none h-full select-none">{children}</div>

      {!locked && (
        <>
          <div
            onPointerDown={startResize}
            data-testid={`page-designer-resize-${cellId}`}
            role="separator"
            aria-label="Cambiar ancho"
            title="Arrastra para cambiar el ancho"
            className={`absolute -right-1.5 top-1/2 z-20 flex h-12 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border bg-surface-container shadow transition-all ${
              resizing
                ? 'border-primary bg-primary/20 opacity-100'
                : `border-border/60 hover:border-primary ${selected ? 'opacity-100' : 'opacity-0 group-hover/slot:opacity-100'}`
            }`}
          >
            <span aria-hidden className="h-4 w-px bg-on-surface-variant/60" />
          </div>
          {resizing && (
            <span className="pointer-events-none absolute -top-3.5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-primary bg-surface-container px-2 py-0.5 font-mono text-[10px] font-black text-primary shadow-lg">
              {span} / 12 columnas
            </span>
          )}
        </>
      )}
    </div>
  );
}
