import type {
  ConditionExpression,
  ConditionOperator,
  ConditionQuantifier,
  FieldDefinition,
} from '@/features/catalog/metamodel';
import { bindingIsMultiple } from '@/features/catalog/metamodel';
import { conditionOperators, defaultConditionValue, parseConditionValue } from './config';
import { Toggle } from './ui';
import { Plus, Trash2 } from 'lucide-react';

// El ÚNICO editor de condiciones del Entity Builder.
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
          label={enabled ? 'Active' : 'Inactive'}
        />
      </div>

      {complex && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          This rule uses an advanced <span className="font-mono">all/any</span> group. You can
          keep it from the Advanced section or replace it by re-enabling this simple rule.
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
            aria-label="Source field"
            className="friendly-input"
          >
            {sources.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.label || candidate.key}
              </option>
            ))}
          </select>
          <select
            value={operator}
            onChange={(event) => changeOperator(event.target.value as ConditionOperator)}
            aria-label="Operator"
            className="friendly-input"
          >
            {availableOperators.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>
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
              No value required
            </div>
          )}
        </div>
      )}

      {/* Con varios dispositivos en un campo, «el dispositivo» es ambiguo. En
          vez de resolverlo con una regla implícita —que cambiaría el
          resultado según el orden de los clics— se pregunta. */}
      {enabled && !complex && supportsQuantifier && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
          <span className="font-bold">Applies to</span>
          <select
            value={quantifier}
            onChange={(event) => changeQuantifier(event.target.value as ConditionQuantifier)}
            aria-label="Which devices the condition applies to"
            data-testid={`${testId}-quantifier`}
            className="friendly-input py-1"
          >
            <option value="principal">the primary device</option>
            <option value="any">any of the devices</option>
            <option value="all">all devices</option>
          </select>
        </label>
      )}
    </div>
  );
}

/**
 * Visual editor for the full ConditionExpression contract. It keeps the
 * familiar single-rule path, but can author an ALL/ANY group without asking
 * an administrator to edit JSON.
 */
export function AdvancedConditionRule(props: ConditionRuleProps) {
  const { condition, sources, onChange, label, emptyLabel, testId, disabled } = props;
  if (sources.length === 0) return null;
  const mode: 'simple' | 'all' | 'any' = condition?.all ? 'all' : condition?.any ? 'any' : 'simple';
  const children = mode === 'all' ? condition?.all ?? [] : mode === 'any' ? condition?.any ?? [] : [];
  const defaultRule = (): ConditionExpression => ({
    field: sources[0].key,
    operator: 'equals',
    value: defaultConditionValue(sources[0]),
  });

  function changeMode(next: 'simple' | 'all' | 'any') {
    if (!condition) {
      onChange(next === 'simple' ? defaultRule() : { [next]: [defaultRule(), defaultRule()] });
      return;
    }
    if (next === 'simple') {
      onChange(children[0] ?? defaultRule());
      return;
    }
    const first = mode === 'simple' ? condition : children[0] ?? defaultRule();
    onChange({ [next]: children.length > 0 ? children : [first, defaultRule()] });
  }

  if (mode === 'simple') {
    return (
      <div className="space-y-2" data-testid={testId ? `${testId}-advanced` : undefined}>
        <ConditionRule {...props} />
        {condition && !disabled && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-on-surface-variant">Combine rules:</span>
            <button type="button" onClick={() => changeMode('all')} className="rounded-lg border border-border/40 px-2 py-1 text-[10px] font-bold text-on-surface hover:border-primary/50">All must match</button>
            <button type="button" onClick={() => changeMode('any')} className="rounded-lg border border-border/40 px-2 py-1 text-[10px] font-bold text-on-surface hover:border-primary/50">Any may match</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section data-testid={testId ? `${testId}-advanced` : undefined} className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black text-on-surface">{label}</p>
          <p className="text-[10px] text-on-surface-variant">
            {mode === 'all' ? 'Show only when every rule matches.' : 'Show when at least one rule matches.'}
          </p>
        </div>
        <div className="flex rounded-lg border border-border/40 bg-surface-container p-0.5">
          {(['all', 'any'] as const).map((candidate) => (
            <button key={candidate} type="button" aria-pressed={mode === candidate} onClick={() => changeMode(candidate)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${mode === candidate ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
              {candidate === 'all' ? 'Match all' : 'Match any'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {children.map((child, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <ConditionRule
              {...props}
              label={`Rule ${index + 1}`}
              emptyLabel={undefined}
              condition={child}
              compact
              testId={testId ? `${testId}-rule-${index}` : undefined}
              onChange={(next) => {
                const updated = children.map((item, childIndex) => childIndex === index ? (next ?? defaultRule()) : item);
                onChange({ [mode]: updated });
              }}
            />
            <button
              type="button"
              aria-label={`Remove rule ${index + 1}`}
              disabled={children.length <= 1}
              onClick={() => onChange({ [mode]: children.filter((_, childIndex) => childIndex !== index) })}
              className="mt-2 rounded-lg p-2 text-on-surface-variant hover:bg-red-500/10 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange({ [mode]: [...children, defaultRule()] })} className="flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1.5 text-[10px] font-black text-primary">
          <Plus className="h-3 w-3" /> Add rule
        </button>
        <button type="button" onClick={() => changeMode('simple')} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-on-surface-variant">Use one rule</button>
        <button type="button" onClick={() => onChange(undefined)} className="ml-auto rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-red-600">Disable</button>
      </div>
      {!condition && emptyLabel && <p className="text-[10px] text-on-surface-variant">{emptyLabel}</p>}
    </section>
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
        placeholder="value1, value2"
        aria-label="Comma-separated values"
      />
    );
  }

  if (source.type === 'select') {
    return (
      <select
        value={String(condition.value ?? '')}
        onChange={(event) => onChange({ field: source.key, operator, value: event.target.value })}
        aria-label="Expected value"
        className="friendly-input"
      >
        {source.options?.map((option) => (
          <option key={option.value} value={option.value}>
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
        aria-label="Expected value"
        className="friendly-input"
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
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
      placeholder="Expected value"
      aria-label="Expected value"
    />
  );
}
