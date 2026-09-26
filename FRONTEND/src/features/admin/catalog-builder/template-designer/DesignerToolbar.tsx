import { Eye, Redo2, Trash2, Undo2 } from 'lucide-react';
import type { AudienceKey, LayoutKind } from '@/features/catalog/metamodel';

const KIND_LABELS: Record<LayoutKind, string> = { create: 'Create', edit: 'Edit', detail: 'Detail' };
const AUDIENCE_LABELS: Record<AudienceKey, string> = {
  requester: 'Requester',
  agent: 'Agent',
  supervisor: 'Supervisor',
};
const ALL_AUDIENCES: AudienceKey[] = ['requester', 'agent', 'supervisor'];

export function DesignerToolbar({
  activeKind,
  onChangeKind,
  activeVariantKey,
  availableVariantKeys,
  onChangeVariant,
  onAddVariant,
  onRemoveVariant,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPreview,
}: {
  activeKind: LayoutKind;
  onChangeKind: (kind: LayoutKind) => void;
  activeVariantKey: AudienceKey | null;
  availableVariantKeys: AudienceKey[];
  onChangeVariant: (audience: AudienceKey | null) => void;
  onAddVariant: (audience: AudienceKey) => void;
  onRemoveVariant: (audience: AudienceKey) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
}) {
  const creatableAudiences = ALL_AUDIENCES.filter((audience) => !availableVariantKeys.includes(audience));

  return (
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
        <select
          value={activeVariantKey ?? ''}
          onChange={(event) => onChangeVariant(event.target.value ? (event.target.value as AudienceKey) : null)}
          data-testid="template-designer-audience"
          className="rounded-lg border border-border/40 bg-surface-container-low px-2 py-1.5 text-xs font-bold text-on-surface"
        >
          <option value="">
            Default
          </option>
          {availableVariantKeys.map((audience) => (
            <option key={audience} value={audience}>
              {AUDIENCE_LABELS[audience]}
            </option>
          ))}
        </select>
        {creatableAudiences.length > 0 && (
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) onAddVariant(event.target.value as AudienceKey);
            }}
            data-testid="template-designer-add-audience"
            className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-xs font-bold text-primary"
          >
            <option value="">
              + Audience variant…
            </option>
            {creatableAudiences.map((audience) => (
              <option key={audience} value={audience}>
                {AUDIENCE_LABELS[audience]}
              </option>
            ))}
          </select>
        )}
        {activeVariantKey && (
          <button
            type="button"
            onClick={() => onRemoveVariant(activeVariantKey)}
            data-testid="template-designer-remove-audience"
            title={`Delete ${AUDIENCE_LABELS[activeVariantKey]} variant`}
            aria-label={`Delete ${AUDIENCE_LABELS[activeVariantKey]} variant`}
            className="rounded-lg border border-red-500/30 p-2 text-red-600 dark:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onPreview}
          data-testid="template-designer-preview-button"
          className="ml-2 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20"
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
      </div>
    </div>
  );
}
