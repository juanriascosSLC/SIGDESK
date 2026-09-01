import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Eye,
  Lock,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import type {
  AudienceKey,
  CatalogSpecification,
  LayoutKind,
  PageLayout,
  PageLayoutDefinition,
  PagePlacement,
  RegionName,
  WidgetKey,
} from '@/features/catalog/metamodel';
import { PageRegionsSkeleton } from '@/features/catalog/runtime/PageLayoutRenderer';
import { useDesignerHistory } from '../useDesignerHistory';
import { DesignerPlacementContent } from './DesignerPlacementContent';
import { DesignerRegionCanvas, type SlotDescriptor } from './DesignerRegionCanvas';
import { PageComponentPalette } from './PageComponentPalette';
import { PagePropertiesPanel } from './PagePropertiesPanel';
import { PageTemplatePreview } from './PageTemplatePreview';
import { REGION_ORDER } from './region-meta';
import { placementIcon, type PageLibraryItem } from './page-library';
import type { AnyPageSurface } from './surface';
import { updatePlacement, updateSidebarColumns } from './page-document-ops';
import {
  addPaletteCell,
  appendItemToRegion,
  applyResizeInRegions,
  buildRegionsFromPage,
  canDuplicatePlacement,
  compileRegionsToPage,
  countPlacements,
  defaultSpanFor,
  duplicateCell,
  findCellLocation,
  moveCellToRegion,
  moveExistingCell,
  moveRowOfCell,
  parseDropTargetId,
  placedItemIndex,
  placementLabel,
  preferredRegionFor,
  swapCellInRow,
  type RegionsState,
} from './designer-actions';
import { cellIdForPlacement, findCell, removeCell, snapSpan, type DesignerSpan } from './designer-grid-model';

type ActiveDragInfo =
  | { source: 'palette'; item: PageLibraryItem; span: DesignerSpan; label: string; widgetKey?: WidgetKey }
  | { source: 'existing'; cellId: string; span: DesignerSpan; label: string; widgetKey?: WidgetKey };

const KIND_LABELS: Record<LayoutKind, string> = { create: 'Crear', edit: 'Editar', detail: 'Detalle' };
const AUDIENCE_LABELS: Record<AudienceKey, string> = {
  requester: 'Solicitante',
  agent: 'Técnico',
  supervisor: 'Supervisor',
};
const ALL_AUDIENCES: AudienceKey[] = ['requester', 'agent', 'supervisor'];

// Drops follow the CURSOR, not the bulk of the thing being dragged.
//
// dnd-kit's default (`rectIntersection`) picks the droppable with the largest
// overlap against the dragged element's own rectangle. In an editor where the
// dragged item is a full-size widget card and the drop targets are thin
// insertion bars, the card's footprint always wins: dragging Asset Details
// from the sidebar into the main column resolved to `empty:sidebar` — the
// region it was leaving — no matter where the pointer actually was, so the
// widget simply stayed put.
//
// `pointerWithin` returns only the droppables under the pointer, ordered by
// distance to their centre, so the thin bar the user is aiming at beats the
// region container enclosing it. `rectIntersection` remains the fallback for
// the case `pointerWithin` cannot answer — a pointer outside every droppable
// (which is also the only case a keyboard-driven drag would produce).
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

/** True while the user is typing, so global shortcuts stay out of the way. */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

