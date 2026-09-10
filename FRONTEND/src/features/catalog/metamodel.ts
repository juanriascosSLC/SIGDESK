import { apiRequest } from '@/lib/apiClient';

export type DefinitionStatus =
  | 'draft'
  | 'validating'
  | 'published'
  | 'deprecated'
  | 'retired'
  | 'archived';
// Los tipos de campo y sus predicados puros viven en `field-types.ts`: este
// archivo importa `apiRequest`, y con el todo el cliente HTTP, lo que hace
// imposible importar el modelo desde Node. Se reexportan para que nada mas
// tuviera que cambiar de import.
export {
  ASSETS_BY_FIELD_KEY,
  FIELD_TYPES_WITH_OPTIONS,
  assetConditionData,
  bindingCountIssue,
  bindingEmptyValue,
  bindingIsMultiple,
  bindingList,
  bindingPrincipal,
  fieldTypeIsText,
  fieldTypeUsesOptions,
  technicalKey,
  type BindingFieldValue,
  type BindingValue,
  type FieldFormat,
  type FieldType,
} from './field-types';
import { ASSETS_BY_FIELD_KEY } from './field-types';
import type { BindingValue, FieldFormat, FieldType } from './field-types';

export interface FieldOption {
  value: string;
  label: string;
}

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn'
  | 'exists'
  | 'notExists'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual';

/**
 * Cómo se aplica una condición sobre un campo que puede tener VARIOS
 * dispositivos (`bindsTo: 'assetId'` con `multiple`).
 *
 * Existe para que la regla no dependa del orden en que la persona hizo clic:
 * sin un cuantificador explícito, «el dispositivo del campo» sería
 * ambiguo en cuanto hay más de uno.
 *
 *  - `principal` (por defecto): evalúa el dispositivo principal, que la
 *    persona designa explícitamente en el picker. Es exactamente el
 *    comportamiento de un campo de un solo dispositivo, así que ninguna
 *    regla ya publicada cambia de resultado.
 *  - `any`: se cumple si ALGÚN dispositivo del campo la cumple.
 *  - `all`: exige que TODOS la cumplan. Sobre una lista vacía es verdadero
 *    (vacuo), igual que `Array.prototype.every`.
 */
export type ConditionQuantifier = 'principal' | 'any' | 'all';

export interface ConditionExpression {
  field?: string;
  operator?: ConditionOperator;
  value?: unknown;
  values?: unknown[];
  /** Solo tiene efecto sobre campos multi-dispositivo. Por defecto `principal`. */
  quantifier?: ConditionQuantifier;
  all?: ConditionExpression[];
  any?: ConditionExpression[];
}

// TODO-103 (plan "Catalog Builder + rediseño de PKs" + review CEO/Diseño/Eng
// de esta sesión): bindsTo es ortogonal a `type` — un campo con bindsTo se
// renderiza SIEMPRE con el picker de recurso/agente IT (ver BindingPicker.tsx
// en CatalogForm.tsx), sin importar su `type` nominal. Se modela así (una
// propiedad explícita, no un FieldType nuevo) porque tickets_service ya trata
// `especificacion` como un mapa genérico — agregar un FieldType nuevo
// obligaría a coordinar un cambio de esquema en el backend que este campo no
// necesita. `resourceType` solo aplica cuando bindsTo === 'recursoId' (filtra
// qué tipo de recurso es válido para este campo — enum cerrado contra lo que
// resource_service realmente modela, domain.TipoRecurso).
export type ResourceTypeFilter =
  | 'hardware'
  | 'software_licencia'
  | 'infraestructura_red'
  | 'camera'
  | 'nvr'
  | 'server'
  | 'switch'
  | 'router'
  | 'pdu'
  | 'access-point'
  | 'access-control'
  | 'radio'
  | 'speaker'
  | 'software'
  | 'site';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  requiredWhen?: ConditionExpression;
  visibleWhen?: ConditionExpression;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  /**
   * Ayuda PERSISTENTE bajo el campo, distinta de `placeholder`: el
   * placeholder desaparece en cuanto la persona escribe, así que no puede
   * llevar la instrucción que necesita mientras llena el campo.
   */
  helpText?: string;
  /**
   * Presentación, NO seguridad. Un campo de solo lectura sigue viajando en
   * `data` si alguien lo manda; lo que garantiza que un valor no se toque es
   * que no sea un campo de formulario. Se usa para mostrar algo que otro
   * flujo calcula.
   */
  readOnly?: boolean;
  defaultValue?: unknown;
  options?: FieldOption[];
  // ── Restricciones. Cada una la valida el servidor en
  //    tickets_service/application/validar_datos_catalogo.go. Agregar una
  //    aquí sin agregarla allá deja la UI prometiendo algo que no se cumple.
  /** Solo `number`. */
  min?: number;
  /** Solo `number`. */
  max?: number;
  /** Solo `number`. El servidor solo exige el paso cuando es entero. */
  step?: number;
  /** Formato con nombre sobre un campo de texto. */
  format?: FieldFormat;
  /** Expresión propia del administrador. Si no compila, el servidor la ignora. */
  pattern?: string;
  /** Mensaje que ve la persona cuando `pattern` no coincide. */
  patternMessage?: string;
  /** `date`/`datetime`. Fecha ISO o el literal `today`, que no caduca. */
  minDate?: string;
  /** `date`/`datetime`. Fecha ISO o el literal `today`. */
  maxDate?: string;
  /** `multiselect` (opciones) o un campo `bindsTo:'assetId'` con `multiple`
   *  (dispositivos). El servidor verifica ambos casos. */
  minItems?: number;
  /** Ver `minItems`. */
  maxItems?: number;
  bindsTo?: 'recursoId' | 'agenteItId' | 'siteAssetId' | 'assetId';
  /**
   * Solo `bindsTo: 'assetId'`. Convierte el campo en 1..N dispositivos; el
   * valor pasa a ser `BindingValue[]` y cada dispositivo produce su propia
   * entrada en `assetContext.links`.
   *
   * Es una propiedad aparte y NO un `FieldType` nuevo por dos razones. La
   * primera es la ya documentada arriba para `bindsTo`. La segunda es dura:
   * `tiposCampoEjecutables` (tickets_service/application/validar_campos_definicion.go)
   * solo acepta text/textarea/select/boolean/number/date/datetime al
   * publicar, así que un campo `type: 'multiselect'` no se puede publicar —
   * el campo de dispositivos conserva `type: 'text'` y la multiplicidad vive
   * acá.
   */
  multiple?: boolean;
  resourceType?: ResourceTypeFilter;
  assetRole?: string;
}

