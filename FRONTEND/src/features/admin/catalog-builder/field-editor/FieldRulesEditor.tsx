import { useState } from 'react';
import { HelpCircle, ShieldCheck, Sparkles } from 'lucide-react';
import type { FieldDefinition } from '@/features/catalog/metamodel';
import { bindingIsMultiple, fieldTypeIsText } from '@/features/catalog/metamodel';
import { textFormatOptions } from '../config';
import { FriendlyField, Toggle } from '../ui';

const PATTERN_PRESETS = [
  { label: 'Code (ABC-123)', pattern: '^[A-Z]{3}-[0-9]{3}$', message: 'Use the ABC-123 format' },
  { label: 'Alphanumeric', pattern: '^[a-zA-Z0-9_-]+$', message: 'Only letters, numbers, hyphens and underscores' },
  { label: 'Letters only', pattern: '^[a-zA-Z ]+$', message: 'Only alphabetic characters and spaces' },
  { label: 'Digits only', pattern: '^[0-9]+$', message: 'Only numbers' },
];

function NumberInput({
  label,
  help,
  value,
  min,
  onChange,
}: {
  label: string;
  help?: string;
  value: number | undefined;
  min?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <FriendlyField label={label} help={help}>
      <input
        type="number"
        min={min}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        className="friendly-input bg-surface-container-low"
      />
    </FriendlyField>
  );
}

