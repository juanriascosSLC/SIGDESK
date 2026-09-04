import { GitBranch, Sparkles } from 'lucide-react';
import type { FieldDefinition } from '@/features/catalog/metamodel';
import { ConditionRule } from './ConditionEditor';

export function ConditionalRulesEditor({
  field,
  fields,
  onChange,
}: {
  field: FieldDefinition;
  fields: FieldDefinition[];
  onChange: (changes: Partial<FieldDefinition>) => void;
}) {
  const sources = fields.filter((candidate) => candidate.key !== field.key);
  if (sources.length === 0) return null;
  const hasActiveCondition = Boolean(field.visibleWhen || field.requiredWhen);

  return (
    <div className="mt-5 rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-surface-container-low to-surface-container-low p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-violet-500/20 text-violet-300 flex items-center justify-center shrink-0 mt-0.5">
            <GitBranch className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-on-surface">Conditional behavior</p>
              {hasActiveCondition && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300 border border-violet-500/30">
                  <Sparkles className="w-2.5 h-2.5" /> Active rules
                </span>
              )}
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Changes the visibility or requirement of this field based on another field's value.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <ConditionRule
          testId={`catalog-condition-visible-${field.key}`}
          label="Show only when"
          emptyLabel="Always visible"
          condition={field.visibleWhen}
          sources={sources}
          onChange={(visibleWhen) => onChange({ visibleWhen })}
        />
        <ConditionRule
          testId={`catalog-condition-required-${field.key}`}
          label="Make required when"
          emptyLabel={field.required ? 'Already required by default' : 'Do not add conditional requirement'}
          condition={field.requiredWhen}
          sources={sources}
          disabled={field.required}
          onChange={(requiredWhen) => onChange({ requiredWhen })}
        />
      </div>
    </div>
  );
}