// `BindingValue` y los helpers que lo leen viven en `field-types.ts` (módulo
// sin dependencias, verificable desde Node) y se reexportan arriba.

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  titulo: 'Title',
  description: 'Description',
  descripcion: 'Description',
  priority: 'Priority',
  requester: 'Requester',
  assignee: 'Assignee',
  site: 'Site',
};

export function fieldDisplayLabel(field: Pick<FieldDefinition, 'key' | 'label'>): string {
  const configured = typeof field.label === 'string' ? field.label.trim() : '';
  if (configured) return configured;
  const known = FIELD_LABELS[field.key.toLowerCase()];
  if (known) return known;
  const readable = field.key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : 'Field';
}

export type DetailFieldSource = 'catalog' | 'ticket';
export type DetailFieldWidth = 'third' | 'half' | 'full';

export interface DetailFieldPlacement {
  source: DetailFieldSource;
  fieldKey: string;
  label?: string;
  width?: DetailFieldWidth;
}

export interface DetailLayoutDefinition {
  fields: DetailFieldPlacement[];
  showSla?: boolean;
  showAttachments?: boolean;
  showActivity?: boolean;
}

// Metamodel 1.4: explicit, section-based layouts per view kind, with
// optional audience variants. Older specifications may omit `layouts`
// entirely; runtime/layout-normalizer.ts synthesizes an equivalent document
// from `views`/`detailLayout` in that case.
export type LayoutKind = 'create' | 'edit' | 'detail';

// The two kinds that render an editable form. Metamodel 1.6 gives each of them
// a full PageLayout of its own, exactly like `detail` got one in 1.5.
export type FormPageKind = Extract<LayoutKind, 'create' | 'edit'>;

export type AudienceKey = 'requester' | 'agent' | 'supervisor';

export type PlacementKind = 'field' | 'widget';

export interface Placement {
  id: string;
  kind: PlacementKind;
  columnSpan: 1 | 2 | 3;

  // kind === 'field'
  source?: DetailFieldSource;
  fieldKey?: string;
  label?: string;
  readOnly?: boolean;
  visibleWhen?: ConditionExpression;

  // kind === 'widget'
  widgetKey?: WidgetKey;
}

export interface LayoutSection {
  id: string;
  title?: string;
  description?: string;
  columns: 1 | 2 | 3;
  collapsible?: boolean;
  visibleWhen?: ConditionExpression;
  placements: Placement[];
}

export interface LayoutDocument {
  sections: LayoutSection[];
}

// AudienceKey is presentation-only in this increment: it is resolved on the
// frontend (see runtime/resolve-layout.ts) and is not yet authorized or
// filtered by the backend. Hiding a field in a variant must never be relied
// upon to protect sensitive data.
export interface LayoutVariant {
  key: string;
  label: string;
  audienceKey: AudienceKey;
  document: LayoutDocument;
}

export interface LayoutDefinition {
  default: LayoutDocument;
  variants?: LayoutVariant[];
}

export interface FormLayouts {
  create?: LayoutDefinition;
  edit?: LayoutDefinition;
  detail?: LayoutDefinition;
}

