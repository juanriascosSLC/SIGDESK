import { useState } from 'react';
import { Eye, RotateCcw, Sparkles } from 'lucide-react';
import { bindingIsMultiple } from '@/features/catalog/metamodel';
import type { FieldDefinition } from '@/features/catalog/metamodel';
import { DynamicField } from '@/features/catalog/DynamicField';
import { IconButton } from '../ui';

/**
 * El campo tal como se verá, renderizado con el MISMO componente que dibuja
 * el formulario real (`DynamicField`).
 */
export function FieldPreview({ field }: { field: FieldDefinition }) {
  const [value, setValue] = useState<unknown>(initial(field));

  if (field.bindsTo) {
    return (
      <PreviewFrame onReset={() => setValue(initial(field))}>
        <div className="rounded-xl border border-border/40 bg-surface-container/60 p-4 text-xs text-on-surface-variant leading-relaxed">
          <div className="flex items-center gap-2 text-primary font-semibold mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dynamic Selector for {field.bindsTo === 'agenteItId' ? 'IT Agent' : 'CMDB Asset'}</span>
          </div>
          This field renders with the {field.bindsTo === 'agenteItId' ? 'IT agent' : 'asset'} picker,
          querying live data
          {bindingIsMultiple(field) ? ' and accepting multiple devices, with one marked as primary' : ''}.
          The preview does not query them to avoid environment-dependent results.
        </div>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame onReset={() => setValue(initial(field))}>
      <div className="rounded-xl border border-border/40 bg-surface-container/70 p-4 shadow-inner">
        <DynamicField field={field} value={value} required={field.required} onChange={setValue} />
      </div>
    </PreviewFrame>
  );
}

function PreviewFrame({
  children,
  onReset,
}: {
  children: React.ReactNode;
  onReset: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-surface-container-low to-surface-container-low p-4 transition-all">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <Eye className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-on-surface">Preview</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant">How it will appear to users completing the form.</p>
          </div>
        </div>
        <IconButton label="Reset preview" onClick={onReset}>
          <RotateCcw className="w-4 h-4" />
        </IconButton>
      </div>
      {children}
    </div>
  );
}

function initial(field: FieldDefinition): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'boolean') return false;
  if (field.type === 'multiselect') return [];
  return '';
}
