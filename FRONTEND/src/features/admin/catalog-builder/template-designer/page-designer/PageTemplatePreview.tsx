import { X } from 'lucide-react';
import type { CatalogSpecification, PageLayout } from '@/features/catalog/metamodel';
import { DynamicField } from '@/features/catalog/DynamicField';
import { PageLayoutRenderer } from '@/features/catalog/runtime/PageLayoutRenderer';
import type { AnyPageSurface } from './surface';

// Uses the exact same PageLayoutRenderer and placement dispatcher the real
// page and the designer canvas use — with a simulated context instead of live
// data — so what is shown here are the real components, not lookalikes.
// Sample field values are editable so `visibleWhen` conditions can be
// exercised interactively.
export function PageTemplatePreview({
  surface,
  entityKey,
  page,
  specification,
  onClose,
}: {
  surface: AnyPageSurface;
  entityKey: string;
  page: PageLayout;
  specification: CatalogSpecification;
  onClose: () => void;
}) {
  const { context, sampleData, setFieldSampleValue } = surface.useSimulatedContext(
    specification,
    entityKey,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        data-testid="page-designer-preview"
        className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-border/40 bg-surface-container-low p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">
            Vista previa — {surface.kindLabel}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="text-on-surface-variant hover:text-on-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {specification.fields.length > 0 && (
          <details className="mb-6 rounded-2xl border border-border/40 bg-surface-container p-4">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Datos de ejemplo (para probar condiciones)
            </summary>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {specification.fields.map((field) => (
                <DynamicField
                  key={field.key}
                  field={field}
                  value={sampleData[field.key]}
                  required={false}
                  onChange={(value) => setFieldSampleValue(field.key, value)}
                />
              ))}
            </div>
          </details>
        )}

        <PageLayoutRenderer
          page={page}
          data={sampleData}
          renderPlacement={(placement) => surface.renderPlacementContent(placement, context)}
        />
      </div>
    </div>
  );
}