// Metamodel 1.5: a full ticket page structure by fixed regions, additive to
// (and independent from) the 1.4 form-section layouts above. Layouts (1.4)
// remain the model for create/edit; PageLayout (1.5) is exclusive to detail.
//
// Regions are named fields, not an array keyed by kind — a missing or
// duplicated region is structurally impossible, not a validation rule.
export type RegionName = 'header' | 'actions' | 'main' | 'sidebar' | 'footer';

export type PagePlacementKind = 'field' | 'widget' | 'content';

export type ContentKind = 'section' | 'text' | 'divider' | 'spacer';

// The widget catalog of the ticket page (see TicketWidgetRegistry.tsx for the
// runtime component behind each key). `field` placements (source
// catalog/ticket) are not part of this catalog — they use the generic field
// mechanism instead.
export type TicketWidgetKey =
  | 'ticketHeader'
  | 'ticketActions'
  | 'sla'
  | 'attachments'
  | 'activity'
  | 'mergedTickets'
  | 'itsmRelations'
  | 'assetDetails'
  | 'description'
  | 'suggestedSolutions'
  | 'requesterDetails'
  | 'statusHistory'
  | 'changeTasks'
  | 'stakeholders';

// Metamodel 1.6 — the widget catalog of the create/edit FORM pages (see
// form-widgets/FormWidgetRegistry.tsx). Deliberately a member of the same flat
// `WidgetKey` space rather than a parallel one: `PagePlacement.widgetKey` is
// shared by every page, and the backend models widget rules as one flat map
// too (validar_page_layout.go). Which keys a given page may actually host is
// decided by the surface's registry, not by the type.
export type FormWidgetKey =
  | 'formHeader'
  | 'formActions'
  | 'formRequesterDetails'
  | 'formSlaPreview'
  | 'formAttachments'
  | 'formRecordSummary'
  | 'formAssetSummary'
  | 'formStakeholders';

export type WidgetKey = TicketWidgetKey | FormWidgetKey;

export interface PagePlacement {
  id: string;
  kind: PagePlacementKind;
  column: number;
  columnSpan: number;
  row: number;
  rowSpan?: number;
  mobileOrder?: number;
  locked?: boolean;
  visibleWhen?: ConditionExpression;

  // kind === 'field'
  source?: DetailFieldSource;
  fieldKey?: string;
  label?: string;
  readOnly?: boolean;

  // kind === 'widget'
  widgetKey?: WidgetKey;

  // kind === 'content' — structural/generic, owned by no business module
  contentKind?: ContentKind;
  title?: string;
  content?: string;
}

// A region's own internal grid: always its own 0..columns coordinate space,
// independent of how wide the region actually renders on the page (a narrow
// Sidebar still places items on a 0..12 grid).
export interface LayoutRegion {
  columns: number;
  placements: PagePlacement[];
}

// SidebarColumns splits the page width between main and sidebar in the row
// where they coexist (3..5 of 12 — main takes the rest). Header/actions/
// footer always span the full page width.
export interface PageLayout {
  sidebarColumns: number;
  header: LayoutRegion;
  actions: LayoutRegion;
  main: LayoutRegion;
  sidebar: LayoutRegion;
  footer: LayoutRegion;
}

export interface PageLayoutVariant {
  key: string;
  label: string;
  audienceKey: AudienceKey;
  page: PageLayout;
}

export interface PageLayoutDefinition {
  default: PageLayout;
  variants?: PageLayoutVariant[];
}

function conditionValue(
  data: Record<string, unknown>,
  path: string,
): { value: unknown; exists: boolean } {
  if (Object.prototype.hasOwnProperty.call(data, path)) {
    return { value: data[path], exists: true };
  }
  let current: unknown = data;
  for (const part of path.split('.')) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return { value: undefined, exists: false };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { value: current, exists: true };
}

function isPresent(value: unknown, exists: boolean): boolean {
  return exists && value !== null && value !== undefined &&
    !(typeof value === 'string' && value.trim() === '');
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  return Object.is(left, right);
}

/**
 * Resuelve una ruta relativa DENTRO de un dispositivo ya elegido. Una ruta
 * vacía devuelve el dispositivo entero, que es lo que necesita un
 * `equals` sobre el campo a secas.
 */
function conditionValueWithin(item: unknown, path: string): { value: unknown; exists: boolean } {
  if (path === '') return { value: item, exists: item !== undefined };
  if (typeof item !== 'object' || item === null) return { value: undefined, exists: false };
  return conditionValue(item as Record<string, unknown>, path);
}

/**
 * La colección de dispositivos a la que apunta una condición cuantificada, y
 * el resto de la ruta que hay que resolver dentro de cada uno. `null` cuando
 * el campo no es multi-dispositivo o no hay colección en el contexto.
 */
function quantifiedCollection(
  data: Record<string, unknown>,
  path: string,
): { items: unknown[]; rest: string } | null {
  const [head, ...rest] = path.split('.');
  const byField = data[ASSETS_BY_FIELD_KEY];
  if (!head || typeof byField !== 'object' || byField === null) return null;
  const items = (byField as Record<string, unknown>)[head];
  if (!Array.isArray(items)) return null;
  return { items, rest: rest.join('.') };
}

