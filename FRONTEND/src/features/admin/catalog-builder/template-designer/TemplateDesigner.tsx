import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import type {
  AudienceKey,
  CatalogSpecification,
  FormLayouts,
  LayoutKind,
  Placement,
} from '@/features/catalog/metamodel';
import { upgradeSpecificationTo14 } from '@/features/catalog/runtime/layout-normalizer';
import { SectionHeading } from '../ui';
import { DesignerToolbar } from './DesignerToolbar';
import { ComponentPalette, type PaletteItem } from './ComponentPalette';
import { LayoutCanvas } from './LayoutCanvas';
import { PageDesigner } from './page-designer/PageDesigner';
import { PropertiesPanel, type SelectedElement } from './PropertiesPanel';
import { TemplatePreview } from './TemplatePreview';
import { useDesignerHistory } from './useDesignerHistory';
import { ticketDetailFields, widgetLibraryItems } from './library-fields';
import {
  addSection,
  duplicateSection,
  getDocument,
  insertPlacementAt,
  moveSection,
  movePlacement,
  removePlacement,
  removeSection,
  setDocument,
  updatePlacement,
  updateSection,
} from './document-ops';

type DragPayload =
  | { type: 'palette'; item: PaletteItem }
  | { type: 'placement'; placementId: string }
  | { type: 'section'; sectionId: string };

const AUDIENCE_LABELS: Record<AudienceKey, string> = {
  requester: 'Solicitante',
  agent: 'Técnico',
  supervisor: 'Supervisor',
};

function paletteItemToPlacement(item: PaletteItem): Placement {
  if (item.kind === 'widget') {
    return { id: crypto.randomUUID(), kind: 'widget', widgetKey: item.widgetKey, columnSpan: 1 };
  }
  return { id: crypto.randomUUID(), kind: 'field', source: item.source, fieldKey: item.fieldKey, columnSpan: 1 };
}

