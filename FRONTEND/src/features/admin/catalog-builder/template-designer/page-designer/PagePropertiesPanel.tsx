import { X } from 'lucide-react';
import type { CatalogSpecification, ConditionExpression, ContentKind, PageLayout, PagePlacement, RegionName } from '@/features/catalog/metamodel';
import { conditionOperators, defaultConditionValue, parseConditionValue } from '../../config';
import { Toggle } from '../../ui';
import { TICKET_WIDGETS } from '@/features/tickets/widgets/TicketWidgetRegistry';
import { findPlacementRegion } from './page-document-ops';
import { ALLOWED_SPANS, type DesignerSpan } from './designer-grid-model';

const REGION_LABELS: Record<RegionName, string> = {
  header: 'Encabezado',
  actions: 'Barra de acciones',
  main: 'Contenido principal',
  sidebar: 'Columna lateral',
  footer: 'Secciones inferiores',
};

const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  section: 'Sección',
  text: 'Texto informativo',
  divider: 'Separador',
  spacer: 'Espacio',
};

export function PagePropertiesPanel({
  page,
  selectedId,
  specification,
  onUpdatePlacement,
  onResizeSpan,
  onClose,
}: {
  page: PageLayout;
  selectedId: string | null;
  specification: CatalogSpecification;
  onUpdatePlacement: (placementId: string, updater: (placement: PagePlacement) => PagePlacement) => void;
  onResizeSpan: (placementId: string, span: DesignerSpan) => void;
  onClose: () => void;
}) {
  if (!selectedId) {
    return (
      <aside className="w-full shrink-0 rounded-2xl border border-dashed border-border/40 p-6 text-center text-xs text-on-surface-variant lg:w-80">
        Selecciona un elemento del canvas para ver sus propiedades.
      </aside>
    );
  }

  const regionName = findPlacementRegion(page, selectedId);
  if (!regionName) return null;
  const placement = page[regionName].placements.find((candidate) => candidate.id === selectedId);
  if (!placement) return null;

  const field =
    placement.kind === 'field' && placement.source === 'catalog'
      ? specification.fields.find((candidate) => candidate.key === placement.fieldKey)
      : undefined;
  const widget = placement.kind === 'widget' && placement.widgetKey ? TICKET_WIDGETS[placement.widgetKey] : undefined;
  const currentSpan = ALLOWED_SPANS.includes(placement.columnSpan as DesignerSpan)
    ? (placement.columnSpan as DesignerSpan)
    : undefined;

  function update(updater: (current: PagePlacement) => PagePlacement) {
    onUpdatePlacement(selectedId!, updater);
  }

  return (
    <aside
      data-testid="page-designer-properties"
      className="w-full shrink-0 space-y-4 rounded-2xl border border-border/40 bg-surface-container p-4 lg:w-80"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-on-surface">
          {widget?.label ?? placement.label ?? field?.label ?? placement.fieldKey ?? 'Propiedades'}
        </h3>
        <button type="button" onClick={onClose} aria-label="Cerrar propiedades" className="text-on-surface-variant hover:text-on-surface">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="rounded-lg border border-border/30 bg-surface-container-low px-3 py-2 text-[11px] text-on-surface-variant">
        Región: <span className="font-bold text-on-surface">{REGION_LABELS[regionName]}</span>
        {placement.locked && ' · Bloqueado (posición limitada a esta región)'}
        {widget && ` · Propiedad de ${widget.ownerModule}`}
      </p>

      {placement.kind === 'field' && (
        <LabeledInput
          label="Etiqueta"
          value={placement.label ?? ''}
          onChange={(value) => update((current) => ({ ...current, label: value || undefined }))}
        />
      )}

      {placement.kind === 'content' && (
        <>
          <div>
            <span className="mb-1 block text-xs font-bold text-on-surface-variant">Tipo</span>
            <p className="text-sm text-on-surface">{CONTENT_KIND_LABELS[placement.contentKind ?? 'text']}</p>
          </div>
          {placement.contentKind === 'section' && (
            <LabeledInput
              label="Título"
              value={placement.title ?? ''}
              onChange={(value) => update((current) => ({ ...current, title: value || undefined }))}
            />
          )}
          {placement.contentKind === 'text' && (
            <LabeledTextarea
              label="Texto"
              value={placement.content ?? ''}
              onChange={(value) => update((current) => ({ ...current, content: value || undefined }))}
            />
          )}
        </>
      )}

      <p className="text-[11px] text-on-surface-variant">
        Arrastra el elemento en el lienzo para moverlo, o usa su tirador lateral para cambiar el ancho.
      </p>

      <details className="rounded-xl border border-border/40 bg-surface-container-low p-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Opciones avanzadas
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-bold text-on-surface-variant">Ancho (columnas de 12)</span>
            <div className="flex flex-wrap gap-1.5">
              {ALLOWED_SPANS.map((span) => (
                <button
                  key={span}
                  type="button"
                  disabled={placement.locked}
                  onClick={() => onResizeSpan(selectedId!, span)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    currentSpan === span
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border/40 bg-surface-container text-on-surface-variant hover:border-primary/40'
                  }`}
                >
                  {span}
                </button>
              ))}
            </div>
          </div>
          <NumberInput
            label="Alto en filas"
            value={placement.rowSpan ?? 1}
            min={1}
            onChange={(value) => update((current) => ({ ...current, rowSpan: value }))}
          />
          <NumberInput
            label="Orden en móvil (opcional)"
            value={placement.mobileOrder ?? ''}
            min={0}
            onChange={(value) => update((current) => ({ ...current, mobileOrder: value }))}
            onClear={() => update((current) => ({ ...current, mobileOrder: undefined }))}
          />
        </div>
      </details>

      {placement.kind === 'field' && (
        <Toggle
          checked={Boolean(placement.readOnly)}
          onChange={(checked) => update((current) => ({ ...current, readOnly: checked || undefined }))}
          label="Solo lectura (presentacional; aún no se aplica en el backend)"
        />
      )}

      <ConditionEditor
        label="Visible solo cuando…"
        condition={placement.visibleWhen}
        specification={specification}
        onChange={(condition) => update((current) => ({ ...current, visibleWhen: condition }))}
      />

      {field?.required && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300">
          Este campo es obligatorio en el esquema; esa regla no se puede relajar desde la colocación.
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
            onChange={(event) => onChange({ ...condition, operator: event.target.value as ConditionExpression['operator'] })}
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

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-on-surface-variant">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-lg border border-border/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
  onClear,
}: {
  label: string;
  value: number | '';
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onClear?: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-on-surface-variant">{label}</span>
      <div className="flex gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            if (event.target.value === '' && onClear) {
              onClear();
              return;
            }
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          className="w-full rounded-lg border border-border/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
        />
      </div>
    </label>
  );
}