export function evaluateCondition(
  condition: ConditionExpression,
  data: Record<string, unknown>,
): boolean {
  if (condition.all?.length) {
    return condition.all.every((child) => evaluateCondition(child, data));
  }
  if (condition.any?.length) {
    return condition.any.some((child) => evaluateCondition(child, data));
  }
  const quantifier = condition.quantifier ?? 'principal';
  if (quantifier !== 'principal') {
    const collection = quantifiedCollection(data, condition.field ?? '');
    // Sin colección no hay nada que cuantificar: `all` es vacuamente cierto y
    // `any` es falso, la misma convención que every/some sobre [].
    if (!collection) return quantifier === 'all';
    const matches = (item: unknown) =>
      evaluateConditionLeaf(condition, conditionValueWithin(item, collection.rest));
    return quantifier === 'all' ? collection.items.every(matches) : collection.items.some(matches);
  }
  return evaluateConditionLeaf(condition, conditionValue(data, condition.field ?? ''));
}

function evaluateConditionLeaf(
  condition: ConditionExpression,
  resolved: { value: unknown; exists: boolean },
): boolean {
  const { value, exists } = resolved;
  const present = isPresent(value, exists);
  switch (condition.operator) {
    case 'exists':
      return present;
    case 'notExists':
      return !present;
    case 'equals':
      return valuesEqual(value, condition.value);
    case 'notEquals':
      return !valuesEqual(value, condition.value);
    case 'in':
      return (condition.values ?? []).some((candidate) => valuesEqual(value, candidate));
    case 'notIn':
      return !(condition.values ?? []).some((candidate) => valuesEqual(value, candidate));
    case 'greaterThan':
    case 'greaterThanOrEqual':
    case 'lessThan':
    case 'lessThanOrEqual': {
      if (typeof value !== 'number' || typeof condition.value !== 'number') return false;
      if (condition.operator === 'greaterThan') return value > condition.value;
      if (condition.operator === 'greaterThanOrEqual') return value >= condition.value;
      if (condition.operator === 'lessThan') return value < condition.value;
      return value <= condition.value;
    }
    default:
      return false;
  }
}

export function isFieldVisible(
  field: FieldDefinition,
  data: Record<string, unknown>,
): boolean {
  return !field.visibleWhen || evaluateCondition(field.visibleWhen, data);
}

export function isFieldRequired(
  field: FieldDefinition,
  data: Record<string, unknown>,
): boolean {
  if (!isFieldVisible(field, data)) return false;
  return field.required ||
    Boolean(field.requiredWhen && evaluateCondition(field.requiredWhen, data));
}

export interface CatalogSpecification {
  description: string;
  identity: { prefix: string };
  fields: FieldDefinition[];
  lifecycle: {
    states: Array<{ key: string; label: string; initial?: boolean }>;
    transitions: TransitionDefinition[];
  };
  bindings?: ResourceBinding[];
  views?: Record<string, string[]>;
  detailLayout?: DetailLayoutDefinition;
  layouts?: FormLayouts;
  detailPage?: PageLayoutDefinition;
  // Metamodel 1.6 — the create/edit forms rendered as full pages, on the
  // same region/grid model as `detailPage`. Absent on every definition
  // published before 1.6; runtime/form-page-normalizer.ts synthesizes an
  // equivalent page from `layouts.create`/`layouts.edit` in that case.
  createPage?: PageLayoutDefinition;
  editPage?: PageLayoutDefinition;
  relations?: RelationDefinition[];
  events?: Array<{ key: string; trigger: string }>;
  actions?: Array<{ key: string; label: string; binding?: string }>;
  extensions?: Record<string, Record<string, unknown>>;
}

export interface RelationDefinition {
  key: string;
  label: string;
  targetEntityKey: string;
  inverseKey: string;
  inverseLabel: string;
  cardinality?: 'one' | 'many';
  contractVersion?: string;
}

export interface AssetContextInput {
  siteAssetId?: string;
  siteFieldKey?: string;
  links: Array<{
    assetId: string;
    role?: string;
    /** Qué campo del formulario aportó este dispositivo. El servidor lo
     *  persiste, para poder reconstruir la agrupación en un ticket histórico. */
    fieldKey?: string;
    /** El dispositivo que gobierna `recursoId` y las condiciones con
     *  cuantificador `principal`. Viaja explícito para que el servidor no
     *  tenga que deducirlo de la posición en el arreglo. */
    principal?: boolean;
  }>;
}

