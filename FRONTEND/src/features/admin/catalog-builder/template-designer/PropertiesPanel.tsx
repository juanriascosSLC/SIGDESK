import { X } from 'lucide-react';
import type {
  CatalogSpecification,
  ConditionExpression,
  LayoutDocument,
  LayoutSection,
  Placement,
} from '@/features/catalog/metamodel';
import { conditionOperators, defaultConditionValue, parseConditionValue } from '../config';
import { Toggle } from '../ui';
import { widgetLibraryItems } from './library-fields';

export type SelectedElement = { type: 'section'; id: string } | { type: 'placement'; id: string } | null;

export function PropertiesPanel({
  selected,
  document,
  specification,
  onUpdateSection,
  onUpdatePlacement,
  onClose,
}: {
  selected: SelectedElement;
  document: LayoutDocument;
  specification: CatalogSpecification;
  onUpdateSection: (sectionId: string, updater: (section: LayoutSection) => LayoutSection) => void;
  onUpdatePlacement: (placementId: string, updater: (placement: Placement) => Placement) => void;
  onClose: () => void;
}) {
  if (!selected) {
    return (
      <aside className="w-full shrink-0 rounded-2xl border border-dashed border-border/40 p-6 text-center text-xs text-on-surface-variant lg:w-80">
        Selecciona una sección o un campo para ver sus propiedades.
      </aside>
    );
  }

  if (selected.type === 'section') {
    const section = document.sections.find((candidate) => candidate.id === selected.id);
    if (!section) return null;
    return (
      <aside
        data-testid="template-designer-properties-section"
        className="w-full shrink-0 space-y-4 rounded-2xl border border-border/40 bg-surface-container p-4 lg:w-80"
      >
        <Header title="Propiedades de la sección" onClose={onClose} />
        <LabeledInput
          label="Título"
          value={section.title ?? ''}
          onChange={(value) => onUpdateSection(section.id, (current) => ({ ...current, title: value || undefined }))}
        />
        <LabeledTextarea
          label="Descripción"
          value={section.description ?? ''}
          onChange={(value) =>
            onUpdateSection(section.id, (current) => ({ ...current, description: value || undefined }))
          }
        />
        <div>
          <span className="mb-1 block text-xs font-bold text-on-surface-variant">Columnas</span>
          <div className="flex gap-2">
            {[1, 2, 3].map((columns) => (
              <button
                key={columns}
                type="button"
                onClick={() =>
                  onUpdateSection(section.id, (current) => ({ ...current, columns: columns as 1 | 2 | 3 }))
                }
                className={`flex-1 rounded-lg border py-1.5 text-xs font-bold ${
                  section.columns === columns
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border/40 text-on-surface-variant'
                }`}
              >
                {columns}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          checked={Boolean(section.collapsible)}
          onChange={(checked) =>
            onUpdateSection(section.id, (current) => ({ ...current, collapsible: checked || undefined }))
          }
          label="Colapsable"
        />
        <ConditionEditor
          label="Visible solo cuando…"
          condition={section.visibleWhen}
          specification={specification}
          onChange={(condition) =>
            onUpdateSection(section.id, (current) => ({ ...current, visibleWhen: condition }))
          }
        />
      </aside>
    );
  }

  const placement = document.sections
    .flatMap((section) => section.placements)
    .find((candidate) => candidate.id === selected.id);
  if (!placement) return null;
  const field =
    placement.kind === 'field' && placement.source === 'catalog'
      ? specification.fields.find((candidate) => candidate.key === placement.fieldKey)
      : undefined;
  const widgetLabel =
    placement.kind === 'widget'
      ? widgetLibraryItems.find((item) => item.widgetKey === placement.widgetKey)?.label
      : undefined;

  return (
    <aside
      data-testid="template-designer-properties-placement"
      className="w-full shrink-0 space-y-4 rounded-2xl border border-border/40 bg-surface-container p-4 lg:w-80"
    >
      <Header
        title={placement.kind === 'widget' ? widgetLabel ?? 'Propiedades del elemento' : 'Propiedades del campo'}
        onClose={onClose}
      />
      {placement.kind === 'field' && (
        <LabeledInput
          label="Etiqueta"
          value={placement.label ?? ''}
          onChange={(value) => onUpdatePlacement(placement.id, (current) => ({ ...current, label: value || undefined }))}
        />
      )}
      <div>
        <span className="mb-1 block text-xs font-bold text-on-surface-variant">Ancho</span>
        <div className="flex gap-2">
          {[1, 2, 3].map((span) => (
            <button
              key={span}
              type="button"
              onClick={() =>
                onUpdatePlacement(placement.id, (current) => ({ ...current, columnSpan: span as 1 | 2 | 3 }))
              }
              className={`flex-1 rounded-lg border py-1.5 text-xs font-bold ${
                placement.columnSpan === span
                  ? 'border-primary/60 bg-primary/10 text-primary'
                  : 'border-border/40 text-on-surface-variant'
              }`}
            >
              {span}/3
            </button>
          ))}
        </div>
      </div>
      {placement.kind === 'field' && (
        <>
          <Toggle
            checked={Boolean(placement.readOnly)}
            onChange={(checked) =>
              onUpdatePlacement(placement.id, (current) => ({ ...current, readOnly: checked || undefined }))
            }
            label="Solo lectura (presentacional; aún no se aplica en el backend)"
          />
          <ConditionEditor
            label="Visible solo cuando…"
            condition={placement.visibleWhen}
            specification={specification}
            onChange={(condition) =>
              onUpdatePlacement(placement.id, (current) => ({ ...current, visibleWhen: condition }))
            }
          />
          {field?.required && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300">
              Este campo es obligatorio en el esquema; esa regla no se puede relajar desde la colocación.
            </p>
          )}
        </>
      )}
      {placement.kind === 'widget' && (
        <p className="rounded-lg border border-border/30 bg-surface-container-low p-2 text-[11px] text-on-surface-variant">
          Este elemento lo administra su propio módulo; aquí solo controlas su posición y ancho.
        </p>
      )}
    </aside>
  );
}

function ConditionEditor({
  label,
  condition,
  specification,
  onChange,
}: {
  label: string;
  condition: ConditionExpression | undefined;
  specification: CatalogSpecification;
  onChange: (next: ConditionExpression | undefined) => void;
}) {
  const enabled = Boolean(condition);
  const field = specification.fields.find((candidate) => candidate.key === condition?.field) ?? specification.fields[0];
  return (
    <div className="rounded-xl border border-border/40 bg-surface-container-low p-3">
      <Toggle
        checked={enabled}
        onChange={(checked) =>
          onChange(
            checked
              ? { field: field?.key ?? '', operator: 'equals', value: defaultConditionValue(field) }
              : undefined,
          )
        }
        label={label}
      />
      {enabled && condition && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={condition.field ?? ''}
            onChange={(event) => {
              const nextField = specification.fields.find((candidate) => candidate.key === event.target.value);
              onChange({ ...condition, field: event.target.value, value: defaultConditionValue(nextField) });
            }}
            className="rounded-lg border border-border/40 bg-surface-container-high px-2 py-1.5 text-xs text-on-surface"
            style={{ colorScheme: 'dark' }}
          >
            {specification.fields.map((candidate) => (
              <option key={candidate.key} value={candidate.key} className="bg-[#191c22] text-[#e1e2eb]">
                {candidate.label}
              </option>
            ))}
          </select>
          <select
            value={condition.operator ?? 'equals'}
            onChange={(event) =>
              onChange({ ...condition, operator: event.target.value as ConditionExpression['operator'] })
            }
            className="rounded-lg border border-border/40 bg-surface-container-high px-2 py-1.5 text-xs text-on-surface"
            style={{ colorScheme: 'dark' }}
          >
            {conditionOperators.map((operator) => (
              <option key={operator.value} value={operator.value} className="bg-[#191c22] text-[#e1e2eb]">
                {operator.label}
              </option>
            ))}
          </select>
          {condition.operator !== 'exists' && condition.operator !== 'notExists' && (
            <input
              value={String(condition.value ?? '')}
              onChange={(event) =>
                onChange({ ...condition, value: field ? parseConditionValue(field, event.target.value) : event.target.value })
              }
              className="rounded-lg border border-border/40 bg-surface-container-high px-2 py-1.5 text-xs text-on-surface"
              placeholder="Valor"
            />
          )}
        </div>
      )}
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-black text-on-surface">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar propiedades"
        className="text-on-surface-variant hover:text-on-surface"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-on-surface-variant">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-on-surface-variant">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="w-full rounded-lg border border-border/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
      />
    </label>
  );
}