export function PageDesigner({
  surface,
  entityKey,
  specification,
  updateSpecification,
  activeKind,
  onChangeKind,
}: {
  surface: AnyPageSurface;
  entityKey: string;
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
  activeKind: LayoutKind;
  onChangeKind: (kind: LayoutKind) => void;
}) {
  const [pageBaseline] = useState<PageLayoutDefinition>(
    () =>
      specification[surface.specKey] ?? {
        default: surface.synthesizeBaseline(specification, entityKey),
      },
  );
  const history = useDesignerHistory(pageBaseline);
  const definition = history.present;

  // Writing the page into the specification also writes the metamodel 1.4
  // mirror for the surfaces that have one. That mirror is not legacy baggage:
  // tickets_service refuses to publish a definition whose `bindsTo` field has
  // no placement in `layouts.create`, so deriving it from the page on every
  // commit is what keeps publishing possible AND the rule truthful.
  const applyPage = useCallback(
    (current: CatalogSpecification, definition: PageLayoutDefinition): CatalogSpecification => {
      const next: CatalogSpecification = { ...current, [surface.specKey]: definition };
      const project = surface.projectToLegacy;
      if (project && (surface.kind === 'create' || surface.kind === 'edit')) {
        next.layouts = {
          ...next.layouts,
          [surface.kind]: {
            default: project(definition.default),
            variants: definition.variants?.map((variant) => ({
              key: variant.key,
              label: variant.label,
              audienceKey: variant.audienceKey,
              document: project(variant.page),
            })),
          },
        };
      }
      return next;
    },
    [surface],
  );

  const persistedInitial = useRef(false);
  useEffect(() => {
    if (!persistedInitial.current && !specification[surface.specKey]) {
      persistedInitial.current = true;
      updateSpecification((current) => applyPage(current, pageBaseline));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastSynced = useRef(pageBaseline);
  useEffect(() => {
    if (history.present !== lastSynced.current) {
      lastSynced.current = history.present;
      updateSpecification((current) => applyPage(current, history.present));
    }
  }, [history.present, updateSpecification, applyPage]);

  const [activeVariantKey, setActiveVariantKey] = useState<AudienceKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [liveRegions, setLiveRegions] = useState<RegionsState | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDragInfo | null>(null);
  // Three columns need roughly 1000px of CONTAINER width, and this designer
  // lives at the bottom of a stack that eats most of it: the app nav (256px),
  // then Catalog Builder's own entity/section rail (280px, which only appears
  // at xl and above). On a 1600px screen that leaves the canvas about 360px —
  // narrower than the sidebar region it is supposed to be previewing. Rather
  // than fight the shell from inside it, the designer can hide either side
  // panel and take over the viewport entirely.
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const { context: simulatedContext } = surface.useSimulatedContext(specification, entityKey);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const activePage: PageLayout = activeVariantKey
    ? (definition.variants?.find((variant) => variant.audienceKey === activeVariantKey)?.page ?? definition.default)
    : definition.default;
  const availableVariantKeys = (definition.variants ?? []).map((variant) => variant.audienceKey);
  const creatableAudiences = ALL_AUDIENCES.filter((audience) => !availableVariantKeys.includes(audience));

  const baseRegions = useMemo(() => buildRegionsFromPage(activePage), [activePage]);
  const regions = liveRegions ?? baseRegions;

  // Every write goes through here, so an edit made while an audience variant
  // is selected lands on THAT variant. The sidebar-width control used to sit
  // in the toolbar and write straight to `definition.default` regardless of
  // the active variant: widening the sidebar while editing the "Técnico"
  // layout silently reshaped the default one instead, with no visible effect
  // on the canvas the admin was looking at.
  const commitPageChange = useCallback(
    (nextPage: PageLayout) => {
      const nextDefinition: PageLayoutDefinition = activeVariantKey
        ? {
            ...definition,
            variants: (definition.variants ?? []).map((variant) =>
              variant.audienceKey === activeVariantKey ? { ...variant, page: nextPage } : variant,
            ),
          }
        : { ...definition, default: nextPage };
      history.commit(nextDefinition);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeVariantKey, definition, history.commit],
  );

  const commitRegions = useCallback(
    (nextRegions: RegionsState) => commitPageChange(compileRegionsToPage(activePage, nextRegions)),
    [activePage, commitPageChange],
  );

  // Scrolls a freshly added / located element into view — otherwise adding
  // from the palette drops it somewhere below the fold and looks like nothing
  // happened. An element that already exists scrolls immediately; a brand-new
  // one has no DOM node yet, so the request waits in a ref until the commit
  // that renders it (a ref, not state, so this never re-renders on its own).
  const scrollTargetRef = useRef<string | null>(null);
  const revealPending = useCallback(() => {
    const placementId = scrollTargetRef.current;
    if (!placementId) return;
    const node = document.querySelector(`[data-testid="page-designer-slot-${cellIdForPlacement(placementId)}"]`);
    if (!node) return;
    scrollTargetRef.current = null;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  // Selecting anything re-opens the properties panel: hiding it to win canvas
  // width should not mean a later click silently has nowhere to report to.
  const select = useCallback((placementId: string | null) => {
    setSelectedId(placementId);
    if (placementId) setPropertiesOpen(true);
  }, []);

  function selectAndReveal(placementId: string) {
    select(placementId);
    scrollTargetRef.current = placementId;
    revealPending();
  }

  useEffect(() => {
    revealPending();
  }, [activePage, revealPending]);

  // The expanded canvas owns the viewport; leaving the page scrollable behind
  // it produces two scrollbars and a body that drifts under the overlay.
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  function handleAddVariant(audience: AudienceKey) {
    const variants = [
      ...(definition.variants ?? []),
      { key: crypto.randomUUID(), label: AUDIENCE_LABELS[audience], audienceKey: audience, page: definition.default },
    ];
    history.commit({ ...definition, variants });
    setActiveVariantKey(audience);
    setSelectedId(null);
  }

  function handleRemoveVariant(audience: AudienceKey) {
    history.commit({
      ...definition,
      variants: (definition.variants ?? []).filter((variant) => variant.audienceKey !== audience),
    });
    setActiveVariantKey(null);
    setSelectedId(null);
  }

  function regionAccepts(regionName: RegionName): boolean {
    if (surface.regionMeta[regionName].fixed) return false;
    if (!activeDrag?.widgetKey) return true;
    return surface.widgets[activeDrag.widgetKey]?.allowedRegions.includes(regionName) ?? false;
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { type: 'palette'; item: PageLibraryItem }
      | { type: 'existing'; cellId: string }
      | undefined;
    if (!data) return;
    if (data.type === 'palette') {
      setActiveDrag({
        source: 'palette',
        item: data.item,
        span: snapSpan(defaultSpanFor(surface, data.item)),
        label: data.item.label,
        widgetKey: data.item.kind === 'widget' ? data.item.widgetKey : undefined,
      });
      return;
    }
    for (const regionName of REGION_ORDER) {
      const location = findCell(regions[regionName], data.cellId);
      if (!location) continue;
      const cell = regions[regionName].rows[location.rowIndex].cells[location.cellIndex];
      setActiveDrag({
        source: 'existing',
        cellId: cell.id,
        span: cell.span,
        label: placementLabel(surface, cell.placement, specification),
        widgetKey: cell.placement.kind === 'widget' ? cell.placement.widgetKey : undefined,
      });
      return;
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const drag = activeDrag;
    setActiveDrag(null);
    if (!drag || !event.over) return;
    const target = parseDropTargetId(String(event.over.id));
    if (!target) return;
    const nextRegions =
      drag.source === 'palette'
        ? addPaletteCell(surface, regions, drag.item, target)
        : moveExistingCell(surface, regions, drag.cellId, target);
    if (nextRegions === regions) return;
    commitRegions(nextRegions);
  }

  function handleAddFromPalette(item: PageLibraryItem) {
    const region = preferredRegionFor(surface, item);
    if (!region) return;
    const result = appendItemToRegion(surface, regions, item, region);
    if (!result) return;
    commitRegions(result.regions);
    selectAndReveal(result.placementId);
  }

  const handleRemove = useCallback(
    (placementId: string) => {
      const cellId = cellIdForPlacement(placementId);
      const location = findCellLocation(regions, cellId);
      if (!location) return;
      const cell = regions[location.region].rows[location.rowIndex].cells[location.cellIndex];
      if (cell.placement.locked) return;
      commitRegions({ ...regions, [location.region]: removeCell(regions[location.region], cellId) });
      if (selectedId === placementId) setSelectedId(null);
    },
    [regions, commitRegions, selectedId],
  );

  function handleDuplicate(placementId: string) {
    const result = duplicateCell(surface, regions, cellIdForPlacement(placementId));
    if (!result) return;
    commitRegions(result.regions);
    selectAndReveal(result.placementId);
  }

  function handleMove(placementId: string, direction: 'left' | 'right' | 'up' | 'down') {
    const cellId = cellIdForPlacement(placementId);
    const next =
      direction === 'left'
        ? swapCellInRow(regions, cellId, -1)
        : direction === 'right'
          ? swapCellInRow(regions, cellId, 1)
          : moveRowOfCell(regions, cellId, direction === 'up' ? -1 : 1);
    if (next === regions) return;
    commitRegions(next);
  }

  function handleMoveToRegion(placementId: string, region: RegionName) {
    const next = moveCellToRegion(surface, regions, cellIdForPlacement(placementId), region);
    if (next === regions) return;
    commitRegions(next);
    selectAndReveal(placementId);
  }

  function handleResizePreview(placementId: string, span: DesignerSpan) {
    setLiveRegions((current) => applyResizeInRegions(current ?? baseRegions, cellIdForPlacement(placementId), span));
  }

  function handleResizeEnd(placementId: string, span: DesignerSpan) {
    const finalRegions = applyResizeInRegions(liveRegions ?? baseRegions, cellIdForPlacement(placementId), span);
    setLiveRegions(null);
    commitRegions(finalRegions);
  }

  // Keyboard shortcuts. Undo/redo were reachable only through two small icon
  // buttons; Ctrl+Z is the first thing anyone tries in an editor.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
        return;
      }
      if (event.key === 'Escape') {
        // Escape peels one layer at a time: the selection first, then the
        // expanded canvas — never both at once.
        if (selectedId) setSelectedId(null);
        else setExpanded(false);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        handleRemove(selectedId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, handleRemove, history.undo, history.redo]);

  const describe = useCallback(
    (placement: PagePlacement): SlotDescriptor => ({
      label: placementLabel(surface, placement, specification),
      icon: placementIcon(surface, placement, specification),
      canDuplicate: canDuplicatePlacement(surface, placement),
    }),
    [surface, specification],
  );

  const selectedLocation = selectedId ? findCellLocation(regions, cellIdForPlacement(selectedId)) : null;
  const selectedNeighbours = selectedLocation
    ? {
        canMoveLeft: selectedLocation.cellIndex > 0,
        canMoveRight:
          selectedLocation.cellIndex < regions[selectedLocation.region].rows[selectedLocation.rowIndex].cells.length - 1,
        canMoveUp: selectedLocation.rowIndex > 0,
        canMoveDown: selectedLocation.rowIndex < regions[selectedLocation.region].rows.length - 1,
      }
    : { canMoveLeft: false, canMoveRight: false, canMoveUp: false, canMoveDown: false };

  const placedIndex = useMemo(() => placedItemIndex(regions), [regions]);

  function renderRegionCanvas(regionName: RegionName) {
    const meta = surface.regionMeta[regionName];
    const RegionIcon = meta.icon;
    const count = countPlacements(regions, regionName);
    const highlighted = Boolean(activeDrag) && regionAccepts(regionName);
    return (
      <section
        data-testid={`page-designer-region-wrapper-${regionName}`}
        className={`rounded-2xl border bg-surface-container/40 p-3 transition-colors ${
          highlighted ? 'border-primary/50 bg-primary/5' : 'border-border/30'
        }`}
      >
        <header className="mb-2 flex items-center gap-2">
          <RegionIcon className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
          <h4 className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{meta.label}</h4>
          <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 text-[9px] font-black text-on-surface-variant">
            {count}
          </span>
          {meta.fixed && (
            <span
              title="Zona fija: siempre muestra su componente estructural"
              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-on-surface-variant/60"
            >
              <Lock className="h-2.5 w-2.5" /> Fija
            </span>
          )}
        </header>
        <DesignerRegionCanvas
          region={regions[regionName]}
          regionName={regionName}
          isDragActive={Boolean(activeDrag)}
          dragAccepted={regionAccepts(regionName)}
          locked={meta.fixed}
          selectedId={selectedId}
          describe={describe}
          onSelect={select}
          onRemove={handleRemove}
          onDuplicate={handleDuplicate}
          onMove={handleMove}
          onResize={handleResizePreview}
          onResizeEnd={handleResizeEnd}
          renderCellContent={(placement) => (
            <DesignerPlacementContent surface={surface} placement={placement} context={simulatedContext} />
          )}
          emptyHint={meta.emptyHint}
        />
      </section>
    );
  }

  const designer = (
    <div
      className={expanded ? 'fixed inset-0 z-50 overflow-y-auto bg-surface' : ''}
      data-testid="page-designer"
    >
      {/* Toolbar — pinned while the expanded canvas scrolls, so undo/redo and
          the way back out never scroll off the top of a long page. */}
      <div className={expanded ? 'sticky top-0 z-30 space-y-3 bg-surface px-4 pb-3 pt-4' : 'space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-surface-container p-3">
        <div className="flex items-center gap-1 rounded-xl bg-surface-container-low p-1">
          {(['create', 'edit', 'detail'] as LayoutKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              data-testid={`template-designer-kind-${kind}`}
              onClick={() => onChangeKind(kind)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeKind === kind ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
            <Users className="h-3.5 w-3.5" />
            Audiencia
            <select
              value={activeVariantKey ?? ''}
              onChange={(event) => {
                setActiveVariantKey(event.target.value ? (event.target.value as AudienceKey) : null);
                setSelectedId(null);
              }}
              data-testid="page-designer-audience"
              className="rounded-lg border border-border/40 bg-surface-container-low px-2 py-1.5 text-xs font-bold text-on-surface"
              style={{ colorScheme: 'dark' }}
            >
              <option value="" className="bg-[#191c22] text-[#e1e2eb]">
                Predeterminada
              </option>
              {availableVariantKeys.map((audience) => (
                <option key={audience} value={audience} className="bg-[#191c22] text-[#e1e2eb]">
                  {AUDIENCE_LABELS[audience]}
                </option>
              ))}
            </select>
          </label>
          {creatableAudiences.length > 0 && (
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) handleAddVariant(event.target.value as AudienceKey);
              }}
              data-testid="page-designer-add-audience"
              aria-label="Agregar variante de audiencia"
              className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-xs font-bold text-primary"
              style={{ colorScheme: 'dark' }}
            >
              <option value="" className="bg-[#191c22] text-[#e1e2eb]">
                + Variante…
              </option>
              {creatableAudiences.map((audience) => (
                <option key={audience} value={audience} className="bg-[#191c22] text-[#e1e2eb]">
                  {AUDIENCE_LABELS[audience]}
                </option>
              ))}
            </select>
          )}
          {activeVariantKey && (
            <button
              type="button"
              onClick={() => handleRemoveVariant(activeVariantKey)}
              data-testid="page-designer-remove-audience"
              title={`Eliminar la variante ${AUDIENCE_LABELS[activeVariantKey]}`}
              aria-label={`Eliminar la variante ${AUDIENCE_LABELS[activeVariantKey]}`}
              className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ToolbarToggle
            active={paletteOpen}
            onClick={() => setPaletteOpen((current) => !current)}
            label={paletteOpen ? 'Ocultar la biblioteca' : 'Mostrar la biblioteca'}
            testId="page-designer-toggle-palette"
          >
            {paletteOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </ToolbarToggle>
          <ToolbarToggle
            active={propertiesOpen}
            onClick={() => setPropertiesOpen((current) => !current)}
            label={propertiesOpen ? 'Ocultar propiedades' : 'Mostrar propiedades'}
            testId="page-designer-toggle-properties"
          >
            {propertiesOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </ToolbarToggle>
          <ToolbarToggle
            active={expanded}
            onClick={() => setExpanded((current) => !current)}
            label={expanded ? 'Salir de pantalla completa (Esc)' : 'Ampliar a pantalla completa'}
            testId="page-designer-toggle-expand"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </ToolbarToggle>

          <span className="mx-1 h-5 w-px bg-border/50" />

          <button
            type="button"
            onClick={history.undo}
            disabled={!history.canUndo}
            aria-label="Deshacer"
            title="Deshacer (Ctrl+Z)"
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label="Rehacer"
            title="Rehacer (Ctrl+Shift+Z)"
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            data-testid="page-designer-preview-button"
            className="ml-2 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20"
          >
            <Eye className="h-3.5 w-3.5" /> Vista previa
          </button>
        </div>
      </div>

        {activeVariantKey && (
          <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-4 text-amber-200">
            Estás editando la variante <span className="font-bold">{AUDIENCE_LABELS[activeVariantKey]}</span>. Los
            cambios no afectan la página predeterminada. La audiencia decide qué se muestra, nunca a qué datos se puede
            acceder.
          </p>
        )}
      </div>

      <div className={expanded ? 'px-4 pb-4' : 'mt-3'}>
      <DndContext
        // Belt and braces with the constant-size drop zones in
        // DesignerRegionCanvas: the canvas renders REAL widgets, whose own
        // height can still change mid-drag (an image finishing loading, a
        // relative timestamp ticking over). Re-measuring on every drag frame
        // means a stale rect can never silently swallow a drop.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        collisionDetection={collisionDetection}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        {/* @container, not the viewport breakpoints: how much room the three
            columns actually have depends on Catalog Builder's own rail, which
            appears at xl — so a WIDER viewport can leave this area NARROWER.
            Measuring the element itself is the only reading that holds. */}
        <div className="@container">
          {/* `flex-wrap` gives the two panels different thresholds without a
              second media query: the palette is narrow enough to sit beside
              the canvas from @4xl, while the properties panel stays `w-full`
              until @6xl and therefore WRAPS below the canvas in between —
              the canvas keeps the width instead of being squeezed to ~360px
              by three columns that never fit. */}
          <div className="flex flex-col gap-4 @4xl:flex-row @4xl:flex-wrap @4xl:items-start">
            {paletteOpen && (
              <PageComponentPalette
                surface={surface}
                entityKey={entityKey}
                specification={specification}
                placedIndex={placedIndex}
                onAdd={handleAddFromPalette}
                onSelectExisting={selectAndReveal}
              />
            )}
            <div
              className="min-w-0 flex-1 rounded-2xl border border-dashed border-border/40 bg-surface-container-low/40 p-3"
              onClick={(event) => {
                if (event.target === event.currentTarget) setSelectedId(null);
              }}
            >
              <PageRegionsSkeleton
                sidebarColumns={activePage.sidebarColumns}
                header={renderRegionCanvas('header')}
                actions={renderRegionCanvas('actions')}
                main={renderRegionCanvas('main')}
                sidebar={renderRegionCanvas('sidebar')}
                footer={renderRegionCanvas('footer')}
              />
            </div>
            {propertiesOpen && (
              <PagePropertiesPanel
                surface={surface}
                page={activePage}
                selectedId={selectedId}
                specification={specification}
                neighbours={selectedNeighbours}
                onUpdatePlacement={(id, updater) => commitPageChange(updatePlacement(activePage, id, updater))}
                onResizeSpan={handleResizeEnd}
                onMove={handleMove}
                onMoveToRegion={handleMoveToRegion}
                onDuplicate={handleDuplicate}
                onRemove={handleRemove}
                onSidebarColumnsChange={(value) => commitPageChange(updateSidebarColumns(activePage, value))}
                onClose={() => setPropertiesOpen(false)}
              />
            )}
          </div>
        </div>

        {/*
          DragOverlay positions itself with CSS `position: fixed`, computed
          relative to the viewport. If it's rendered anywhere under an
          ancestor with a CSS transform/filter/will-change (very common in
          this app's layout shells), that ancestor becomes the fixed
          positioning context instead of the viewport, and the overlay
          renders offset from the cursor by a constant amount — exactly the
          "floating chip appears in the wrong place" symptom. Portaling it
          straight to document.body sidesteps any ancestor styling; the
          DndContext React context still reaches it because portals don't
          break the React tree, only the DOM insertion point.
        */}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeDrag && (
              <div
                className="pointer-events-none flex items-center gap-2 rounded-xl border-2 border-primary bg-surface-container px-3 py-2 text-xs font-bold text-primary shadow-2xl"
                style={{ width: Math.max(140, activeDrag.span * 56) }}
              >
                <span className="truncate">{activeDrag.label}</span>
                <span className="ml-auto shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px]">
                  {activeDrag.span}/12
                </span>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
      </div>

      {previewOpen && (
        <PageTemplatePreview
          surface={surface}
          entityKey={entityKey}
          page={activePage}
          specification={specification}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );

  // Portaled rather than merely `position: fixed` in place: any ancestor with
  // a transform/filter/will-change becomes the containing block for fixed
  // positioning, and this app's shells use those liberally (the same trap the
  // DragOverlay comment above documents). React state survives the move
  // because a portal changes the DOM parent, not the React tree.
  return expanded ? createPortal(designer, document.body) : designer;
}

function ToolbarToggle({
  active,
  onClick,
  label,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`rounded-lg p-2 transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}