export interface TransitionDefinition {
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface ResourceBinding {
  kind?: string;
  module: string;
  resourceType: string;
  /** Identidad ESTABLE del recurso: el resourceId de una política SLA, o el
   *  workflow_family_id de una automatización. */
  resourceId: string;
  /** Versión publicada EXACTA, cuando el módulo dueño le da identidad propia.
   *
   *  Existe por Automations (ADR-0039): allí `workflow_id` identifica una
   *  versión y `workflow_family_id` la familia, al revés que en SLA. El runtime
   *  necesita el id de la versión, así que la referencia lo lleva explícito. */
  resourceInstanceId?: string;
  resourceVersion?: string;
  contractVersion?: string;
  required?: boolean;
  /** Vinculada pero apagada. Distinto de quitarla: conserva la referencia —y la
   *  intención de quien la puso— para poder reactivarla sin volver a buscarla.
   *  Ausente significa habilitada. */
  enabled?: boolean;
  version?: string;
}

export interface ResourceReference {
  module: string;
  resourceType: string;
  resourceId: string;
  resourceInstanceId?: string;
  resourceVersion: string;
  contractVersion: string;
  required: boolean;
}

export interface AvailableResource {
  reference: ResourceReference;
  displayName: string;
  description?: string;
}

export interface ExecutableDefinitionManifest {
  definitionVersionId: string;
  entityKey: string;
  version: number;
  metamodelVersion: string;
  specification: CatalogSpecification;
  resources: ResourceReference[];
  checksum: string;
  compiledAt: string;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: string;
}

export interface PublicationValidation {
  valid: boolean;
  issues: ValidationIssue[];
  manifest?: ExecutableDefinitionManifest;
}

export interface CatalogDefinition {
  id?: string;
  entityKey: string;
  name: string;
  version?: number;
  metamodelVersion?: string;
  status?: DefinitionStatus;
  specification: CatalogSpecification;
  manifest?: ExecutableDefinitionManifest;
  checksum?: string;
  createdAt?: string;
  /** Testigo de concurrencia optimista del borrador (RFC3339Nano). Se
   *  devuelve tal cual como `expectedUpdatedAt` al editarlo o descartarlo. */
  updatedAt?: string;
  publishedAt?: string;
}

export interface EntityRecord {
  id: string;
  humanId: string;
  entityKey: string;
  definitionId: string;
  definitionVersionId: string;
  definitionVersion: number;
  schemaVersion: string;
  manifestChecksum: string;
  state: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  recursoId?: string;
  /**
   * Canonical creator identifier (organization_service usuario_id), for
   * PRB/RFC — problem_service/change_service's own entity DTO (PRB/RFC
   * identity presentation). Use for commands/auditing only, never render
   * directly as the visible label.
   */
  createdBy?: string;
  /**
   * Trusted display name for `createdBy`, resolved server-side (JWT
   * snapshot at creation, or the owning service's local identity
   * projection for a historical record) — safe to render directly, and
   * never a raw id. Absent when it could not be resolved; the caller
   * decides the safe fallback ("User unavailable"), never the raw id.
   */
  createdByName?: string;
  organizationUnitId?: string;
  stakeholders?: StakeholdersInput;
  assetContext?: {
    siteAssetId?: string;
    links: Array<{ assetId: string; role?: string; snapshot: Record<string, unknown> }>;
  };
}

export interface StakeholdersInput {
  userIds: string[];
  unitIds: string[];
}

export interface StakeholderDirectory {
  units: Array<{ id: string; name: string; departmentId: string }>;
  users: Array<{ id: string; name: string; email: string; unitId: string }>;
}

export function getStakeholderDirectory() {
  return apiRequest<StakeholderDirectory>('/organization/stakeholder-directory');
}

export interface EntityRelation {
  id: string;
  contractVersion: string;
  relationKey: string;
  relationLabel: string;
  inverseKey: string;
  inverseLabel: string;
  sourceEntityId: string;
  sourceEntityKey: string;
  sourceHumanId: string;
  sourceDefinitionVersionId: string;
  targetEntityId: string;
  targetEntityKey: string;
  targetHumanId: string;
  targetDefinitionVersionId: string;
  createdBy?: string;
  createdAt: string;
}

export const emptyDefinition = (): CatalogDefinition => ({
  entityKey: '',
  name: '',
  // `metamodelVersion` es informativo: el backend lo reporta pero no ramifica
  // por el (metamodelVersion() en entidades_controller.go). Decia 1.4 mientras
  // el builder ya emitia paginas 1.6; se pone al dia porque una definicion que
  // declara un nivel que no usa desorienta a quien la lee.
  metamodelVersion: '1.7',
  specification: {
    description: '',
    identity: { prefix: '' },
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        // Las entidades nuevas empiezan con campos opcionales. El
        // administrador puede activar esta regla explícitamente desde
        // "Reglas y validaciones" cuando el contrato lo necesite.
        required: false,
        minLength: 3,
        maxLength: 160,
      },
    ],
    lifecycle: {
      states: [{ key: 'draft', label: 'Draft', initial: true }],
      transitions: [],
    },
    bindings: [],
    relations: [],
    views: { create: ['title'], summary: ['title'] },
    detailLayout: {
      fields: [
        { source: 'ticket', fieldKey: 'requester', width: 'third' },
        { source: 'ticket', fieldKey: 'assignee', width: 'third' },
        { source: 'catalog', fieldKey: 'title', width: 'full' },
      ],
      showSla: true,
      showAttachments: true,
      showActivity: true,
    },
    layouts: {
      create: {
        default: {
          sections: [
            {
              id: 'section-create-main',
              columns: 1,
              placements: [
                { id: 'placement-create-title', kind: 'field', source: 'catalog', fieldKey: 'title', columnSpan: 1 },
              ],
            },
          ],
        },
      },
      detail: {
        default: {
          sections: [
            {
              id: 'section-detail-main',
              columns: 3,
              placements: [
                { id: 'placement-detail-requester', kind: 'field', source: 'ticket', fieldKey: 'requester', columnSpan: 1 },
                { id: 'placement-detail-assignee', kind: 'field', source: 'ticket', fieldKey: 'assignee', columnSpan: 1 },
                { id: 'placement-detail-title', kind: 'field', source: 'catalog', fieldKey: 'title', columnSpan: 3 },
                { id: 'placement-detail-sla', kind: 'widget', widgetKey: 'sla', columnSpan: 3 },
                { id: 'placement-detail-attachments', kind: 'widget', widgetKey: 'attachments', columnSpan: 3 },
                { id: 'placement-detail-activity', kind: 'widget', widgetKey: 'activity', columnSpan: 3 },
              ],
            },
          ],
        },
      },
    },
  },
});

