import { useEffect, useRef } from 'react';
import { fieldDisplayLabel, type FieldDefinition, type FieldType } from './metamodel';

function datetimeLocalValue(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * `today` se resuelve acá SOLO para el atributo HTML, que es una ayuda de
 * captura. La regla la decide el servidor con su propio reloj
 * (limiteFechaCatalogo en validar_datos_catalogo.go): si el navegador fuera la
 * autoridad, el reloj del cliente decidiría qué es "el pasado".
 */
function dateLimitAttribute(limit: string | undefined, type: FieldType): string | undefined {
  if (!limit) return undefined;
  const raw = limit.trim();
  if (!raw) return undefined;
  const date = raw.toLowerCase() === 'today' ? new Date() : new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return type === 'datetime' ? local.toISOString().slice(0, 16) : local.toISOString().slice(0, 10);
}

const HTML_INPUT_TYPE: Partial<Record<FieldType, string>> = {
  number: 'number',
  date: 'date',
  datetime: 'datetime-local',
  email: 'email',
  phone: 'tel',
  url: 'url',
};

/** Los formatos con nombre viajan como atributo `pattern` para que el
 *  navegador avise antes del viaje al servidor. El servidor los revalida. */
const FORMAT_PATTERN: Record<string, string> = {
  email: '[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+',
  url: 'https?://\\S+',
  phone: '\\+?[0-9][0-9\\s().-]{5,}',
};

function selectedValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

export function DynamicField({
  field,
  value,
  required,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  required: boolean;
  onChange: (value: unknown) => void;
}) {
  const classes =
    'w-full bg-surface-container border border-border/50 text-on-surface rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 disabled:opacity-60 disabled:cursor-not-allowed';
  const displayLabel = fieldDisplayLabel(field);
  const label = (
    <span className="block text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">
      {displayLabel} {required && <span className="text-status-danger-fg">*</span>}
    </span>
  );
  // La ayuda va DEBAJO del control y se queda: el placeholder desaparece en
  // cuanto la persona escribe, justo cuando más falta hace la instrucción.
  const help = field.helpText ? (
    <span
      data-testid={`catalog-help-${field.key}`}
      className="mt-2 block text-xs leading-5 text-on-surface-variant"
    >
      {field.helpText}
    </span>
  ) : null;

  if (field.type === 'multiselect') {
    return (
      <MultiSelectField
        field={field}
        value={value}
        required={required}
        onChange={onChange}
        label={label}
        help={help}
      />
    );
  }

  if (field.type === 'radio') {
    const current = String(value ?? '');
    return (
      <fieldset data-testid={`catalog-input-${field.key}`} disabled={field.readOnly}>
        <legend className="block text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">
          {displayLabel} {required && <span className="text-status-danger-fg">*</span>}
        </legend>
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface-container px-4 py-3 cursor-pointer has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name={`catalog-radio-${field.key}`}
                value={option.value}
                checked={current === option.value}
                required={required}
                disabled={field.readOnly}
                onChange={() => onChange(option.value)}
                className="w-4 h-4"
              />
              <span className="text-sm font-bold text-on-surface">{option.label}</span>
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label>
        {label}
        <textarea
          data-testid={`catalog-input-${field.key}`}
          required={required}
          readOnly={field.readOnly}
          minLength={field.minLength}
          maxLength={field.maxLength}
          rows={5}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={`${classes} resize-y`}
        />
        {help}
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label>
        {label}
        <select
          data-testid={`catalog-input-${field.key}`}
          required={required}
          disabled={field.readOnly}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          className={classes}
        >
          <option value="">Select an option…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {help}
      </label>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div>
        <label className="flex items-center gap-3 rounded-xl bg-surface-container p-4 border border-border/50">
          <input
            data-testid={`catalog-input-${field.key}`}
            type="checkbox"
            checked={Boolean(value)}
            disabled={field.readOnly}
            onChange={(event) => onChange(event.target.checked)}
            className="w-5 h-5"
          />
          <span className="font-bold text-on-surface">{displayLabel}</span>
        </label>
        {help}
      </div>
    );
  }

  const pattern = field.pattern || FORMAT_PATTERN[field.format ?? field.type];
  return (
    <label>
      {label}
      <input
        data-testid={`catalog-input-${field.key}`}
        required={required}
        readOnly={field.readOnly}
        type={HTML_INPUT_TYPE[field.type] ?? 'text'}
        minLength={field.minLength}
        maxLength={field.maxLength}
        min={field.type === 'number' ? field.min : dateLimitAttribute(field.minDate, field.type)}
        max={field.type === 'number' ? field.max : dateLimitAttribute(field.maxDate, field.type)}
        step={field.type === 'number' ? field.step : undefined}
        pattern={pattern}
        // `title` es lo que el navegador muestra cuando `pattern` falla. Sin
        // él, el aviso nativo es "Coincide con el formato solicitado", que no
        // le dice a nadie qué formato es.
        title={field.patternMessage || undefined}
        value={field.type === 'datetime' ? datetimeLocalValue(value) : String(value ?? '')}
        onChange={(event) => {
          if (field.type === 'datetime') {
            onChange(event.target.value ? new Date(event.target.value).toISOString() : '');
            return;
          }
          if (field.type !== 'number') {
            onChange(event.target.value);
            return;
          }
          onChange(event.target.value === '' ? '' : Number(event.target.value));
        }}
        placeholder={field.placeholder}
        className={classes}
      />
      {help}
    </label>
  );
}

/**
 * Multi-selección con casillas.
 *
 * El conteo mínimo/máximo no lo cubre la validación nativa —un grupo de
 * casillas no tiene `required` colectivo—, así que se declara con
 * `setCustomValidity` sobre la primera: el formulario no se envía y el
 * navegador ancla el mensaje ahí. Sin esto habría que ir al servidor para
 * enterarse de que faltaba una opción.
 */
function MultiSelectField({
  field,
  value,
  required,
  onChange,
  label,
  help,
}: {
  field: FieldDefinition;
  value: unknown;
  required: boolean;
  onChange: (value: unknown) => void;
  label: React.ReactNode;
  help: React.ReactNode;
}) {
  const selected = selectedValues(value);
  const anchor = useRef<HTMLInputElement | null>(null);
  const minimum = field.minItems ?? (required ? 1 : 0);
  const maximum = field.maxItems;

  const shortfall = selected.length < minimum;
  const excess = maximum !== undefined && selected.length > maximum;
  const message = shortfall
    ? minimum === 1
      ? 'Select at least one option.'
      : `Select at least ${minimum} options.`
    : excess
      ? `Select at most ${maximum} options.`
      : '';

  useEffect(() => {
    anchor.current?.setCustomValidity(message);
  }, [message]);

  function toggle(optionValue: string, checked: boolean) {
    const next = checked
      ? [...selected, optionValue]
      : selected.filter((entry) => entry !== optionValue);
    // Se guarda en el orden de las opciones publicadas, no en el orden en que
    // se hizo clic: así el mismo conjunto produce siempre el mismo valor.
    const ordered = (field.options ?? [])
      .map((option) => option.value)
      .filter((optionKey) => next.includes(optionKey));
    onChange(ordered);
  }

  return (
    <fieldset data-testid={`catalog-input-${field.key}`} disabled={field.readOnly}>
      <legend className="contents">{label}</legend>
      <div className="space-y-2">
        {field.options?.map((option, index) => (
          <label
            key={option.value}
            className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface-container px-4 py-3 cursor-pointer has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
          >
            <input
              ref={index === 0 ? anchor : undefined}
              type="checkbox"
              value={option.value}
              checked={selected.includes(option.value)}
              disabled={field.readOnly}
              onChange={(event) => toggle(option.value, event.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-bold text-on-surface">{option.label}</span>
          </label>
        ))}
      </div>
      {(minimum > 0 || maximum !== undefined) && (
        <span className="mt-2 block text-xs text-on-surface-variant">
          {selected.length} selected
          {minimum > 0 && ` · minimum ${minimum}`}
          {maximum !== undefined && ` · maximum ${maximum}`}
        </span>
      )}
      {help}
    </fieldset>
  );
}
