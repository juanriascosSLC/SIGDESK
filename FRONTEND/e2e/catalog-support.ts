export type Condition = {
  field?: string;
  operator?: string;
  value?: unknown;
  values?: unknown[];
  all?: Condition[];
  any?: Condition[];
};

export type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  requiredWhen?: Condition;
  visibleWhen?: Condition;
  defaultValue?: unknown;
  options?: Array<{ value: string; label?: string }>;
  minLength?: number;
};

export type Placement = {
  source: 'catalog' | 'ticket';
  fieldKey: string;
  label?: string;
  width?: string;
};

export type Definition = {
  id: string;
  entityKey: string;
  name: string;
  version: number;
  status: string;
  specification: {
    fields: Field[];
    views?: Record<string, string[]>;
    detailLayout?: {
      fields?: Placement[];
    };
  };
};

export function conditionMatches(
  condition: Condition | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  if (condition.all) {
    return condition.all.every((child) => conditionMatches(child, data));
  }
  if (condition.any) {
    return condition.any.some((child) => conditionMatches(child, data));
  }
  const actual = condition.field ? data[condition.field] : undefined;
  switch (condition.operator) {
    case 'equals':
      return actual === condition.value;
    case 'notEquals':
      return actual !== condition.value;
    case 'in':
      return (condition.values ?? []).includes(actual);
    case 'notIn':
      return !(condition.values ?? []).includes(actual);
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    case 'notExists':
      return actual === undefined || actual === null || actual === '';
    case 'greaterThan':
      return Number(actual) > Number(condition.value);
    case 'greaterThanOrEqual':
      return Number(actual) >= Number(condition.value);
    case 'lessThan':
      return Number(actual) < Number(condition.value);
    case 'lessThanOrEqual':
      return Number(actual) <= Number(condition.value);
    default:
      return true;
  }
}

export function generatedValue(field: Field): unknown {
  const minimum = Math.max(field.minLength ?? 0, 1);
  switch (field.type) {
    case 'select':
      return field.defaultValue ?? field.options?.[0]?.value ?? '';
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'date':
      return '2026-08-01';
    case 'datetime':
      return '2026-08-01T14:00:00Z';
    case 'textarea':
      return `Playwright ${field.key} integration value`.padEnd(
        minimum,
        '.',
      );
    default:
      return `E2E ${field.key}`.padEnd(minimum, 'x');
  }
}

function normalizeRequestedValue(field: Field, value: unknown): unknown {
  if (field.type !== 'select' || typeof value !== 'string') return value;
  const requested = value.toLocaleLowerCase();
  return (
    field.options?.find(
      (option) =>
        option.value.toLocaleLowerCase() === requested ||
        option.label?.toLocaleLowerCase() === requested,
    )?.value ?? value
  );
}

export function definitionData(
  definition: Pick<Definition, 'specification'>,
  requested: Record<string, unknown>,
  excluded = new Set<string>(),
): Record<string, unknown> {
  const fields = definition.specification.fields;
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const data: Record<string, unknown> = {};

  for (const field of fields) {
    if (!excluded.has(field.key) && field.defaultValue !== undefined) {
      data[field.key] = field.defaultValue;
    }
  }
  for (const [key, value] of Object.entries(requested)) {
    const field = fieldsByKey.get(key);
    if (field && !excluded.has(key)) {
      data[key] = normalizeRequestedValue(field, value);
    }
  }
  for (let pass = 0; pass < 2; pass += 1) {
    for (const field of fields) {
      if (
        excluded.has(field.key) ||
        !conditionMatches(field.visibleWhen, data)
      ) {
        continue;
      }
      const required =
        field.required ||
        Boolean(
          field.requiredWhen && conditionMatches(field.requiredWhen, data),
        );
      if (
        required &&
        (data[field.key] === undefined ||
          data[field.key] === null ||
          data[field.key] === '')
      ) {
        data[field.key] = generatedValue(field);
      }
    }
  }
  return data;
}