const legacyBindingOwners: Record<string, { module: string; resourceType: string }> = {
  permissionPolicy: { module: 'iam', resourceType: 'policy' },
  slaPolicy: { module: 'sla', resourceType: 'policy' },
  automation: { module: 'automations', resourceType: 'workflow' },
  notificationTemplate: { module: 'notifications', resourceType: 'template' },
  integration: { module: 'integrations', resourceType: 'connector' },
  reportMetric: { module: 'reports', resourceType: 'metric' },
};

/**
 * Catalog definitions are immutable, so old published versions may legally
 * predate properties that the current editor knows how to display. Normalize
 * only at the client boundary: this keeps the stored manifest untouched while
 * ensuring every editor receives a complete, render-safe specification.
 */
export function normalizeDefinition(definition: CatalogDefinition): CatalogDefinition {
  const raw = (definition.specification ?? {}) as Partial<CatalogSpecification>;
  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((field) => ({ ...field, label: fieldDisplayLabel(field) }))
    : [];
  const states = Array.isArray(raw.lifecycle?.states) ? raw.lifecycle.states : [];
  const transitions = Array.isArray(raw.lifecycle?.transitions)
    ? raw.lifecycle.transitions
    : [];
  const bindings = Array.isArray(raw.bindings) ? raw.bindings : [];
  const relations = Array.isArray(raw.relations)
    ? raw.relations.map((relation) => {
        const legacy = relation as RelationDefinition & { fromEntity?: string; toEntity?: string };
        const normalized = { ...legacy };
        delete normalized.fromEntity;
        delete normalized.toEntity;
        return {
          ...normalized,
          targetEntityKey: relation.targetEntityKey || legacy.toEntity || '',
          inverseKey: relation.inverseKey || `relatedFrom${relation.key || 'Relation'}`,
          inverseLabel: relation.inverseLabel || `Relacionado desde ${definition.entityKey}`,
          contractVersion: relation.contractVersion || '1',
        };
      })
    : [];

  return {
    ...definition,
    metamodelVersion: definition.metamodelVersion || '1.1',
    specification: {
      ...raw,
      description: typeof raw.description === 'string' ? raw.description : '',
      identity: {
        prefix:
          typeof raw.identity?.prefix === 'string' && raw.identity.prefix.trim()
            ? raw.identity.prefix
            : definition.entityKey,
      },
      fields,
      lifecycle: { states, transitions },
      views: raw.views ?? {
        create: fields.map((field) => field.key),
        summary: fields.slice(0, 4).map((field) => field.key),
      },
      relations,
      bindings: bindings.map((binding) => {
        const legacy = binding.kind ? legacyBindingOwners[binding.kind] : undefined;
        return {
          ...binding,
          module: binding.module || legacy?.module || '',
          resourceType: binding.resourceType || legacy?.resourceType || '',
          resourceVersion: binding.resourceVersion || binding.version,
          contractVersion: binding.contractVersion || '1',
        };
      }),
    },
  };
}

export async function listDefinitions(publishedOnly = false) {
  const query = publishedOnly ? '?status=published&active=true' : '';
  const response = await apiRequest<{ items: CatalogDefinition[] }>(
    `/catalog/definitions${query}`,
  );
  return (Array.isArray(response.items) ? response.items : []).map(normalizeDefinition);
}