function DateLimitInput({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const isToday = (value ?? '').toLowerCase() === 'today';
  return (
    <FriendlyField label={label} help={help}>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={isToday ? '' : (value ?? '')}
          disabled={isToday}
          onChange={(event) => onChange(event.target.value || undefined)}
          className="friendly-input disabled:opacity-40 bg-surface-container-low"
        />
        <button
          type="button"
          aria-pressed={isToday}
          onClick={() => onChange(isToday ? undefined : 'today')}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            isToday
              ? 'bg-primary/20 text-primary border border-primary/50 shadow-sm'
              : 'text-on-surface-variant border border-border/50 hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >
          Today
        </button>
      </div>
    </FriendlyField>
  );
}

export function FieldRulesEditor({
  field,
  onChange,
}: {
  field: FieldDefinition;
  onChange: (changes: Partial<FieldDefinition>) => void;
}) {
  const isText = fieldTypeIsText(field.type);
  const namedFormat = field.type === 'email' || field.type === 'phone' || field.type === 'url';
  const [showPatternPresets, setShowPatternPresets] = useState(false);

  return (
    <div className="mt-5 rounded-2xl border border-border/40 bg-surface-container-low p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-sm font-bold text-on-surface">Rules & Validations</span>
            <p className="text-[11px] text-on-surface-variant">
              Enforced on the server, not just in the browser.
            </p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl bg-surface-container/60 border border-border/30">
        <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-border/40">
          <div>
            <span className="text-xs font-bold text-on-surface block">Required Field</span>
            <span className="text-[11px] text-on-surface-variant">Required before saving or proceeding</span>
          </div>
          <Toggle
            checked={field.required}
            onChange={(checked) => onChange({ required: checked })}
            label="Required"
          />
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-border/40">
          <div>
            <span className="text-xs font-bold text-on-surface block">Read-Only</span>
            <span className="text-[11px] text-on-surface-variant">Visible but cannot be edited by users</span>
          </div>
          <Toggle
            checked={Boolean(field.readOnly)}
            onChange={(checked) => onChange({ readOnly: checked || undefined })}
            label="Read-only"
          />
        </div>
      </div>

      {field.readOnly && (
        <p className="mt-2 text-[11px] text-on-surface-variant px-1">
          Displayed but cannot be edited. This is presentational: it does not prevent values sent via API.
        </p>
      )}

      {isText && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <NumberInput
            label="Minimum characters"
            value={field.minLength}
            min={0}
            onChange={(value) => onChange({ minLength: value })}
          />
          <NumberInput
            label="Maximum characters"
            value={field.maxLength}
            min={1}
            onChange={(value) => onChange({ maxLength: value })}
          />
        </div>
      )}

      {isText && !namedFormat && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <FriendlyField
            label="Required format"
            help="To enforce on an already published text field without changing its type."
          >
            <select
              data-testid={`catalog-field-format-${field.key}`}
              value={field.format ?? ''}
              onChange={(event) =>
                onChange({ format: (event.target.value || undefined) as FieldDefinition['format'] })
              }
              className="friendly-input bg-surface-container-low"
            >
              {textFormatOptions.map((option) => (
                <option key={option.value || 'none'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FriendlyField>
        </div>
      )}

      {namedFormat && (
        <p className="mt-4 rounded-xl border border-border/40 bg-surface-container p-3 text-[11px] text-on-surface-variant flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0" />
          The type already implies its format: no need to specify it separately.
        </p>
      )}

      {isText && (
        <div className="mt-4 p-3 rounded-xl bg-surface-container/60 border border-border/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-on-surface">Regular Expression Validation</span>
            <button
              type="button"
              onClick={() => setShowPatternPresets((current) => !current)}
              className="text-[11px] font-semibold text-primary hover:text-primary-foreground hover:bg-primary px-2 py-1 rounded-md border border-primary/30 bg-primary/5 transition-colors flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> Common patterns
            </button>
          </div>

          {showPatternPresets && (
            <div className="mb-3 p-2.5 rounded-lg bg-surface-container-low border border-border/50 flex flex-wrap gap-1.5 animate-in fade-in duration-150">
              {PATTERN_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange({ pattern: preset.pattern, patternMessage: preset.message });
                    setShowPatternPresets(false);
                  }}
                  className="text-xs px-2.5 py-1 rounded bg-surface-container hover:bg-primary/20 hover:text-primary text-on-surface border border-border/40 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <FriendlyField
              label="Custom pattern"
              help="Regular expression. If invalid, the server ignores it instead of blocking the record."
            >
              <input
                data-testid={`catalog-field-pattern-${field.key}`}
                value={field.pattern ?? ''}
                onChange={(event) => onChange({ pattern: event.target.value || undefined })}
                placeholder="^[A-Z]{3}-[0-9]{3}$"
                className="friendly-input font-mono text-xs bg-surface-container-low"
              />
            </FriendlyField>
            <FriendlyField
              label="Mismatch message"
              help="Without this, the browser shows a generic error message that provides no explanation."
            >
              <input
                value={field.patternMessage ?? ''}
                onChange={(event) => onChange({ patternMessage: event.target.value || undefined })}
                placeholder="Use the ABC-123 format"
                className="friendly-input bg-surface-container-low disabled:opacity-50"
                disabled={!field.pattern}
              />
            </FriendlyField>
          </div>
        </div>
      )}

      {field.type === 'number' && (
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <NumberInput
            label="Minimum value"
            value={field.min}
            onChange={(value) => onChange({ min: value })}
          />
          <NumberInput
            label="Maximum value"
            value={field.max}
            onChange={(value) => onChange({ max: value })}
          />
          <NumberInput
            label="Step"
            help="With an integer step, the server rejects decimal values."
            value={field.step}
            min={0}
            onChange={(value) => onChange({ step: value })}
          />
        </div>
      )}

      {(field.type === 'date' || field.type === 'datetime') && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <DateLimitInput
            label="Not before"
            help="«Today» does not expire; a fixed date does."
            value={field.minDate}
            onChange={(value) => onChange({ minDate: value })}
          />
          <DateLimitInput
            label="Not after"
            value={field.maxDate}
            onChange={(value) => onChange({ maxDate: value })}
          />
        </div>
      )}

      {(field.type === 'multiselect' || bindingIsMultiple(field)) && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <NumberInput
            label={bindingIsMultiple(field) ? 'Minimum devices' : 'Minimum options'}
            value={field.minItems}
            min={0}
            onChange={(value) => onChange({ minItems: value })}
          />
          <NumberInput
            label={bindingIsMultiple(field) ? 'Maximum devices' : 'Maximum options'}
            value={field.maxItems}
            min={bindingIsMultiple(field) ? 2 : 1}
            onChange={(value) => onChange({ maxItems: value })}
          />
        </div>
      )}
    </div>
  );
}
