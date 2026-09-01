import type {
  ConditionExpression,
  ConditionOperator,
  ConditionQuantifier,
  FieldDefinition,
} from '@/features/catalog/metamodel';
import { bindingIsMultiple } from '@/features/catalog/metamodel';
import { conditionOperators, defaultConditionValue, parseConditionValue } from './config';
import { Toggle } from './ui';

// El ÚNICO editor de condiciones del Catalog Builder.
//
// Antes había tres implementaciones divergentes — ésta (la de campos), la del
// diseñador de formularios y la del diseñador de página — y dos de ellas
// estaban rotas del mismo modo: al elegir el operador `in`/`notIn` seguían
// escribiendo `condition.value`, mientras `evaluateCondition` lee
// `condition.values` para esos dos operadores (metamodel.ts). El resultado era
// una regla que se guardaba, se publicaba y no se cumplía nunca: `in` no
// coincidía jamás y `notIn` coincidía siempre.
//
// Aquel par también ignoraba el tipo del campo de origen (siempre un `<input>`
// de texto, incluso para select o booleano) y corrompía en silencio los grupos
// `all`/`any` al hacer `{ ...condition, operator }` encima de ellos.

export interface ConditionRuleProps {
  label: string;
  /** Texto mostrado cuando la regla está apagada. */
  emptyLabel?: string;
  condition?: ConditionExpression;
  /** Campos que pueden usarse como origen de la comparación. */
  sources: FieldDefinition[];
  disabled?: boolean;
  /** Apila los controles en una columna, para paneles laterales angostos. */
  compact?: boolean;
  testId?: string;
  onChange: (condition: ConditionExpression | undefined) => void;
}

export function ConditionRule({
  label,
  emptyLabel,
  condition,
  sources,
  disabled = false,
  compact = false,
  testId,
  onChange,
}: ConditionRuleProps) {
  if (sources.length === 0) return null;

  // Un grupo all/any no se puede representar con una sola fila. Se conserva
  // intacto y se avisa, en vez de aplanarlo con un spread que lo dejaría con
  // un `field`/`operator` sueltos junto a los hijos que nadie volvería a leer.
  const complex = Boolean(condition?.all?.length || condition?.any?.length);
  const source = sources.find((candidate) => candidate.key === condition?.field) ?? sources[0];
  const operator = condition?.operator ?? 'equals';
  const availableOperators = conditionOperators.filter(
    (candidate) =>
      source.type === 'number' ||
      !['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'].includes(candidate.value),
  );
  const enabled = Boolean(condition) && !disabled;

  function enable() {
    onChange({ field: source.key, operator: 'equals', value: defaultConditionValue(source) });
  }

  // Cambiar de operador reconstruye la expresión completa en vez de mutar la
  // anterior: `in`/`notIn` viven en `values` (array) y el resto en `value`, y
  // arrastrar la clave equivocada es exactamente el bug que este módulo cierra.
  // El cuantificador sobrevive a un cambio de operador (es ortogonal a él),
  // pero NO a un cambio a un campo que no sea multi-dispositivo: dejarlo ahí
  // sería una propiedad muerta en la definición publicada.
  const quantifier: ConditionQuantifier = condition?.quantifier ?? 'principal';
  const supportsQuantifier = bindingIsMultiple(source);
  const keptQuantifier = supportsQuantifier && quantifier !== 'principal' ? { quantifier } : {};

  function changeOperator(next: ConditionOperator) {
    if (next === 'in' || next === 'notIn') {
      onChange({
        field: source.key,
        operator: next,
        ...keptQuantifier,
        values: [condition?.value ?? defaultConditionValue(source)],
      });
      return;
    }
    onChange({
      field: source.key,
      operator: next,
      ...keptQuantifier,
      ...(next === 'exists' || next === 'notExists'
        ? {}
        : { value: condition?.values?.[0] ?? condition?.value ?? defaultConditionValue(source) }),
    });
  }

  function changeQuantifier(next: ConditionQuantifier) {
    onChange({ ...condition!, quantifier: next === 'principal' ? undefined : next });
  }

  function changeSource(nextKey: string) {
    const nextSource = sources.find((candidate) => candidate.key === nextKey)!;
    onChange({
      field: nextSource.key,
      operator,
      ...(bindingIsMultiple(nextSource) ? keptQuantifier : {}),
      ...(operator === 'exists' || operator === 'notExists'
        ? {}
        : operator === 'in' || operator === 'notIn'
          ? { values: [defaultConditionValue(nextSource)] }
          : { value: defaultConditionValue(nextSource) }),
    });
  }

  return (
    <div data-testid={testId} className="rounded-xl border border-border/40 bg-surface-container p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-on-surface">{label}</p>
          {!enabled && emptyLabel && (
            <p className="mt-0.5 text-[11px] text-on-surface-variant">{emptyLabel}</p>
          )}
        </div>
        <Toggle
          checked={enabled}
          disabled={disabled}
          onChange={(checked) => (checked ? enable() : onChange(undefined))}
          label={enabled ? 'Activa' : 'Inactiva'}
        />
      </div>

      {complex && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          Esta regla usa un grupo avanzado <span className="font-mono">all/any</span>. Puedes
          conservarla desde la sección Avanzado o reemplazarla activando nuevamente esta regla
          simple.
        </div>
      )}

      {enabled && !complex && (
        <div
          className={`mt-3 gap-2 ${
            compact ? 'flex flex-col' : 'grid lg:grid-cols-[minmax(0,1fr)_190px_minmax(0,1fr)]'
          }`}
        >
          <select
            value={source.key}
            onChange={(event) => changeSource(event.target.value)}
            aria-label="Campo de origen"
            className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
            style={{ colorScheme: 'dark' }}
          >
            {sources.map((candidate) => (
              <option key={candidate.key} value={candidate.key} className="bg-[#191c22] text-[#e1e2eb]">
                {candidate.label || candidate.key}
              </option>
            ))}
          </select>
          <select
            value={operator}
            onChange={(event) => changeOperator(event.target.value as ConditionOperator)}
            aria-label="Operador"
            className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
            style={{ colorScheme: 'dark' }}
          >
            {availableOperators.map((candidate) => (
              <option key={candidate.value} value={candidate.value} className="bg-[#191c22] text-[#e1e2eb]">
                {candidate.label}
              </option>
            ))}
          </select>
          {operator !== 'exists' && operator !== 'notExists' ? (
            <ConditionValueEditor
              source={source}
              operator={operator}
              condition={condition!}
              onChange={onChange}
            />
          ) : (
            <div className="friendly-input flex items-center text-sm text-on-surface-variant">
              No requiere valor
            </div>
          )}
        </div>
      )}

      {/* Con varios dispositivos en un campo, «el dispositivo» es ambiguo. En
          vez de resolverlo con una regla implícita —que cambiaría el
          resultado según el orden de los clics— se pregunta. */}
      {enabled && !complex && supportsQuantifier && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
          <span className="font-bold">Aplica a</span>
          <select
            value={quantifier}
            onChange={(event) => changeQuantifier(event.target.value as ConditionQuantifier)}
            aria-label="A qué dispositivos aplica la condición"
            data-testid={`${testId}-quantifier`}
            className="friendly-input bg-[#1d2026] py-1 text-[#e1e2eb]"
            style={{ colorScheme: 'dark' }}
          >
            <option value="principal" className="bg-[#191c22] text-[#e1e2eb]">el dispositivo principal</option>
            <option value="any" className="bg-[#191c22] text-[#e1e2eb]">alguno de los dispositivos</option>
            <option value="all" className="bg-[#191c22] text-[#e1e2eb]">todos los dispositivos</option>
          </select>
        </label>
      )}
    </div>
  );
}

