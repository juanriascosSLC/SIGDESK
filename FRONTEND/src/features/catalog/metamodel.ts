import { apiRequest } from '@/lib/apiClient';

export type DefinitionStatus =
  | 'draft'
  | 'validating'
  | 'published'
  | 'deprecated'
  | 'retired'
  | 'archived';
export type FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'boolean'
  | 'number'
  | 'date'
  | 'datetime';

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

export interface ConditionExpression {
  field?: string;
  operator?: ConditionOperator;
  value?: unknown;
  values?: unknown[];
  all?: ConditionExpression[];
  any?: ConditionExpression[];
}

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
  defaultValue?: unknown;
  options?: FieldOption[];
  validation?: Record<string, unknown>;
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

// The full widget catalog (see TicketWidgetRegistry.tsx for the runtime
// component behind each key). `field` placements (source catalog/ticket) are
// not part of this catalog — they use the generic field mechanism instead.
export type WidgetKey =
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
  | 'statusHistory';

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
  const { value, exists } = conditionValue(data, condition.field ?? '');
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
  resourceId: string;
  resourceVersion?: string;
  contractVersion?: string;
  required?: boolean;
  version?: string;
}

export interface ResourceReference {
  module: string;
  resourceType: string;
  resourceId: string;
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
  metamodelVersion: '1.4',
  specification: {
    description: '',
    identity: { prefix: '' },
    fields: [
      {
        key: 'title',
        label: 'Título',
        type: 'text',
        required: true,
        minLength: 3,
        maxLength: 160,
      },
    ],
    lifecycle: {
      states: [{ key: 'draft', label: 'Borrador', initial: true }],
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

function normalizeDefinition(definition: CatalogDefinition): CatalogDefinition {
  return {
    ...definition,
    metamodelVersion: definition.metamodelVersion || '1.1',
    specification: {
      ...definition.specification,
      relations: definition.specification.relations ?? [],
      bindings: definition.specification.bindings?.map((binding) => {
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
  const query = publishedOnly ? '?status=published' : '';
  const response = await apiRequest<{ items: CatalogDefinition[] }>(
    `/catalog/definitions${query}`,
  );
  return response.items.map(normalizeDefinition);
}

export async function listAvailableResources() {
  const response = await apiRequest<{ items: AvailableResource[] }>('/catalog/resources');
  return response.items;
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
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`,
  );
}

export async function listEntities(entityKey: string) {
  const response = await apiRequest<{ items: EntityRecord[] }>(
    `/entities/${encodeURIComponent(entityKey)}`,
  );
  return response.items;
}

export async function listEntityRelations(entityKey: string, entityId: string) {
  const response = await apiRequest<{ items: EntityRelation[] }>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/relations`,
  );
  return response.items;
}

export function createEntityRelation(
  entityKey: string,
  entityId: string,
  relationKey: string,
  targetEntityKey: string,
  targetEntityId: string,
) {
  return apiRequest<EntityRelation>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/relations`,
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
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/relations/${encodeURIComponent(relationId)}`,
    { method: 'DELETE' },
  );
}

export function getEntityManifest(entityKey: string, entityId: string) {
  return apiRequest<ExecutableDefinitionManifest>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/manifest`,
  );
}

export function getEntityPresentation(entityKey: string) {
  return apiRequest<CatalogDefinition>(
    `/entities/${encodeURIComponent(entityKey)}/presentation`,
  ).then(normalizeDefinition);
}

export function updateEntity(
  entityKey: string,
  entityId: string,
  data: Record<string, unknown>,
  expectedUpdatedAt: string,
) {
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ data, expectedUpdatedAt }),
    },
  );
}

export function createEntity(
  entityKey: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}`,
    {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify({ data }),
    },
  );
}

export function transitionEntity(
  entityKey: string,
  entityId: string,
  transitionKey: string,
) {
  return apiRequest<EntityRecord>(
    `/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}/transitions/${encodeURIComponent(transitionKey)}`,
    { method: 'POST' },
  );
}