export function TemplateDesigner({
  specification,
  updateSpecification,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
}) {
  const [layoutsBaseline] = useState<FormLayouts>(() => upgradeSpecificationTo14(specification).layouts!);
  const history = useDesignerHistory(layoutsBaseline);
  const layouts = history.present;

  const persistedInitial = useRef(false);
  useEffect(() => {
    if (!persistedInitial.current && !specification.layouts) {
      persistedInitial.current = true;
      updateSpecification((current) => ({ ...current, layouts: layoutsBaseline }));
    }
    // Runs once per mount; TemplateDesigner is remounted per selected
    // definition (keyed by id in CatalogBuilder), so this never leaks state
    // across entities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastSynced = useRef(layoutsBaseline);
  useEffect(() => {
    if (history.present !== lastSynced.current) {
      lastSynced.current = history.present;
      updateSpecification((current) => ({ ...current, layouts: history.present }));
    }
  }, [history.present, updateSpecification]);

  const [activeKind, setActiveKind] = useState<LayoutKind>('create');
  const [activeVariantKey, setActiveVariantKey] = useState<AudienceKey | null>(null);
  const [selected, setSelected] = useState<SelectedElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draggedPlacementId, setDraggedPlacementId] = useState<string | null>(null);
  const dragPayloadRef = useRef<DragPayload | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const activeLayoutDefinition = layouts[activeKind];
  const activeDocument = useMemo(
    () => getDocument(activeLayoutDefinition, activeVariantKey),
    [activeLayoutDefinition, activeVariantKey],
  );
  const availableVariantKeys = (activeLayoutDefinition?.variants ?? []).map((variant) => variant.audienceKey);

  function commitDocumentChange(nextDocument: typeof activeDocument) {
    const nextDefinition = setDocument(activeLayoutDefinition, activeVariantKey, nextDocument);
    history.commit({ ...layouts, [activeKind]: nextDefinition });
    setDirty(true);
  }

  function handleChangeKind(kind: LayoutKind) {
    setActiveKind(kind);
    setActiveVariantKey(null);
    setSelected(null);
  }

  function handleChangeVariant(audience: AudienceKey | null) {
    setActiveVariantKey(audience);
    setSelected(null);
  }

  function handleAddVariant(audience: AudienceKey) {
    const definition = activeLayoutDefinition ?? { default: { sections: [] } };
    const variants = [
      ...(definition.variants ?? []),
      {
        key: crypto.randomUUID(),
        label: AUDIENCE_LABELS[audience],
        audienceKey: audience,
        document: { sections: [] },
      },
    ];
    history.commit({ ...layouts, [activeKind]: { ...definition, variants } });
    setDirty(true);
    setActiveVariantKey(audience);
    setSelected(null);
  }

  function handleAddSection() {
    const id = crypto.randomUUID();
    commitDocumentChange(addSection(activeDocument, { id, columns: 1, placements: [] }));
    setSelected({ type: 'section', id });
  }

  function handleDuplicateSection(sectionId: string) {
    const original = activeDocument.sections.find((section) => section.id === sectionId);
    const newSectionId = crypto.randomUUID();
    const newPlacementIds = (original?.placements ?? []).map(() => crypto.randomUUID());
    commitDocumentChange(duplicateSection(activeDocument, sectionId, newSectionId, newPlacementIds));
  }

  function handlePaletteDragStart(item: PaletteItem) {
    dragPayloadRef.current = { type: 'palette', item };
  }

  function handlePlacementDragStart(placementId: string) {
    dragPayloadRef.current = { type: 'placement', placementId };
    setDraggedPlacementId(placementId);
  }

  function handleSectionDragStart(sectionId: string) {
    dragPayloadRef.current = { type: 'section', sectionId };
  }

  function clearDrag() {
    dragPayloadRef.current = null;
    setDraggedPlacementId(null);
  }

  function handleDropAt(sectionId: string, index: number) {
    const payload = dragPayloadRef.current;
    clearDrag();
    if (!payload) return;
    if (payload.type === 'palette') {
      commitDocumentChange(insertPlacementAt(activeDocument, sectionId, index, paletteItemToPlacement(payload.item)));
    } else if (payload.type === 'placement') {
      commitDocumentChange(movePlacement(activeDocument, payload.placementId, sectionId, index));
    }
  }

  function handleSectionDrop(targetSectionId: string) {
    const payload = dragPayloadRef.current;
    clearDrag();
    if (!payload || payload.type !== 'section' || payload.sectionId === targetSectionId) return;
    const fromIndex = activeDocument.sections.findIndex((section) => section.id === payload.sectionId);
    const toIndex = activeDocument.sections.findIndex((section) => section.id === targetSectionId);
    if (fromIndex === -1 || toIndex === -1) return;
    commitDocumentChange(moveSection(activeDocument, fromIndex, toIndex));
  }

  function labelFor(placement: Placement): string {
    if (placement.kind === 'widget') {
      return widgetLibraryItems.find((item) => item.widgetKey === placement.widgetKey)?.label ?? placement.widgetKey ?? 'Elemento';
    }
    if (placement.label) return placement.label;
    if (placement.source === 'catalog') {
      return specification.fields.find((field) => field.key === placement.fieldKey)?.label ?? placement.fieldKey ?? '';
    }
    return ticketDetailFields.find((item) => item.fieldKey === placement.fieldKey)?.label ?? placement.fieldKey ?? '';
  }

  if (activeKind === 'detail') {
    return (
      <section className="panel-card space-y-5 p-6 lg:p-8" data-testid="template-designer">
        <SectionHeading
          icon={<LayoutTemplate className="h-5 w-5" />}
          title="Diseñador de plantilla"
          description="Diseña la página completa del ticket por zonas: encabezado, acciones, contenido principal, columna lateral y secciones inferiores."
        />
        <PageDesigner
          specification={specification}
          updateSpecification={updateSpecification}
          activeKind={activeKind}
          onChangeKind={handleChangeKind}
        />
      </section>
    );
  }

  return (
    <section className="panel-card space-y-5 p-6 lg:p-8" data-testid="template-designer">
      <SectionHeading
        icon={<LayoutTemplate className="h-5 w-5" />}
        title="Diseñador de plantilla"
        description="Arrastra campos y secciones para diseñar Crear, Editar y Detalle. La audiencia solo cambia lo que se muestra, no autoriza el acceso a los datos."
      />
      <DesignerToolbar
        activeKind={activeKind}
        onChangeKind={handleChangeKind}
        activeVariantKey={activeVariantKey}
        availableVariantKeys={availableVariantKeys}
        onChangeVariant={handleChangeVariant}
        onAddVariant={handleAddVariant}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onPreview={() => setPreviewOpen(true)}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <ComponentPalette
          specification={specification}
          onAddSection={handleAddSection}
          onDragStart={handlePaletteDragStart}
        />
        <div className="min-w-0 flex-1">
          <LayoutCanvas
            document={activeDocument}
            labelFor={labelFor}
            selectedId={selected?.id ?? null}
            draggedPlacementId={draggedPlacementId}
            onSelectSection={(id) => setSelected({ type: 'section', id })}
            onSelectPlacement={(id) => setSelected({ type: 'placement', id })}
            onRemovePlacement={(id) => commitDocumentChange(removePlacement(activeDocument, id))}
            onRemoveSection={(id) => commitDocumentChange(removeSection(activeDocument, id))}
            onDuplicateSection={handleDuplicateSection}
            onSectionDragStart={handleSectionDragStart}
            onSectionDrop={handleSectionDrop}
            onPlacementDragStart={handlePlacementDragStart}
            onDropAt={handleDropAt}
          />
        </div>
        <PropertiesPanel
          selected={selected}
          document={activeDocument}
          specification={specification}
          onUpdateSection={(id, updater) => commitDocumentChange(updateSection(activeDocument, id, updater))}
          onUpdatePlacement={(id, updater) => commitDocumentChange(updatePlacement(activeDocument, id, updater))}
          onClose={() => setSelected(null)}
        />
      </div>
      {previewOpen && (
        <TemplatePreview
          kind={activeKind}
          document={activeDocument}
          specification={specification}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </section>
  );
}
