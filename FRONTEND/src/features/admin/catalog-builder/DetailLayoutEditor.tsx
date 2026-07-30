import { useState } from 'react';
import {
  GripVertical,
  LayoutDashboard,
  Plus,
  X,
} from 'lucide-react';
import type {
  CatalogSpecification,
  DetailFieldPlacement,
  DetailFieldSource,
  DetailFieldWidth,
  FieldDefinition,
} from '@/features/catalog/metamodel';
import { SectionHeading, Toggle } from './ui';

const ticketDetailFields: Array<{
  source: DetailFieldSource;
  fieldKey: string;
  label: string;
}> = [
  { source: 'ticket', fieldKey: 'requester', label: 'Solicitante' },
  { source: 'ticket', fieldKey: 'assignee', label: 'Asignado a' },
  { source: 'ticket', fieldKey: 'createdAt', label: 'Fecha de creación' },
  { source: 'ticket', fieldKey: 'status', label: 'Estado' },
  { source: 'ticket', fieldKey: 'humanId', label: 'Número del ticket' },
  { source: 'ticket', fieldKey: 'mergedCount', label: 'Tickets combinados' },
];

function defaultDetailFields(fields: FieldDefinition[]): DetailFieldPlacement[] {
  const catalogPlacement = (
    fieldKey: string,
    width: DetailFieldWidth = 'third',
  ): DetailFieldPlacement | null =>
    fields.some((field) => field.key === fieldKey)
      ? { source: 'catalog', fieldKey, width }
      : null;
  return [
    { source: 'ticket', fieldKey: 'requester', width: 'third' as const },
    { source: 'ticket', fieldKey: 'assignee', width: 'third' as const },
    catalogPlacement('priority'),
    catalogPlacement('category'),
    { source: 'ticket', fieldKey: 'createdAt', width: 'third' as const },
    catalogPlacement('site'),
    catalogPlacement('deviceType'),
    catalogPlacement('assetId'),
    catalogPlacement('deviceModel'),
    catalogPlacement('cameraChannel'),
    catalogPlacement('nvrAffectedChannels'),
    catalogPlacement('serverService'),
    catalogPlacement('description', 'full'),
  ].filter((placement): placement is DetailFieldPlacement => placement !== null);
}

