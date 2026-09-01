/**
 * Los tipos de campo y los predicados puros sobre ellos.
 *
 * Viven aparte de `metamodel.ts` porque ese archivo importa `apiRequest`, y
 * con él todo el cliente HTTP (que lee `import.meta.env`). Eso hace imposible
 * importar el modelo desde Node — y sin eso, la lógica pura del Catalog
 * Builder no se puede verificar en ningún sitio: el frontend no tiene runner
 * de tests unitarios.
 *
 * `metamodel.ts` los reexporta, así que nada más tuvo que cambiar de import.
 * Este módulo NO debe adquirir dependencias.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'boolean'
  | 'number'
  | 'date'
  | 'datetime'
  // Metamodelo 1.7. `radio` y `multiselect` comparten `options` con `select`;
  // `email`/`phone`/`url` son texto con un formato con nombre que el servidor
  // comprueba (tickets_service/application/validar_datos_catalogo.go).
  //
  // Son tipos y no un `format` sobre `text` porque cambian el renderer: un
  // multiselect guarda una LISTA, y un radio pinta todas las opciones a la
  // vez. `format` sigue existiendo aparte para poder exigir un formato sobre
  // un campo de texto que ya está publicado, sin cambiarle el tipo.
  | 'radio'
  | 'multiselect'
  | 'email'
  | 'phone'
  | 'url';

/**
 * Formatos con nombre. Se resuelven en el servidor y no se publican como
 * regex en la definición: así corregir un patrón no exige republicar cada
 * catálogo que lo usa.
 */
export type FieldFormat = 'email' | 'phone' | 'url';

export const FIELD_TYPES_WITH_OPTIONS: FieldType[] = ['select', 'radio', 'multiselect'];

export function fieldTypeUsesOptions(type: FieldType): boolean {
  return FIELD_TYPES_WITH_OPTIONS.includes(type);
}

export function fieldTypeIsText(type: FieldType): boolean {
  return (
    type === 'text' || type === 'textarea' || type === 'email' || type === 'phone' || type === 'url'
  );
}

/**
 * Clave técnica a partir de un texto libre: sin acentos, camelCase, y siempre
 * empezando por una letra.
 *
 * Vive acá y no en el config del builder por el mismo motivo que lo anterior:
 * es una función pura que la lógica verificable necesita.
 */