// El control de valor sigue al TIPO del campo de origen: un select ofrece sus
// opciones, un booleano ofrece Sí/No, una fecha abre el date picker. Los dos
// paneles de diseñador mostraban siempre un input de texto libre, así que
// comparar contra un select exigía teclear el `value` técnico de memoria.
function ConditionValueEditor({
  source,
  operator,
  condition,
  onChange,
}: {
  source: FieldDefinition;
  operator: ConditionOperator;
  condition: ConditionExpression;
  onChange: (condition: ConditionExpression) => void;
}) {
  if (operator === 'in' || operator === 'notIn') {
    return (
      <input
        value={(condition.values ?? []).join(', ')}
        onChange={(event) =>
          onChange({
            field: source.key,
            operator,
            values: event.target.value
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
              .map((value) => parseConditionValue(source, value)),
          })
        }
        className="friendly-input"
        placeholder="valor1, valor2"
        aria-label="Valores separados por coma"
      />
    );
  }

  if (source.type === 'select') {
    return (
      <select
        value={String(condition.value ?? '')}
        onChange={(event) => onChange({ field: source.key, operator, value: event.target.value })}
        aria-label="Valor esperado"
        className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
        style={{ colorScheme: 'dark' }}
      >
        {source.options?.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#191c22] text-[#e1e2eb]">
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (source.type === 'boolean') {
    return (
      <select
        value={String(condition.value ?? true)}
        onChange={(event) =>
          onChange({ field: source.key, operator, value: event.target.value === 'true' })
        }
        aria-label="Valor esperado"
        className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
        style={{ colorScheme: 'dark' }}
      >
        <option value="true" className="bg-[#191c22] text-[#e1e2eb]">Sí</option>
        <option value="false" className="bg-[#191c22] text-[#e1e2eb]">No</option>
      </select>
    );
  }

  return (
    <input
      type={
        source.type === 'number'
          ? 'number'
          : source.type === 'date'
            ? 'date'
            : source.type === 'datetime'
              ? 'datetime-local'
              : 'text'
      }
      value={String(condition.value ?? '')}
      onChange={(event) =>
        onChange({
          field: source.key,
          operator,
          value: source.type === 'number' ? Number(event.target.value) : event.target.value,
        })
      }
      className="friendly-input"
      placeholder="Valor esperado"
      aria-label="Valor esperado"
    />
  );
}