export function DetailLayoutEditor({
  specification,
  updateSpecification,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const placements =
    specification.detailLayout?.fields ?? defaultDetailFields(specification.fields);
  const available = [
    ...ticketDetailFields,
    ...specification.fields.map((field) => ({
      source: 'catalog' as const,
      fieldKey: field.key,
      label: field.label,
    })),
  ].filter(
    (candidate) =>
      !placements.some(
        (placement) =>
          placement.source === candidate.source &&
          placement.fieldKey === candidate.fieldKey,
      ),
  );

  function fieldLabel(placement: DetailFieldPlacement) {
    return placement.label ||
      (placement.source === 'catalog'
        ? specification.fields.find((field) => field.key === placement.fieldKey)?.label
        : ticketDetailFields.find((field) => field.fieldKey === placement.fieldKey)?.label) ||
      placement.fieldKey;
  }

  function updateLayout(
    updater: (fields: DetailFieldPlacement[]) => DetailFieldPlacement[],
  ) {
    updateSpecification((current) => {
      const currentFields =
        current.detailLayout?.fields ?? defaultDetailFields(current.fields);
      current.detailLayout = {
        fields: updater([...currentFields]),
        showSla: current.detailLayout?.showSla ?? true,
        showAttachments: current.detailLayout?.showAttachments ?? true,
        showActivity: current.detailLayout?.showActivity ?? true,
      };
      return current;
    });
  }

  function setSection(
    key: 'showSla' | 'showAttachments' | 'showActivity',
    checked: boolean,
  ) {
    updateSpecification((current) => {
      current.detailLayout = {
        fields: current.detailLayout?.fields ?? defaultDetailFields(current.fields),
        showSla: current.detailLayout?.showSla ?? true,
        showAttachments: current.detailLayout?.showAttachments ?? true,
        showActivity: current.detailLayout?.showActivity ?? true,
        [key]: checked,
      };
      return current;
    });
  }

  return (
    <section className="panel-card p-6 lg:p-8">
      <SectionHeading
        icon={<LayoutDashboard className="w-5 h-5" />}
        title="Diseño del ticket"
        description="Elige qué datos se verán y arrástralos para cambiar su orden."
      />

      <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-on-surface-variant">
        El encabezado y las acciones siguen siendo controles del sistema. Aquí organizas los datos
        versionados de la entidad y las secciones conectadas a otros módulos.
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_280px] gap-5 mt-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-on-surface">Lienzo del detalle</h3>
              <p className="text-xs text-on-surface-variant">
                Arrastra las tarjetas. El ancho simula la grilla real de Tickets.
              </p>
            </div>
            <span className="text-xs text-on-surface-variant">{placements.length} tarjetas</span>
          </div>
          <div className="grid grid-cols-6 gap-3 rounded-2xl border border-dashed border-border/60 bg-surface-container-low p-4 min-h-40">
            {placements.length === 0 && (
              <div className="col-span-6 py-12 text-center text-sm text-on-surface-variant">
                Agrega campos desde la biblioteca.
              </div>
            )}
            {placements.map((placement, index) => {
              const span =
                placement.width === 'full'
                  ? 'col-span-6'
                  : placement.width === 'half'
                    ? 'col-span-3'
                    : 'col-span-2';
              return (
                <div
                  key={`${placement.source}:${placement.fieldKey}`}
                  data-testid={`catalog-layout-placement-${placement.source}-${placement.fieldKey}`}
                  draggable
                  onDragStart={() => setDraggedIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedIndex === null || draggedIndex === index) return;
                    updateLayout((fields) => {
                      const [dragged] = fields.splice(draggedIndex, 1);
                      fields.splice(index, 0, dragged);
                      return fields;
                    });
                    setDraggedIndex(null);
                  }}
                  onDragEnd={() => setDraggedIndex(null)}
                  className={`${span} min-w-0 rounded-xl border p-3 ${
                    draggedIndex === index
                      ? 'border-primary/60 bg-primary/10 opacity-60'
                      : 'border-border/50 bg-surface-container'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-4 h-4 mt-1 text-on-surface-variant cursor-grab shrink-0" />
                    <div className="min-w-0 flex-1">
                      <input
                        aria-label={`Etiqueta de ${fieldLabel(placement)}`}
                        value={placement.label ?? ''}
                        onChange={(event) =>
                          updateLayout((fields) => {
                            fields[index] = {
                              ...fields[index],
                              label: event.target.value || undefined,
                            };
                            return fields;
                          })
                        }
                        placeholder={fieldLabel({ ...placement, label: undefined })}
                        className="w-full bg-transparent text-xs font-bold text-on-surface outline-none placeholder:text-on-surface"
                      />
                      <p className="mt-1 truncate font-mono text-[9px] text-on-surface-variant">
                        {placement.source}:{placement.fieldKey}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Quitar ${fieldLabel(placement)}`}
                      onClick={() =>
                        updateLayout((fields) =>
                          fields.filter((_, currentIndex) => currentIndex !== index),
                        )
                      }
                      className="text-on-surface-variant hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <select
                    value={placement.width ?? 'third'}
                    onChange={(event) =>
                      updateLayout((fields) => {
                        fields[index] = {
                          ...fields[index],
                          width: event.target.value as DetailFieldWidth,
                        };
                        return fields;
                      })
                    }
                    className="mt-3 w-full rounded-lg border border-border/40 bg-surface-container-high px-2 py-1 text-[10px] text-on-surface"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="third" className="bg-[#191c22] text-[#e1e2eb]">1/3 del ancho</option>
                    <option value="half" className="bg-[#191c22] text-[#e1e2eb]">1/2 del ancho</option>
                    <option value="full" className="bg-[#191c22] text-[#e1e2eb]">Ancho completo</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-surface-container p-4">
            <h3 className="text-sm font-bold text-on-surface">Biblioteca</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Agrega datos del catálogo o del sistema.
            </p>
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {available.length === 0 && (
                <p className="py-4 text-center text-xs text-on-surface-variant">
                  Todos los campos están en el lienzo.
                </p>
              )}
              {available.map((candidate) => (
                <button
                  type="button"
                  key={`${candidate.source}:${candidate.fieldKey}`}
                  data-testid={`catalog-layout-library-${candidate.source}-${candidate.fieldKey}`}
                  onClick={() =>
                    updateLayout((fields) => [
                      ...fields,
                      {
                        source: candidate.source,
                        fieldKey: candidate.fieldKey,
                        width: 'third',
                      },
                    ])
                  }
                  className="w-full rounded-xl border border-border/40 bg-surface-container-low p-3 text-left hover:border-primary/40"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-on-surface">{candidate.label}</span>
                    <Plus className="w-4 h-4 text-primary shrink-0" />
                  </span>
                  <span className="mt-1 block font-mono text-[9px] text-on-surface-variant">
                    {candidate.source === 'catalog' ? 'Catálogo' : 'Sistema'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-surface-container p-4">
            <h3 className="text-sm font-bold text-on-surface">Secciones funcionales</h3>
            <div className="mt-3 space-y-3">
              <Toggle
                checked={specification.detailLayout?.showSla ?? true}
                onChange={(checked) => setSection('showSla', checked)}
                label="Acuerdo de nivel de servicio"
              />
              <Toggle
                checked={specification.detailLayout?.showAttachments ?? true}
                onChange={(checked) => setSection('showAttachments', checked)}
                label="Adjuntos"
              />
              <Toggle
                checked={specification.detailLayout?.showActivity ?? true}
                onChange={(checked) => setSection('showActivity', checked)}
                label="Actividad y comentarios"
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