export async function listAvailableResources() {
  const response = await apiRequest<{ items: AvailableResource[] }>('/catalog/resources');
  return response.items;
}

// TODO-103 — recursos/agentes IT reales para el picker de bindsTo. Ambos
// endpoints viven fuera de /catalog (son de resource_service/
// organization_service, no de tickets_service) y devuelven un array bare,
// no `{items: []}` — distinto del resto de esta API, verificado contra el
// DTO Go real (escribirJSON(w, 200, dtos) donde dtos es []recursoListadoDTO).
// Requieren JWT + permiso (recursos:read:global / agentes_it:read:global) —
// un 403 de apiRequest no destruye la sesión (ver apiClient.ts), a
// diferencia de un 401.
interface RecursoListadoApi {
  id: string;
  nombre: string;
  tipo: string;
}

interface AgenteITListadoApi {
  id: string;
  nombre: string;
  habilidad_o_categoria: string;
  capacidad_carga: number;
}

export async function listRecursos(): Promise<BindingValue[]> {
  const items = await apiRequest<RecursoListadoApi[]>('/recursos');
  return items.map((item) => ({ id: item.id, displayName: item.nombre, tipo: item.tipo }));
}

export async function listAgentesIT(): Promise<BindingValue[]> {
  const items = await apiRequest<AgenteITListadoApi[]>('/agentes_it');
  return items.map((item) => ({
    id: item.id,
    displayName: item.nombre,
    tipo: item.habilidad_o_categoria,
  }));
}

export async function getPublishedDefinition(entityKey: string) {
  const definition = await apiRequest<CatalogDefinition>(
    `/catalog/definitions/${encodeURIComponent(entityKey)}`,
  );
  return normalizeDefinition(definition);
}

export async function createDefinitionDraft(definition: CatalogDefinition) {
  const created = await apiRequest<CatalogDefinition>('/catalog/definitions', {
    method: 'POST',
    body: JSON.stringify({
      entityKey: definition.entityKey,
      name: definition.name,
      specification: definition.specification,
    }),
  });
  return normalizeDefinition(created);
}

// Edita EL borrador abierto de la entidad, en su sitio. Guardar dejó de
// crear una versión por pulsación: solo publicar produce una versión, que a
// partir de ahí es inmutable. `expectedUpdatedAt` es obligatorio — el backend
// rechaza la escritura si el borrador cambió desde que se leyó (409).
export async function updateDefinitionDraft(definition: CatalogDefinition) {
  if (!definition.updatedAt) {
    throw new Error('Draft has no update timestamp; reload it before saving.');
  }
  const updated = await apiRequest<CatalogDefinition>(
    `/catalog/definitions/${encodeURIComponent(definition.entityKey)}/draft`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        name: definition.name,
        specification: definition.specification,
        expectedUpdatedAt: definition.updatedAt,
      }),
    },
  );
  return normalizeDefinition(updated);
}

/** Archiva el borrador. Es un cambio de estado, no un borrado: los tickets
 *  históricos referencian la fila de la definición con la que se crearon. */
export async function discardDefinitionDraft(entityKey: string, expectedUpdatedAt: string) {
  const discarded = await apiRequest<CatalogDefinition>(
    `/catalog/definitions/${encodeURIComponent(entityKey)}/draft`,
    { method: 'DELETE', body: JSON.stringify({ expectedUpdatedAt }) },
  );
  return normalizeDefinition(discarded);
}

export async function publishDefinition(entityKey: string, version: number) {
  const published = await apiRequest<CatalogDefinition>(
    `/catalog/definitions/${encodeURIComponent(entityKey)}/versions/${version}/publish`,
    { method: 'POST' },
  );
  return normalizeDefinition(published);
}

export function validateDefinition(entityKey: string, version: number) {
  return apiRequest<PublicationValidation>(
    `/catalog/definitions/${encodeURIComponent(entityKey)}/versions/${version}/validate`,
    { method: 'POST' },
  );
}

export function getDefinitionManifest(entityKey: string, version: number) {
  return apiRequest<ExecutableDefinitionManifest>(
    `/catalog/definitions/${encodeURIComponent(entityKey)}/versions/${version}/manifest`,
  );
}

