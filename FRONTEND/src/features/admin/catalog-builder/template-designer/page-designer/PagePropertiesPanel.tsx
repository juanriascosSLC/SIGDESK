import {
  ArrowDown,
  ArrowUp,
  Copy,
  Lock,
  MoveLeft,
  MoveRight,
  PanelsTopLeft,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CatalogSpecification,
  PageLayout,
  PagePlacement,
  RegionName,
} from '@/features/catalog/metamodel';
import { Toggle } from '../../ui';
import { ConditionRule } from '../../ConditionEditor';
import { findPlacementRegion } from './page-document-ops';
import { ALLOWED_SPANS, type DesignerSpan } from './designer-grid-model';
import { canDuplicatePlacement, placementAllowedInRegion, placementLabel } from './designer-actions';
import { REGION_ORDER } from './region-meta';
import type { AnyPageSurface } from './surface';
import { placementIcon } from './page-library';

export interface SelectionNeighbours {
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

// "3, 4, 6, 8, 9, 12" is the grid's language, not the admin's. The fractions
// are what someone actually pictures when they decide how wide a card is; the
// raw column count stays visible underneath for anyone reasoning in the
// 12-column grid the metamodel stores.
const SPAN_LABELS: Record<DesignerSpan, string> = {
  3: 'One quarter',
  4: 'One third',
  6: 'Half',
  8: 'Two thirds',
  9: 'Three quarters',
  12: 'Full width',
};

const SIDEBAR_OPTIONS = [3, 4, 5] as const;

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <aside
      data-testid="page-designer-properties"
      className="w-full shrink-0 @6xl:sticky @6xl:top-4 @6xl:w-72 @6xl:self-start"
    >
      <div className="max-h-[32rem] space-y-4 overflow-y-auto rounded-2xl border border-border/40 bg-surface-container p-3.5 @6xl:max-h-[calc(100vh-5rem)]">
        {children}
      </div>
    </aside>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{children}</span>;
}

