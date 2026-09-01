import { useState } from 'react';
import { HelpCircle, ShieldCheck, Sparkles } from 'lucide-react';
import type { FieldDefinition } from '@/features/catalog/metamodel';
import { bindingIsMultiple, fieldTypeIsText } from '@/features/catalog/metamodel';
import { textFormatOptions } from '../config';
import { FriendlyField, Toggle } from '../ui';

const selectClasses = 'friendly-input bg-[#1d2026] text-[#e1e2eb]';

const PATTERN_PRESETS = [
  { label: 'Código (ABC-123)', pattern: '^[A-Z]{3}-[0-9]{3}$', message: 'Usa el formato ABC-123' },
  { label: 'Alfanumérico', pattern: '^[a-zA-Z0-9_-]+$', message: 'Solo letras, números, guiones y subguiones' },
  { label: 'Solo letras', pattern: '^[a-zA-ZáéíóúÁÉÍÓÚñÑ ]+$', message: 'Solo caracteres alfabéticos y espacios' },
  { label: 'Solo dígitos', pattern: '^[0-9]+$', message: 'Solo números' },
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
          className={`friendly-input ${selectClasses} disabled:opacity-40 bg-surface-container-low`}
          style={{ colorScheme: 'dark' }}
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
          Hoy
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
            <span className="text-sm font-bold text-on-surface">Reglas y validaciones</span>
            <p className="text-[11px] text-on-surface-variant">
              Se comprueban en el servidor, no solo en el navegador.
            </p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl bg-surface-container/60 border border-border/30">
        <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-border/40">
          <div>
            <span className="text-xs font-bold text-on-surface block">Campo Obligatorio</span>
            <span className="text-[11px] text-on-surface-variant">Exigido antes de guardar o avanzar</span>
          </div>
          <Toggle
            checked={field.required}
            onChange={(checked) => onChange({ required: checked })}
            label="Obligatorio"
          />
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-border/40">
          <div>
            <span className="text-xs font-bold text-on-surface block">Solo Lectura</span>
            <span className="text-[11px] text-on-surface-variant">Visible pero no modificable por el usuario</span>
          </div>
          <Toggle
            checked={Boolean(field.readOnly)}
            onChange={(checked) => onChange({ readOnly: checked || undefined })}
            label="Solo lectura"
          />
        </div>
      </div>

      {field.readOnly && (
        <p className="mt-2 text-[11px] text-on-surface-variant px-1">
          Se muestra pero no se puede editar. Es presentación: no impide que el valor llegue por API.
        </p>
      )}

      {isText && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <NumberInput
            label="Mínimo de caracteres"
            value={field.minLength}
            min={0}
            onChange={(value) => onChange({ minLength: value })}
          />
          <NumberInput
            label="Máximo de caracteres"
            value={field.maxLength}
            min={1}
            onChange={(value) => onChange({ maxLength: value })}
          />
        </div>
      )}

      {isText && !namedFormat && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <FriendlyField
            label="Formato exigido"
            help="Para exigirlo sobre un campo de texto que ya está publicado, sin cambiarle el tipo."
          >
            <select
              data-testid={`catalog-field-format-${field.key}`}
              value={field.format ?? ''}
              onChange={(event) =>
                onChange({ format: (event.target.value || undefined) as FieldDefinition['format'] })
              }
              className={`${selectClasses} bg-surface-container-low`}
              style={{ colorScheme: 'dark' }}
            >
              {textFormatOptions.map((option) => (
                <option key={option.value || 'none'} value={option.value} className="bg-[#191c22] text-[#e1e2eb]">
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
          El tipo ya exige su formato: no hace falta declararlo aparte.
        </p>
      )}

      {isText && (
        <div className="mt-4 p-3 rounded-xl bg-surface-container/60 border border-border/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-on-surface">Validación por Expresión Regular</span>
            <button
              type="button"
              onClick={() => setShowPatternPresets((current) => !current)}
              className="text-[11px] font-semibold text-primary hover:text-primary-foreground hover:bg-primary px-2 py-1 rounded-md border border-primary/30 bg-primary/5 transition-colors flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> Patrones comunes
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
              label="Patrón propio"
              help="Expresión regular. Si no compila, el servidor la ignora en vez de bloquear el registro."
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
              label="Mensaje si no coincide"
              help="Sin esto, el navegador dice «coincide con el formato solicitado», que no explica nada."
            >
              <input
                value={field.patternMessage ?? ''}
                onChange={(event) => onChange({ patternMessage: event.target.value || undefined })}
                placeholder="Usa el formato ABC-123"
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
            label="Valor mínimo"
            value={field.min}
            onChange={(value) => onChange({ min: value })}
          />
          <NumberInput
            label="Valor máximo"
            value={field.max}
            onChange={(value) => onChange({ max: value })}
          />
          <NumberInput
            label="Incremento"
            help="Con un paso entero el servidor rechaza fracciones."
            value={field.step}
            min={0}
            onChange={(value) => onChange({ step: value })}
          />
        </div>
      )}

      {(field.type === 'date' || field.type === 'datetime') && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <DateLimitInput
            label="No antes de"
            help="«Hoy» no caduca; una fecha fija sí."
            value={field.minDate}
            onChange={(value) => onChange({ minDate: value })}
          />
          <DateLimitInput
            label="No después de"
            value={field.maxDate}
            onChange={(value) => onChange({ maxDate: value })}
          />
        </div>
      )}

      {(field.type === 'multiselect' || bindingIsMultiple(field)) && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <NumberInput
            label={bindingIsMultiple(field) ? 'Mínimo de dispositivos' : 'Mínimo de opciones'}
            value={field.minItems}
            min={0}
            onChange={(value) => onChange({ minItems: value })}
          />
          <NumberInput
            label={bindingIsMultiple(field) ? 'Máximo de dispositivos' : 'Máximo de opciones'}
            value={field.maxItems}
            min={bindingIsMultiple(field) ? 2 : 1}
            onChange={(value) => onChange({ maxItems: value })}
          />
        </div>
      )}
    </div>
  );
}
