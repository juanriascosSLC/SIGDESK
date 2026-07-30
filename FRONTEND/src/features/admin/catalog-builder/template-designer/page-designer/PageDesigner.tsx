import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Eye, Redo2, Undo2 } from 'lucide-react';
import type {
  AudienceKey,
  CatalogSpecification,
  LayoutKind,
  PageLayout,
  PageLayoutDefinition,
  RegionName,
  WidgetKey,
} from '@/features/catalog/metamodel';
import { PageRegionsSkeleton } from '@/features/catalog/runtime/PageLayoutRenderer';
import { upgradeSpecificationToPageLayout } from '@/features/catalog/runtime/page-layout-normalizer';
import { renderTicketPlacementContent } from '@/features/tickets/widgets/render-placement';
import { TICKET_WIDGETS } from '@/features/tickets/widgets/TicketWidgetRegistry';
import { useDesignerHistory } from '../useDesignerHistory';
import { DesignerRegionCanvas } from './DesignerRegionCanvas';
import { PageComponentPalette } from './PageComponentPalette';
import { PagePropertiesPanel } from './PagePropertiesPanel';
import { PageTemplatePreview } from './PageTemplatePreview';
import { useSimulatedTicketContext } from './useSimulatedTicketContext';
import type { PageLibraryItem } from './page-library';
import { updatePlacement, updateSidebarColumns } from './page-document-ops';
import {
  addPaletteCell,
  applyResizeInRegions,
  buildRegionsFromPage,
  compileRegionsToPage,
  defaultSpanFor,
  moveExistingCell,
  parseDropTargetId,
  placementLabel,
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
const REGION_LABELS: Record<RegionName, string> = {
  header: 'Encabezado',
  actions: 'Barra de acciones',
  main: 'Contenido principal',
  sidebar: 'Columna lateral',
  footer: 'Secciones inferiores',
};
const REGION_EMPTY_HINTS: Record<RegionName, string> = {
  header: 'Región fija — no admite elementos adicionales',
  actions: 'Región fija — no admite elementos adicionales',
  main: 'Arrastra campos o widgets aquí',
  sidebar: 'Arrastra campos o widgets aquí',
  footer: 'Arrastra campos o widgets aquí',
};

export function PageDesigner({
  specification,
  updateSpecification,
  activeKind,
  onChangeKind,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
  activeKind: LayoutKind;
  onChangeKind: (kind: LayoutKind) => void;
}) {
  const [pageBaseline] = useState<PageLayoutDefinition>(
    () => upgradeSpecificationToPageLayout(specification).detailPage!,
  );
  const history = useDesignerHistory(pageBaseline);
  const definition = history.present;

  const persistedInitial = useRef(false);
  useEffect(() => {
    if (!persistedInitial.current && !specification.detailPage) {
      persistedInitial.current = true;
      updateSpecification((current) => ({ ...current, detailPage: pageBaseline }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastSynced = useRef(pageBaseline);
  useEffect(() => {
    if (history.present !== lastSynced.current) {
      lastSynced.current = history.present;
      updateSpecification((current) => ({ ...current, detailPage: history.present }));
    }
  }, [history.present, updateSpecification]);

  const [activeVariantKey, setActiveVariantKey] = useState<AudienceKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [liveRegions, setLiveRegions] = useState<RegionsState | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDragInfo | null>(null);

  const { context: simulatedContext } = useSimulatedTicketContext(specification);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const activePage: PageLayout = activeVariantKey
    ? (definition.variants?.find((variant) => variant.audienceKey === activeVariantKey)?.page ?? definition.default)
    : definition.default;
  const availableVariantKeys = (definition.variants ?? []).map((variant) => variant.audienceKey);
  const creatableAudiences: AudienceKey[] = (['requester', 'agent', 'supervisor'] as AudienceKey[]).filter(
    (audience) => !availableVariantKeys.includes(audience),
  );

  const baseRegions = useMemo(() => buildRegionsFromPage(activePage), [activePage]);
  const regions = liveRegions ?? baseRegions;

  function commitPageChange(nextPage: PageLayout) {
    const nextDefinition: PageLayoutDefinition = activeVariantKey
      ? {
          ...definition,
          variants: (definition.variants ?? []).map((variant) =>
            variant.audienceKey === activeVariantKey ? { ...variant, page: nextPage } : variant,
          ),
        }
      : { ...definition, default: nextPage };
    history.commit(nextDefinition);
    setDirty(true);
  }

  function commitRegions(nextRegions: RegionsState) {
    commitPageChange(compileRegionsToPage(activePage, nextRegions));
  }

  function handleAddVariant(audience: AudienceKey) {
    const variants = [
      ...(definition.variants ?? []),
      { key: crypto.randomUUID(), label: AUDIENCE_LABELS[audience], audienceKey: audience, page: definition.default },
    ];
    history.commit({ ...definition, variants });
    setDirty(true);
    setActiveVariantKey(audience);
    setSelectedId(null);
  }

  function regionAccepts(regionName: RegionName): boolean {
    if (!activeDrag?.widgetKey) return true;
    return TICKET_WIDGETS[activeDrag.widgetKey]?.allowedRegions.includes(regionName) ?? true;
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
        span: snapSpan(defaultSpanFor(data.item)),
        label: data.item.label,
        widgetKey: data.item.kind === 'widget' ? data.item.widgetKey : undefined,
      });
      return;
    }
    for (const regionName of Object.keys(regions) as RegionName[]) {
      const location = findCell(regions[regionName], data.cellId);
      if (!location) continue;
      const cell = regions[regionName].rows[location.rowIndex].cells[location.cellIndex];
      setActiveDrag({
        source: 'existing',
        cellId: cell.id,
        span: cell.span,
        label: placementLabel(cell.placement, specification),
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
      drag.source === 'palette' ? addPaletteCell(regions, drag.item, target) : moveExistingCell(regions, drag.cellId, target);
    if (nextRegions === regions) return;
    commitRegions(nextRegions);
  }

  function handleSelect(placementId: string) {
    setSelectedId(placementId);
  }

  function handleRemove(placementId: string) {
    const cellId = cellIdForPlacement(placementId);
    for (const regionName of Object.keys(regions) as RegionName[]) {
      const location = findCell(regions[regionName], cellId);
      if (!location) continue;
      const cell = regions[regionName].rows[location.rowIndex].cells[location.cellIndex];
      if (cell.placement.locked) return;
      commitRegions({ ...regions, [regionName]: removeCell(regions[regionName], cellId) });
      if (selectedId === placementId) setSelectedId(null);
      return;
    }
  }

  function handleResizePreview(placementId: string, span: DesignerSpan) {
    const cellId = cellIdForPlacement(placementId);
    setLiveRegions((current) => applyResizeInRegions(current ?? baseRegions, cellId, span));
  }

  function handleResizeEnd(placementId: string, span: DesignerSpan) {
    const cellId = cellIdForPlacement(placementId);
    const finalRegions = applyResizeInRegions(liveRegions ?? baseRegions, cellId, span);
    setLiveRegions(null);
    commitRegions(finalRegions);
  }

  function renderRegionCanvas(regionName: RegionName) {
    return (
      <div
        data-testid={`page-designer-region-wrapper-${regionName}`}
        className="rounded-2xl border border-border/30 bg-surface-container/40 p-3"
      >
        <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
          {REGION_LABELS[regionName]}
        </div>
        <DesignerRegionCanvas
          region={regions[regionName]}
          regionName={regionName}
          isDragActive={Boolean(activeDrag)}
          dragAccepted={regionAccepts(regionName)}
          selectedId={selectedId}
          onSelect={handleSelect}
          onRemove={handleRemove}
          onResize={handleResizePreview}
          onResizeEnd={handleResizeEnd}
          renderCellContent={(placement) => renderTicketPlacementContent(placement, simulatedContext, () => {})}
          emptyHint={REGION_EMPTY_HINTS[regionName]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="page-designer">
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
          <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Sidebar
            <select
              value={definition.default.sidebarColumns}
              onChange={(event) => {
                const value = Number(event.target.value);
                history.commit({ ...definition, default: updateSidebarColumns(definition.default, value) });
                setDirty(true);
              }}
              className="rounded-lg border border-border/40 bg-surface-container-low px-2 py-1 text-xs font-bold text-on-surface"
              style={{ colorScheme: 'dark' }}
            >
              {[3, 4, 5].map((value) => (
                <option key={value} value={value} className="bg-[#191c22] text-[#e1e2eb]">
                  {value}/12
                </option>
              ))}
            </select>
          </label>
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
              Predeterminado
            </option>
            {availableVariantKeys.map((audience) => (
              <option key={audience} value={audience} className="bg-[#191c22] text-[#e1e2eb]">
                {AUDIENCE_LABELS[audience]}
              </option>
            ))}
          </select>
          {creatableAudiences.length > 0 && (
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) handleAddVariant(event.target.value as AudienceKey);
              }}
              data-testid="page-designer-add-audience"
              className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-xs font-bold text-primary"
              style={{ colorScheme: 'dark' }}
            >
              <option value="" className="bg-[#191c22] text-[#e1e2eb]">
                + Variante de audiencia…
              </option>
              {creatableAudiences.map((audience) => (
                <option key={audience} value={audience} className="bg-[#191c22] text-[#e1e2eb]">
                  {AUDIENCE_LABELS[audience]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={history.undo}
            disabled={!history.canUndo}
            aria-label="Deshacer"
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label="Rehacer"
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

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <PageComponentPalette specification={specification} />
          <div className="min-w-0 flex-1 rounded-2xl border border-dashed border-border/40 bg-surface-container-low/40 p-4">
            <PageRegionsSkeleton
              sidebarColumns={activePage.sidebarColumns}
              header={renderRegionCanvas('header')}
              actions={renderRegionCanvas('actions')}
              main={renderRegionCanvas('main')}
              sidebar={renderRegionCanvas('sidebar')}
              footer={renderRegionCanvas('footer')}
            />
          </div>
          <PagePropertiesPanel
            page={activePage}
            selectedId={selectedId}
            specification={specification}
            onUpdatePlacement={(id, updater) => commitPageChange(updatePlacement(activePage, id, updater))}
            onResizeSpan={handleResizeEnd}
            onClose={() => setSelectedId(null)}
          />
        </div>

        <DragOverlay>
          {activeDrag && (
            <div
              className="rounded-2xl border-2 border-primary bg-primary/10 px-3 py-2 text-xs font-bold text-primary shadow-lg"
              style={{ width: Math.max(96, activeDrag.span * 56) }}
            >
              {activeDrag.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {previewOpen && (
        <PageTemplatePreview page={activePage} specification={specification} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}