export function PagePropertiesPanel({
  surface,
  page,
  selectedId,
  specification,
  neighbours,
  onUpdatePlacement,
  onResizeSpan,
  onMove,
  onMoveToRegion,
  onDuplicate,
  onRemove,
  onSidebarColumnsChange,
  onClose,
}: {
  surface: AnyPageSurface;
  page: PageLayout;
  selectedId: string | null;
  specification: CatalogSpecification;
  neighbours: SelectionNeighbours;
  onUpdatePlacement: (placementId: string, updater: (placement: PagePlacement) => PagePlacement) => void;
  onResizeSpan: (placementId: string, span: DesignerSpan) => void;
  onMove: (placementId: string, direction: 'left' | 'right' | 'up' | 'down') => void;
  onMoveToRegion: (placementId: string, region: RegionName) => void;
  onDuplicate: (placementId: string) => void;
  onRemove: (placementId: string) => void;
  onSidebarColumnsChange: (value: number) => void;
  onClose: () => void;
}) {
  const placement = selectedId
    ? (() => {
        const regionName = findPlacementRegion(page, selectedId);
        return regionName ? page[regionName].placements.find((candidate) => candidate.id === selectedId) : undefined;
      })()
    : undefined;
  const regionName = selectedId ? findPlacementRegion(page, selectedId) : null;

  // Nothing selected is not dead space: it is where the page-wide decisions
  // live. The panel used to render a single grey sentence there while the
  // sidebar-width control sat in the toolbar, far from anything it affected.
  if (!placement || !regionName || !selectedId) {
    return (
      <PanelShell>
        <PageSettings surface={surface} page={page} onSidebarColumnsChange={onSidebarColumnsChange} />
      </PanelShell>
    );
  }

  const field =
    placement.kind === 'field' && placement.source === 'catalog'
      ? specification.fields.find((candidate) => candidate.key === placement.fieldKey)
      : undefined;
  const widget = placement.kind === 'widget' && placement.widgetKey ? surface.widgets[placement.widgetKey] : undefined;
  const currentSpan = ALLOWED_SPANS.includes(placement.columnSpan as DesignerSpan)
    ? (placement.columnSpan as DesignerSpan)
    : undefined;
  const locked = Boolean(placement.locked);
  // Held on an object rather than in a bare capitalized const: the icon comes
  // from the same lookup the palette and canvas use, and `visual.icon` reads
  // as the data access it is instead of a component defined during render.
  const visual = { icon: placementIcon(surface, placement, specification) };
  const kindLabel =
    placement.kind === 'widget'
      ? 'Widget'
      : placement.kind === 'content'
        ? 'Structural element'
        : placement.source === 'catalog'
          ? 'Entity field'
          : 'System field';

  function update(updater: (current: PagePlacement) => PagePlacement) {
    onUpdatePlacement(selectedId!, updater);
  }

  const targetRegions = REGION_ORDER.filter(
    (candidate) =>
      candidate !== regionName &&
      !surface.regionMeta[candidate].fixed &&
      placementAllowedInRegion(surface, placement, candidate),
  );

  return (
    <PanelShell>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <visual.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-on-surface">
              {placementLabel(surface, placement, specification)}
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{kindLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close properties"
          className="shrink-0 rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {locked && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-4 text-amber-200">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          Fixed element of "{surface.regionMeta[regionName].label}". Cannot be moved, resized, or removed.
        </p>
      )}

      {widget && (
        <p className="rounded-lg border border-border/30 bg-surface-container-low px-3 py-2 text-[11px] leading-4 text-on-surface-variant">
          Maintained by the <span className="font-bold text-on-surface">{widget.ownerModule}</span> module.
        </p>
      )}

      {/* Position ------------------------------------------------------- */}
      <section className="space-y-2">
        <FieldLabel>Location</FieldLabel>
        <div className="rounded-xl border border-border/40 bg-surface-container-low p-3">
          <p className="text-xs font-bold text-on-surface">{surface.regionMeta[regionName].label}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-on-surface-variant">{surface.regionMeta[regionName].description}</p>

          {!locked && targetRegions.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80">Move to</p>
              <div className="flex flex-wrap gap-1.5">
                {targetRegions.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => onMoveToRegion(selectedId, candidate)}
                    className="rounded-lg border border-border/40 bg-surface-container px-2 py-1 text-[11px] font-bold text-on-surface-variant transition-colors hover:border-primary/60 hover:text-primary"
                  >
                    {surface.regionMeta[candidate].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!locked && (
            <div className="mt-2.5 flex items-center gap-1.5">
              <NudgeButton label="Move left" disabled={!neighbours.canMoveLeft} onClick={() => onMove(selectedId, 'left')}>
                <MoveLeft className="h-3.5 w-3.5" />
              </NudgeButton>
              <NudgeButton label="Move right" disabled={!neighbours.canMoveRight} onClick={() => onMove(selectedId, 'right')}>
                <MoveRight className="h-3.5 w-3.5" />
              </NudgeButton>
              <span className="mx-1 h-4 w-px bg-border/50" />
              <NudgeButton label="Move row up" disabled={!neighbours.canMoveUp} onClick={() => onMove(selectedId, 'up')}>
                <ArrowUp className="h-3.5 w-3.5" />
              </NudgeButton>
              <NudgeButton label="Move row down" disabled={!neighbours.canMoveDown} onClick={() => onMove(selectedId, 'down')}>
                <ArrowDown className="h-3.5 w-3.5" />
              </NudgeButton>
            </div>
          )}
        </div>
      </section>

      {/* Width ---------------------------------------------------------- */}
      {!locked && (
        <section>
          <FieldLabel>Width</FieldLabel>
          <div className="rounded-xl border border-border/40 bg-surface-container-low p-3">
            <div aria-hidden className="mb-2.5 flex gap-0.5">
              {Array.from({ length: 12 }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 flex-1 rounded-full ${
                    index < (currentSpan ?? placement.columnSpan) ? 'bg-primary' : 'bg-surface-container-highest'
                  }`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALLOWED_SPANS.map((span) => (
                <button
                  key={span}
                  type="button"
                  onClick={() => onResizeSpan(selectedId, span)}
                  aria-pressed={currentSpan === span}
                  className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                    currentSpan === span
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border/40 bg-surface-container text-on-surface-variant hover:border-primary/40'
                  }`}
                >
                  <span className="block text-[11px] font-bold leading-4">{SPAN_LABELS[span]}</span>
                  <span className="block font-mono text-[9px] opacity-70">{span}/12</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Kind-specific -------------------------------------------------- */}
      {placement.kind === 'field' && (
        <LabeledInput
          label="Label"
          value={placement.label ?? ''}
          placeholder={placementLabel(surface, { ...placement, label: undefined }, specification)}
          onChange={(value) => update((current) => ({ ...current, label: value || undefined }))}
        />
      )}

      {placement.kind === 'content' && placement.contentKind === 'section' && (
        <LabeledInput
          label="Title"
          value={placement.title ?? ''}
          placeholder="e.g. Diagnosis"
          onChange={(value) => update((current) => ({ ...current, title: value || undefined }))}
        />
      )}

      {placement.kind === 'content' && placement.contentKind === 'text' && (
        <LabeledTextarea
          label="Text"
          value={placement.content ?? ''}
          placeholder="A fixed note visible to whoever opens the ticket"
          onChange={(value) => update((current) => ({ ...current, content: value || undefined }))}
        />
      )}

      {placement.kind === 'field' && (
        <Toggle
          checked={Boolean(placement.readOnly)}
          onChange={(checked) => update((current) => ({ ...current, readOnly: checked || undefined }))}
          label="Read-only (presentational; not enforced by backend yet)"
        />
      )}

      <ConditionRule
        label="Show only when…"
        compact
        condition={placement.visibleWhen}
        sources={specification.fields}
        onChange={(condition) => update((current) => ({ ...current, visibleWhen: condition }))}
      />

      {field?.required && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] leading-4 text-amber-300">
          This field is required in the schema; that rule cannot be relaxed from placement.
        </p>
      )}

      {!locked && (
        <details className="rounded-xl border border-border/40 bg-surface-container-low p-3">
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
            Advanced options
          </summary>
          <div className="mt-3 space-y-3">
            <NumberInput
              label="Height in rows"
              value={placement.rowSpan ?? 1}
              min={1}
              onChange={(value) => update((current) => ({ ...current, rowSpan: value }))}
            />
            <NumberInput
              label="Mobile order (optional)"
              value={placement.mobileOrder ?? ''}
              min={0}
              onChange={(value) => update((current) => ({ ...current, mobileOrder: value }))}
              onClear={() => update((current) => ({ ...current, mobileOrder: undefined }))}
            />
          </div>
        </details>
      )}

      {!locked && (
        <div className="flex gap-2 border-t border-border/40 pt-3">
          {canDuplicatePlacement(surface, placement) && (
            <button
              type="button"
              onClick={() => onDuplicate(selectedId)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 px-2 py-2 text-[11px] font-bold text-on-surface-variant hover:border-primary/50 hover:text-on-surface"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(selectedId)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-2 py-2 text-[11px] font-bold text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      )}
    </PanelShell>
  );
}

function NudgeButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-border/40 bg-surface-container p-1.5 text-on-surface-variant transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:border-border/40 disabled:hover:text-on-surface-variant"
    >
      {children}
    </button>
  );
}

function PageSettings({
  surface,
  page,
  onSidebarColumnsChange,
}: {
  surface: AnyPageSurface;
  page: PageLayout;
  onSidebarColumnsChange: (value: number) => void;
}) {
  const sidebar = page.sidebarColumns || 4;
  return (
    <>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <PanelsTopLeft className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-black text-on-surface">Page settings</h3>
          <p className="text-[11px] leading-4 text-on-surface-variant">
            Select an element on the canvas to edit it.
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <FieldLabel>Column layout</FieldLabel>
        <div className="space-y-2 rounded-xl border border-border/40 bg-surface-container-low p-3">
          <div aria-hidden className="flex h-9 gap-1.5">
            <div
              className="flex items-center justify-center rounded-lg bg-primary/20 text-[9px] font-black uppercase tracking-wider text-primary"
              style={{ flexGrow: 12 - sidebar, flexBasis: 0 }}
            >
              Main
            </div>
            <div
              className="flex items-center justify-center rounded-lg bg-surface-container-highest text-[9px] font-black uppercase tracking-wider text-on-surface-variant"
              style={{ flexGrow: sidebar, flexBasis: 0 }}
            >
              Sidebar
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {SIDEBAR_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSidebarColumnsChange(value)}
                aria-pressed={sidebar === value}
                data-testid={`page-designer-sidebar-${value}`}
                className={`rounded-lg border px-2 py-1.5 text-center transition-colors ${
                  sidebar === value
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border/40 bg-surface-container text-on-surface-variant hover:border-primary/40'
                }`}
              >
                <span className="block text-[11px] font-bold">{value === 3 ? 'Narrow' : value === 4 ? 'Medium' : 'Wide'}</span>
                <span className="block font-mono text-[9px] opacity-70">{value}/12</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <FieldLabel>Page regions</FieldLabel>
        <ul className="space-y-1.5">
          {REGION_ORDER.map((region) => {
            const meta = surface.regionMeta[region];
            const RegionIcon = meta.icon;
            return (
              <li
                key={region}
                className="flex items-center gap-2 rounded-lg border border-border/30 bg-surface-container-low px-2.5 py-2"
              >
                <RegionIcon className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-on-surface">{meta.label}</span>
                  <span className="block truncate text-[10px] text-on-surface-variant/80">
                    {page[region].placements.length} element{page[region].placements.length === 1 ? '' : 's'}
                  </span>
                </span>
                {meta.fixed && (
                  <span title="Fixed region" className="shrink-0 text-on-surface-variant/70">
                    <Lock className="h-3 w-3" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="rounded-xl border border-border/30 bg-surface-container-low p-3 text-[11px] leading-4 text-on-surface-variant">
        Shortcuts: <span className="font-mono font-bold text-on-surface">Ctrl+Z</span> undo ·{' '}
        <span className="font-mono font-bold text-on-surface">Ctrl+Shift+Z</span> redo ·{' '}
        <span className="font-mono font-bold text-on-surface">Del</span> remove selected ·{' '}
        <span className="font-mono font-bold text-on-surface">Esc</span> deselect.
      </p>
    </>
  );
}

function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-lg border border-border/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50"
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
      <FieldLabel>{label}</FieldLabel>
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
    </label>
  );
}