export function getEntity(entityKey: string, entityId: string) {
  if (entityKey === 'RFC') {
    return apiRequest<EntityRecord>(`/changes/${encodeURIComponent(entityId)}`);
  }
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`,
  );
}

export async function listEntities(entityKey: string) {
  if (entityKey === 'RFC') {
    const response = await apiRequest<{ items: EntityRecord[] }>('/changes');
    return response.items;
  }
  const response = await apiRequest<{ items: EntityRecord[] }>(
    `/entities/${encodeURIComponent(entityKey)}`,
  );
  return response.items;
}

export async function listEntityRelations(entityKey: string, entityId: string) {
  const paths = [`/relationships/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`];
  if (entityKey === 'INC' || entityKey === 'RFC') {
    paths.push(`/change-relationships/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`);
  }
  const responses = await Promise.all(
    paths.map((path) => apiRequest<{ items: EntityRelation[] }>(path)),
  );
  const unique = new Map<string, EntityRelation>();
  for (const response of responses) {
    for (const relation of response.items) unique.set(`${relation.sourceEntityKey}:${relation.id}`, relation);
  }
  return [...unique.values()];
}

export function createChangeRelation(
  changeId: string,
  relationKey: string,
  targetEntityKey: string,
  targetEntityId: string,
) {
  return apiRequest<EntityRelation>(`/changes/${encodeURIComponent(changeId)}/relationships`, {
    method: 'POST',
    body: JSON.stringify({ relationKey, targetEntityKey, targetEntityId }),
  });
}

export function deleteChangeRelation(changeId: string, relationId: string) {
  return apiRequest<void>(
    `/changes/${encodeURIComponent(changeId)}/relationships/${encodeURIComponent(relationId)}`,
    { method: 'DELETE' },
  );
}

export function createEntityRelation(
  entityKey: string,
  entityId: string,
  relationKey: string,
  targetEntityKey: string,
  targetEntityId: string,
) {
  return apiRequest<EntityRelation>(
    `/relationships/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ relationKey, targetEntityKey, targetEntityId }),
    },
  );
}

export function deleteEntityRelation(
  entityKey: string,
  entityId: string,
  relationId: string,
) {
  return apiRequest<void>(
    `/relationships/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/${encodeURIComponent(relationId)}`,
    { method: 'DELETE' },
  );
}

export function getEntityManifest(entityKey: string, entityId: string) {
  if (entityKey === 'RFC') {
    return apiRequest<ExecutableDefinitionManifest>(`/changes/${encodeURIComponent(entityId)}/manifest`);
  }
  return apiRequest<ExecutableDefinitionManifest>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/manifest`,
  );
}

// Alias de `GET /catalog/definitions/{entityKey}` — que es exactamente como
// el backend describe esta ruta (entidades_controller.go, "GET
// /entities/{entityKey}/presentation es alias de GET
// /catalog/definitions/{entityKey}").
//
// Deliberadamente NO llama a `/entities/{entityKey}/presentation`: ADR-0034
// remontó esa ruta sobre `ConSecretoInterno` (header `X-Internal-Secret`,
// para rag_service), no sobre `ConAutenticacion`. Un navegador jamás tiene
// ese secreto, así que respondía 401 SIEMPRE — para PRB y también para INC.
// Y un 401 no es inocuo acá: apiClient despacha AUTH_FAILURE_EVENT, que
// destruye la sesión y rebota al login (que a su vez devuelve a la ruta de
// origen, remontando esta query en bucle).
export function getEntityPresentation(entityKey: string) {
  return getPublishedDefinition(entityKey);
}

export function updateEntity(
  entityKey: string,
  entityId: string,
  data: Record<string, unknown>,
  expectedUpdatedAt: string,
) {
  if (entityKey === 'RFC') {
    return apiRequest<EntityRecord>(`/changes/${encodeURIComponent(entityId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ data, expectedUpdatedAt }),
    });
  }
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ data, expectedUpdatedAt }),
    },
  );
}

// TODO-103 — recursoId/agenteItId son aditivos al payload {data} ya existente
// (crearEntidadRequest en tickets_service ya los acepta como opcionales,
// omitempty). Sin ellos, `POST /entities/:entityKey` para un entityKey cuya
// definición tenga un campo bindsTo sigue fallando con ErrRecursoIDVacio —
// esta firma es lo que cierra ese ciclo del lado del cliente.
export function createEntity(
  entityKey: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
  binding?: { recursoId?: string; agenteItId?: string; assetContext?: AssetContextInput; stakeholders?: StakeholdersInput; prioridad?: string },
) {
  // recursoId/agenteItId pertenecen al contrato legado de INC. PRB y RFC
  // reciben solamente el contexto CMDB versionado; enviar esos campos a sus
  // APIs estrictas hace que DisallowUnknownFields rechace una solicitud sana.
  const domainBinding = entityKey === 'INC'
    ? binding
    : binding?.assetContext || binding?.stakeholders
      ? { assetContext: binding.assetContext, stakeholders: binding.stakeholders }
      : undefined;
  if (entityKey === 'RFC') {
    return apiRequest<EntityRecord>('/changes', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify({ data, ...domainBinding }),
    });
  }
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}`,
    {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify({ data, ...domainBinding }),
    },
  );
}

export function transitionEntity(
  entityKey: string,
  entityId: string,
  transitionKey: string,
) {
  if (entityKey === 'RFC') {
    return apiRequest<EntityRecord>(
      `/changes/${encodeURIComponent(entityId)}/transitions/${encodeURIComponent(transitionKey)}`,
      { method: 'POST' },
    );
  }
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/transitions/${encodeURIComponent(transitionKey)}`,
    { method: 'POST' },
  );
}