export function technicalKey(value: string, uppercase = false) {
  const normalized = value
    .normalize('NFD')
    // Los diacríticos combinantes que NFD acaba de separar (U+0300–U+036F),
    // en escape explícito: el rango escrito con los caracteres literales es
    // equivalente pero ilegible en el fuente.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character: string) => character.toUpperCase())
    .replace(/[^a-zA-Z0-9_]/g, '');
  const safe = normalized.replace(/^[^a-zA-Z]+/, '');
  return uppercase ? safe.toUpperCase() : `${safe.charAt(0).toLowerCase()}${safe.slice(1)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Valores de un campo con `bindsTo`
//
// Viven acá, y no en `metamodel.ts`, por el mismo motivo que todo lo de
// arriba: son lógica pura y este es el único módulo que se puede importar
// desde Node, así que es el único sitio donde se pueden verificar.
// `metamodel.ts` los reexporta.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Valor guardado en `data[field.key]` para un campo con `bindsTo` — un objeto
 * enriquecido, NUNCA el id plano (decisión de la review de Diseño): permite
 * mostrar el recurso/agente elegido en el detalle sin refetch, y condicionar
 * otros campos por `tipo`.
 */
export interface BindingValue {
  id: string;
  displayName: string;
  tipo?: string;
}

/**
 * Un campo `bindsTo` guarda un `BindingValue` cuando es de selección única y
 * un `BindingValue[]` cuando acepta varios dispositivos. Ambas formas son
 * válidas y conviven: las definiciones publicadas antes de `multiple` no
 * traen la propiedad, así que sus campos siguen guardando un objeto suelto.
 * Por eso todo lector pasa por `bindingList`/`bindingPrincipal` en vez de
 * castear.
 */
export type BindingFieldValue = BindingValue | BindingValue[] | null;

/** La forma mínima de FieldDefinition que necesita la lógica de bindings. */
export interface BindingFieldShape {
  bindsTo?: 'recursoId' | 'agenteItId' | 'siteAssetId' | 'assetId';
  multiple?: boolean;
  minItems?: number;
  maxItems?: number;
}

/**
 * Si un campo acepta varios valores.
 *
 * `multiple` SOLO se honra sobre `assetId`: `siteAssetId` es estructuralmente
 * singular (acota la consulta de dispositivos y viaja como
 * `assetContext.siteAssetId`), y `recursoId`/`agenteItId` mapean a escalares
 * top-level del contrato de creación. Un `multiple: true` sobre cualquiera de
 * esos tres se ignora en vez de romper.
 */
export function bindingIsMultiple(field: BindingFieldShape | undefined): boolean {
  return field?.bindsTo === 'assetId' && field.multiple === true;
}

function isBindingValue(candidate: unknown): candidate is BindingValue {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const { id, displayName } = candidate as Partial<BindingValue>;
  return typeof id === 'string' && id !== '' && typeof displayName === 'string';
}

/**
 * Lector tolerante: acepta `null`, un `BindingValue` suelto o un arreglo, y
 * devuelve siempre una lista. Descarta entradas inválidas y deduplica por
 * `id` conservando la primera aparición — el backend deduplica igual
 * (`resolveAssets`), así que la UI no debe prometer algo distinto.
 */
export function bindingList(value: unknown): BindingValue[] {
  const candidates = Array.isArray(value) ? value : [value];
  const byId = new Map<string, BindingValue>();
  for (const candidate of candidates) {
    if (isBindingValue(candidate) && !byId.has(candidate.id)) {
      byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()];
}

/**
 * El dispositivo principal de un campo: el que alimenta `recursoId` y el que
 * evalúan las condiciones con cuantificador `principal`.
 *
 * Es la primera posición de la lista, pero eso NO es «el primero que se
 * eligió»: el picker permite reordenar con «Hacer principal», así que la
 * posición es una decisión explícita de la persona y no un accidente del
 * orden de los clics. El backend tampoco lo infiere por posición — recibe
 * `principal: true` en el link correspondiente.
 */
export function bindingPrincipal(value: unknown): BindingValue | null {
  return bindingList(value)[0] ?? null;
}

/** El valor vacío de un campo `bindsTo`: `[]` si acepta varios, `null` si no. */
export function bindingEmptyValue(field: BindingFieldShape | undefined): BindingFieldValue {
  return bindingIsMultiple(field) ? [] : null;
}

/**
 * Único sitio donde se decide si la cantidad de dispositivos elegidos es
 * válida, y con qué texto se dice. Lo comparten el picker (que lo ancla con
 * `setCustomValidity`) y el guard de envío, para que no puedan discrepar.
 * Devuelve '' cuando no hay problema.
 *
 * El mínimo efectivo sigue la convención ya usada por `MultiSelectField`:
 * `minItems ?? (required ? 1 : 0)`.
 */
export function bindingCountIssue(
  field: BindingFieldShape | undefined,
  value: unknown,
  required: boolean,
): string {
  if (!bindingIsMultiple(field)) return '';
  const count = bindingList(value).length;
  const minimum = field?.minItems ?? (required ? 1 : 0);
  const maximum = field?.maxItems;
  if (count < minimum) {
    return minimum === 1
      ? 'Selecciona al menos un dispositivo.'
      : `Selecciona al menos ${minimum} dispositivos.`;
  }
  if (maximum !== undefined && count > maximum) {
    return maximum === 1
      ? 'Selecciona como máximo un dispositivo.'
      : `Selecciona como máximo ${maximum} dispositivos.`;
  }
  return '';
}

/**
 * Clave reservada bajo la que viaja la colección completa de dispositivos por
 * campo, para los cuantificadores `any`/`all` de una condición.
 *
 * No puede colisionar con la clave de ningún campo: `technicalKey` obliga a
 * que toda clave empiece por una letra, y esta empieza por guiones bajos.
 *
 * La colección va aparte, y no dentro de `data[fieldKey]`, porque la
 * resolución de rutas con punto camina SOLO objetos: poner un arreglo bajo la
 * clave del campo rompería en silencio toda expresión tipo
 * `dispositivos.assetType`. Mismo criterio en el backend
 * (tickets_service/application/validar_datos_catalogo.go).
 */
export const ASSETS_BY_FIELD_KEY = '__assetsByField';

/**
 * Proyecta los valores de formulario al shape que consumen las condiciones.
 *
 * Un campo multi-dispositivo aporta DOS cosas: su dispositivo principal bajo
 * su propia clave (para que `dispositivos.tipo` siga funcionando igual que en
 * un campo de un solo dispositivo) y la colección completa bajo la clave
 * reservada (para `any`/`all`).
 *
 * Importa además por una razón de corrección que no es cosmética: `isPresent`
 * trata `[]` como presente, así que sin esta proyección un
 * `visibleWhen: {operator: 'exists'}` sobre un campo de dispositivos daría
 * verdadero con CERO seleccionados.
 */
export function assetConditionData<T extends BindingFieldShape & { key: string }>(
  fields: readonly T[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const projected: Record<string, unknown> = { ...data };
  const byField: Record<string, BindingValue[]> = {};
  for (const field of fields) {
    if (!field.bindsTo) continue;
    if (bindingIsMultiple(field)) {
      const items = bindingList(data[field.key]);
      byField[field.key] = items;
      projected[field.key] = items[0] ?? null;
    } else {
      projected[field.key] = bindingPrincipal(data[field.key]);
    }
  }
  projected[ASSETS_BY_FIELD_KEY] = byField;
  return projected;
}
