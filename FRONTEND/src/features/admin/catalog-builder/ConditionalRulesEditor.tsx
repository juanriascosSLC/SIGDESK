import { GitBranch } from 'lucide-react';
import type {
  ConditionExpression,
  ConditionOperator,
  FieldDefinition,
} from '@/features/catalog/metamodel';
import {
  conditionOperators,
  defaultConditionValue,
  parseConditionValue,
} from './config';
import { Toggle } from './ui';

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
  return (
    <div className="mt-5 ml-0 lg:ml-14 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
      <div className="flex items-start gap-3 mb-4">
        <GitBranch className="w-4 h-4 text-violet-300 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-on-surface">Comportamiento condicional</p>
          <p className="text-xs text-on-surface-variant mt-1">
            Cambia este campo según la respuesta de otro campo. Las reglas también se validan en el servidor.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <ConditionRuleEditor
          testId={`catalog-condition-visible-${field.key}`}
          label="Mostrar solo cuando"
          emptyLabel="Siempre visible"
          condition={field.visibleWhen}
          sources={sources}
          onChange={(visibleWhen) => onChange({ visibleWhen })}
        />
        <ConditionRuleEditor
          testId={`catalog-condition-required-${field.key}`}
          label="Hacer obligatorio cuando"
          emptyLabel={field.required ? 'Ya es obligatorio siempre' : 'No agregar obligación condicional'}
          condition={field.requiredWhen}
          sources={sources}
          disabled={field.required}
          onChange={(requiredWhen) => onChange({ requiredWhen })}
        />
      </div>
    </div>
  );
}

function ConditionRuleEditor({
  testId,
  label,
  emptyLabel,
  condition,
  sources,
  disabled = false,
  onChange,
}: {
  testId: string;
  label: string;
  emptyLabel: string;
  condition?: ConditionExpression;
  sources: FieldDefinition[];
  disabled?: boolean;
  onChange: (condition: ConditionExpression | undefined) => void;
}) {
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
    onChange({
      field: source.key,
      operator: 'equals',
      value: defaultConditionValue(source),
    });
  }

  function changeOperator(next: ConditionOperator) {
    if (next === 'in' || next === 'notIn') {
      onChange({
        field: source.key,
        operator: next,
        values: [condition?.value ?? defaultConditionValue(source)],
      });
      return;
    }
    onChange({
      field: source.key,
      operator: next,
      ...(
        next === 'exists' || next === 'notExists'
          ? {}
          : { value: condition?.values?.[0] ?? condition?.value ?? defaultConditionValue(source) }
      ),
    });
  }

  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-border/40 bg-surface-container p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-on-surface">{label}</p>
          {!enabled && <p className="text-[11px] text-on-surface-variant mt-0.5">{emptyLabel}</p>}
        </div>
        <Toggle
          checked={enabled}
          disabled={disabled}
          onChange={(checked) => checked ? enable() : onChange(undefined)}
          label={enabled ? 'Activa' : 'Inactiva'}
        />
      </div>
      {complex && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          Esta regla usa un grupo avanzado <span className="font-mono">all/any</span>. Puedes conservarla desde
          la sección Avanzado o reemplazarla activando nuevamente esta regla simple.
        </div>
      )}
      {enabled && !complex && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_190px_minmax(0,1fr)] gap-2 mt-3">
          <select
            value={source.key}
            onChange={(event) => {
              const nextSource = sources.find((candidate) => candidate.key === event.target.value)!;
              onChange({
                field: nextSource.key,
                operator,
                ...(
                  operator === 'exists' || operator === 'notExists'
                    ? {}
                    : operator === 'in' || operator === 'notIn'
                      ? { values: [defaultConditionValue(nextSource)] }
                      : { value: defaultConditionValue(nextSource) }
                ),
              });
            }}
            className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
            style={{ colorScheme: 'dark' }}
          >
            {sources.map((candidate) => (
              <option key={candidate.key} value={candidate.key} className="bg-[#191c22] text-[#e1e2eb]">{candidate.label}</option>
            ))}
          </select>
          <select
            value={operator}
            onChange={(event) => changeOperator(event.target.value as ConditionOperator)}
            className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
            style={{ colorScheme: 'dark' }}
          >
            {availableOperators.map((candidate) => (
              <option key={candidate.value} value={candidate.value} className="bg-[#191c22] text-[#e1e2eb]">{candidate.label}</option>
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
            <div className="friendly-input text-sm text-on-surface-variant flex items-center">
              No requiere valor
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const multiple = operator === 'in' || operator === 'notIn';
  if (multiple) {
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
      />
    );
  }
  if (source.type === 'select') {
    return (
      <select
        value={String(condition.value ?? '')}
        onChange={(event) => onChange({ field: source.key, operator, value: event.target.value })}
        className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
        style={{ colorScheme: 'dark' }}
      >
        {source.options?.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#191c22] text-[#e1e2eb]">{option.label}</option>
        ))}
      </select>
    );
  }
  if (source.type === 'boolean') {
    return (
      <select
        value={String(condition.value ?? true)}
        onChange={(event) => onChange({ field: source.key, operator, value: event.target.value === 'true' })}
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
    />
  );
}
