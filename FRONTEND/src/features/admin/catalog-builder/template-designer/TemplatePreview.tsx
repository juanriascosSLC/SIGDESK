import { useState } from 'react';
import { X } from 'lucide-react';
import type {
  CatalogSpecification,
  FieldDefinition,
  LayoutDocument,
  LayoutKind,
  Placement,
} from '@/features/catalog/metamodel';
import { DynamicLayout } from '@/features/catalog/runtime/DynamicLayout';
import { DynamicField } from '@/features/catalog/DynamicField';
import { widgetLibraryItems } from './library-fields';

function sampleValue(field: FieldDefinition): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'boolean') return false;
  if (field.type === 'select') return field.options?.[0]?.value ?? '';
  return '';
}

const KIND_LABEL: Record<LayoutKind, string> = { create: 'Crear', edit: 'Editar', detail: 'Detalle' };

// Uses the exact same DynamicLayout the runtime uses — not a lookalike — with
// an editable sample-data panel (the DynamicField inputs themselves) so
// conditions like `category = cameras` can be exercised live, not just
// guessed from a static placeholder.
export function TemplatePreview({
  kind,
  document,
  specification,
  onClose,
}: {
  kind: LayoutKind;
  document: LayoutDocument;
  specification: CatalogSpecification;
  onClose: () => void;
}) {
  const [sampleData, setSampleData] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(specification.fields.map((field) => [field.key, sampleValue(field)])),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        data-testid="template-designer-preview"
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border/40 bg-surface-container-low p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">
            Vista previa — {KIND_LABEL[kind]}
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
        <DynamicLayout
          document={document}
          data={sampleData}
          renderPlacement={(placement: Placement) => {
            if (placement.kind === 'widget') {
              const label = widgetLibraryItems.find((item) => item.widgetKey === placement.widgetKey)?.label;
              return (
                <div className="flex h-full min-h-16 items-center justify-center rounded-xl border border-dashed border-border/40 bg-surface-container p-4 text-center text-xs text-on-surface-variant">
                  {label ?? placement.widgetKey}
                </div>
              );
            }
            if (placement.source !== 'catalog' || !placement.fieldKey) {
              return (
                <div className="flex h-full min-h-16 items-center justify-center rounded-xl border border-border/30 bg-surface-container p-4 text-xs text-on-surface-variant">
                  {placement.label ?? placement.fieldKey ?? placement.source}
                </div>
              );
            }
            const field = specification.fields.find((candidate) => candidate.key === placement.fieldKey);
            if (!field) return null;
            return (
              <DynamicField
                field={field}
                value={sampleData[field.key]}
                required={Boolean(field.required)}
                onChange={(value) => setSampleData((current) => ({ ...current, [field.key]: value }))}
              />
            );
          }}
        />
      </div>
    </div>
  );
}
