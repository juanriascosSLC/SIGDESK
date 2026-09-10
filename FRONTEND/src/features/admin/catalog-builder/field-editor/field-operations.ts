import type {
  CatalogSpecification,
  FieldDefinition,
  FieldType,
  PageLayout,
  PageLayoutDefinition,
  RegionName,
} from '../../../catalog/metamodel';
// Rutas relativas y NO el alias `@/`, y los valores desde `field-types` y no
// desde `metamodel`: es lo que permite que catalog-field-operations.spec.ts
// importe este modulo en Node. El alias no lo resuelve el proyecto de e2e, y
// `metamodel` arrastra el cliente HTTP (que lee `import.meta.env`).
import {
  bindingIsMultiple,
  fieldTypeIsText,
  fieldTypeUsesOptions,
  technicalKey,
} from '../../../catalog/field-types';

/**
 * Lógica pura del editor de campos. Vive aparte del componente porque es lo
 * único aquí que se puede probar sin un navegador — el frontend no tiene
 * runner de tests unitarios, así que un arnés de Node sobre este archivo es la
 * única verificación real que estas reglas pueden tener.
 */

const REGION_NAMES: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];

/** Las tres superficies donde un campo puede estar colocado. */
export type SurfaceKey = 'createPage' | 'editPage' | 'detailPage';

export const SURFACE_LABELS: Record<SurfaceKey, string> = {
  createPage: 'Create',
  editPage: 'Edit',
  detailPage: 'Detail',
};

function pagesOf(definition: PageLayoutDefinition | undefined): PageLayout[] {
  if (!definition) return [];
  return [definition.default, ...(definition.variants ?? []).map((variant) => variant.page)];
}

function pageHasField(page: PageLayout, fieldKey: string): boolean {
  return REGION_NAMES.some((region) =>
    page[region].placements.some(
      (placement) =>
        placement.kind === 'field' &&
        placement.source === 'catalog' &&
        placement.fieldKey === fieldKey,
    ),
  );
}

/**
 * En qué superficies está colocado un campo.
 *
 * Es lo que reemplaza a los interruptores «Mostrar al crear» / «Mostrar en
 * resumen», que escribían `views.*`: con metamodelo 1.6 el formulario lo
 * dibuja `createPage`, y `views.create` solo se lee cuando esa página no
 * existe (resolveFormPageLayout). Los interruptores parecían decidir la
 * visibilidad y no decidían nada; esto informa dónde está de verdad y remite
 * al diseñador, que es quien la decide.
 */
export function fieldPlacementSurfaces(
  specification: CatalogSpecification,
  fieldKey: string,
): SurfaceKey[] {
  const surfaces: SurfaceKey[] = [];
  for (const key of ['createPage', 'editPage', 'detailPage'] as SurfaceKey[]) {
    const pages = pagesOf(specification[key]);
    // Sin página materializada no se puede afirmar que falte: el diseñador la
    // sintetiza al abrirse, y ahí el campo sí aparecerá. Decir «no colocado»
    // sería una alarma falsa en toda definición recién publicada.
    if (pages.length === 0) continue;
    if (pages.some((page) => pageHasField(page, fieldKey))) surfaces.push(key);
  }
  return surfaces;
}

/** Las superficies que existen (tienen página materializada). */
export function materializedSurfaces(specification: CatalogSpecification): SurfaceKey[] {
  return (['createPage', 'editPage', 'detailPage'] as SurfaceKey[]).filter(
    (key) => pagesOf(specification[key]).length > 0,
  );
}

/**
 * Una clave técnica que no choque con ninguna existente.
 *
 * Importa para duplicar: dos campos con la misma clave colapsan en un solo
 * valor de `data`, y el segundo pisaría al primero sin que nada lo diga.
 */
