import type { FieldDefinition } from './metamodel';

function datetimeLocalValue(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
    'w-full bg-surface-container border border-border/50 text-on-surface rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';
  const label = (
    <span className="block text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">
      {field.label} {required && <span className="text-red-400">*</span>}
    </span>
  );

  if (field.type === 'textarea') {
    return (
      <label>
        {label}
        <textarea
          data-testid={`catalog-input-${field.key}`}
          required={required}
          minLength={field.minLength}
          maxLength={field.maxLength}
          rows={5}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={`${classes} resize-y`}
        />
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
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          className={`${classes} bg-[#1d2026] text-[#e1e2eb]`}
          style={{ colorScheme: 'dark' }}
        >
          <option value="" className="bg-[#191c22] text-[#e1e2eb]">Selecciona una opción…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#191c22] text-[#e1e2eb]">
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-3 rounded-xl bg-surface-container p-4 border border-border/50">
        <input
          data-testid={`catalog-input-${field.key}`}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="w-5 h-5"
        />
        <span className="font-bold text-on-surface">{field.label}</span>
      </label>
    );
  }
  return (
    <label>
      {label}
      <input
        data-testid={`catalog-input-${field.key}`}
        required={required}
        type={
          field.type === 'number'
            ? 'number'
            : field.type === 'date'
              ? 'date'
              : field.type === 'datetime'
                ? 'datetime-local'
                : 'text'
        }
        minLength={field.minLength}
        maxLength={field.maxLength}
        value={
          field.type === 'datetime'
            ? datetimeLocalValue(value)
            : String(value ?? '')
        }
        onChange={(event) => {
          if (field.type === 'datetime') {
            onChange(
              event.target.value
                ? new Date(event.target.value).toISOString()
                : '',
            );
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
    </label>
  );
}