export function uniqueFieldKey(existing: string[], desired: string): string {
  const base = technicalKey(desired) || 'campo';
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${Date.now()}`;
}

/**
 * Copia un campo con clave y etiqueta nuevas.
 *
 * Las condiciones (`visibleWhen`/`requiredWhen`) se copian tal cual: apuntan a
 * OTROS campos, así que siguen siendo válidas. Lo que no se copia es nada
 * derivado de la identidad del campo original.
 */
export function duplicateField(field: FieldDefinition, existingKeys: string[]): FieldDefinition {
  const label = `${field.label} (copy)`;
  return {
    ...structuredClone(field),
    key: uniqueFieldKey(existingKeys, label),
    label,
  };
}

/**
 * Ajusta las propiedades de un campo a su tipo nuevo.
 *
 * Un campo que pasa de `select` a `number` conserva `options` en el JSON:
 * invisible en la UI, exportado en la definición publicada, y activo otra vez
 * si alguien lo devuelve a `select` con opciones que ya no tienen sentido. Se
 * limpia lo que el tipo nuevo no puede usar.
 *
 * `defaultValue` se descarta cuando cambia la forma del valor — un
 * `defaultValue` de texto en un campo numérico es un valor que el servidor
 * rechaza por tipo en cuanto alguien envía el formulario sin tocarlo.
 */
export function fieldForType(field: FieldDefinition, type: FieldType): FieldDefinition {
  const next: FieldDefinition = { ...field, type };

  if (!fieldTypeUsesOptions(type)) {
    delete next.options;
  }
  // Un campo de dispositivos conserva `type: 'text'` (los tipos del
  // metamodelo 1.7 no son publicables, ver validar_campos_definicion.go), así
  // que sin este guard cualquier cambio de tipo le vaciaría los topes de
  // dispositivos, que no tienen nada que ver con el tipo.
  if (type !== 'multiselect' && !bindingIsMultiple(field)) {
    delete next.minItems;
    delete next.maxItems;
  }
  if (type !== 'number') {
    delete next.min;
    delete next.max;
    delete next.step;
  }
  if (type !== 'date' && type !== 'datetime') {
    delete next.minDate;
    delete next.maxDate;
  }
  if (!fieldTypeIsText(type)) {
    delete next.minLength;
    delete next.maxLength;
    delete next.pattern;
    delete next.patternMessage;
    delete next.format;
  }
  // Los tipos con nombre YA implican su formato (el servidor lo deduce del
  // tipo). Dejar `format` puesto además sería declarar lo mismo dos veces.
  if (type === 'email' || type === 'phone' || type === 'url') {
    delete next.format;
  }
  if (type === 'boolean') {
    delete next.placeholder;
  }
  if (!defaultValueFitsType(field.defaultValue, type)) {
    delete next.defaultValue;
  }
  return next;
}

/** Si un `defaultValue` sigue siendo válido para un tipo. */
export function defaultValueFitsType(value: unknown, type: FieldType): boolean {
  if (value === undefined || value === '') return true;
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number';
    case 'multiselect':
      return Array.isArray(value);
    default:
      return typeof value === 'string';
  }
}

/** Resumen legible de las reglas activas, para la tarjeta colapsada. */
export function fieldRuleSummary(field: FieldDefinition): string[] {
  const rules: string[] = [];
  if (field.required) rules.push('required');
  if (field.requiredWhen) rules.push('conditionally required');
  if (field.visibleWhen) rules.push('conditionally visible');
  if (field.readOnly) rules.push('read-only');
  if (field.minLength !== undefined || field.maxLength !== undefined) {
    rules.push(`${field.minLength ?? 0}–${field.maxLength ?? '∞'} characters`);
  }
  if (field.min !== undefined || field.max !== undefined) {
    rules.push(`${field.min ?? '−∞'}…${field.max ?? '∞'}`);
  }
  if (field.step !== undefined) rules.push(`step of ${field.step}`);
  if (field.format) rules.push(`${field.format} format`);
  if (field.pattern) rules.push('custom pattern');
  if (field.minDate || field.maxDate) {
    rules.push(`dates ${field.minDate ?? 'no limit'} → ${field.maxDate ?? 'no limit'}`);
  }
  if (field.minItems !== undefined || field.maxItems !== undefined) {
    const unit = bindingIsMultiple(field) ? 'devices' : 'options';
    rules.push(`${field.minItems ?? 0}–${field.maxItems ?? '∞'} ${unit}`);
  }
  if (fieldTypeUsesOptions(field.type)) {
    rules.push(`${field.options?.length ?? 0} options`);
  }
  if (field.defaultValue !== undefined && field.defaultValue !== '') {
    rules.push(`default ${describeDefault(field.defaultValue)}`);
  }
  if (field.bindsTo) rules.push(bindingIsMultiple(field) ? 'multiple devices' : 'bound');
  return rules;
}

function describeDefault(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} options`;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/** Duplicados de `value` dentro de las opciones de un campo. */
export function duplicateOptionValues(field: FieldDefinition): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const option of field.options ?? []) {
    if (seen.has(option.value)) duplicated.add(option.value);
    seen.add(option.value);
  }
  return [...duplicated];
}

/**
 * Convierte texto pegado en opciones.
 *
 * Acepta una opción por línea, y `valor = etiqueta` o `valor,etiqueta` cuando
 * se quiere fijar la clave técnica. Sin separador, la clave se deriva de la
 * etiqueta — que es lo que hace falta el 90 % de las veces y evita pedir dos
 * columnas a quien solo tiene una lista.
 */
export function parseOptionsFromText(
  text: string,
  existingValues: string[] = [],
): Array<{ value: string; label: string }> {
  const taken = new Set(existingValues);
  const parsed: Array<{ value: string; label: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.match(/\s*[=|,;\t]\s*/);
    let value: string;
    let label: string;
    if (separator && separator.index !== undefined) {
      value = technicalKey(line.slice(0, separator.index).trim());
      label = line.slice(separator.index + separator[0].length).trim();
      if (!label) label = value;
    } else {
      label = line;
      value = technicalKey(line);
    }
    if (!value) value = 'option';
    // Una lista pegada con repetidos produciría opciones que el servidor
    // acepta pero que la persona no puede distinguir.
    let unique = value;
    for (let suffix = 2; taken.has(unique); suffix += 1) unique = `${value}${suffix}`;
    taken.add(unique);
    parsed.push({ value: unique, label });
  }
  return parsed;
}

/** Mueve un elemento de una posición a otra, sin mutar el original. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
