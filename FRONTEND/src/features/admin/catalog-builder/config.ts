import {
  CheckCircle2,
  Code2,
  GitBranch,
  Info,
  LayoutDashboard,
  Link2,
  ListChecks,
} from 'lucide-react';
import type {
  ConditionExpression,
  ConditionOperator,
  FieldDefinition,
  FieldType,
  ResourceTypeFilter,
} from '@/features/catalog/metamodel';

export type Section = 'general' | 'fields' | 'detail' | 'workflow' | 'relations' | 'resources' | 'review' | 'advanced';

export const fieldTypes: Array<{
  value: FieldType;
  label: string;
  description: string;
  /** Groups the selector. A flat list of eleven types is unreadable. */
  group: 'Text' | 'Options' | 'Numbers & Dates' | 'Contact';
}> = [
  { value: 'text', label: 'Short text', description: 'Names, subjects, or identifiers', group: 'Text' },
  { value: 'textarea', label: 'Long text', description: 'Descriptions and comments', group: 'Text' },
  { value: 'select', label: 'Dropdown list', description: 'One option from a controlled list', group: 'Options' },
  { value: 'radio', label: 'Radio options', description: 'One option, all visible', group: 'Options' },
  { value: 'multiselect', label: 'Multiple selection', description: 'Multiple options from a list', group: 'Options' },
  { value: 'boolean', label: 'Yes / No', description: 'A confirmation or condition', group: 'Options' },
  { value: 'number', label: 'Number', description: 'Quantities and numeric values', group: 'Numbers & Dates' },
  { value: 'date', label: 'Date', description: 'A selectable date', group: 'Numbers & Dates' },
  { value: 'datetime', label: 'Date and time', description: 'A date and time window', group: 'Numbers & Dates' },
  { value: 'email', label: 'Email address', description: 'Format validated on server', group: 'Contact' },
  { value: 'phone', label: 'Phone', description: 'Digits, spaces, and international prefix', group: 'Contact' },
  { value: 'url', label: 'Link', description: 'An http or https address', group: 'Contact' },
];

export const fieldTypeGroups = ['Text', 'Options', 'Numbers & Dates', 'Contact'] as const;

/** Formats that can be required on an already published text field without changing its type. */
export const textFormatOptions: Array<{ value: '' | 'email' | 'phone' | 'url'; label: string }> = [
  { value: '', label: 'No required format' },
  { value: 'email', label: 'Email address' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'HTTP/HTTPS link' },
];

/** Short label for a type, for collapsed card summaries. */
export function fieldTypeLabel(type: FieldType): string {
  return fieldTypes.find((candidate) => candidate.value === type)?.label ?? type;
}

// TODO-103 — control separado de "vincular a" (bindsTo), no un FieldType
// nuevo (ver metamodel.ts para el porqué). Label deliberadamente "Activo /
// Recurso IT", NUNCA "Recurso" a secas — colisiona con "Recursos conectados"
// de ResourcesEditor.tsx (pestaña "Recursos" de este mismo editor, concepto
// completamente distinto: bindings de SLA/automatización/notificaciones).
export const bindsToOptions: Array<{
  value: FieldDefinition['bindsTo'] | '';
  label: string;
  description: string;
}> = [
  { value: '', label: 'None', description: 'A standard definition field' },
  {
    value: 'recursoId',
    label: 'Legacy resource',
    description: 'Compatibility with manually created resources',
  },
  {
    value: 'siteAssetId',
    label: 'Inventory site',
    description: 'Real site synced from Assets / CMDB',
  },
  {
    value: 'assetId',
    label: 'Site device',
    description: 'Camera, NVR, switch, server, or other asset from selected site',
  },
  {
    value: 'agenteItId',
    label: 'IT Agent',
    description: 'Real reference to a support agent registered in organization_service',
  },
];

export const resourceTypeOptions: Array<{ value: ResourceTypeFilter | ''; label: string }> = [
  { value: '', label: 'Any type' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'software_licencia', label: 'Software license' },
  { value: 'infraestructura_red', label: 'Network infrastructure' },
  { value: 'camera', label: 'Camera' },
  { value: 'nvr', label: 'NVR' },
  { value: 'server', label: 'Server' },
  { value: 'switch', label: 'Switch' },
  { value: 'router', label: 'Router' },
  { value: 'pdu', label: 'PDU' },
  { value: 'access-point', label: 'Access Point' },
  { value: 'access-control', label: 'Access Control' },
  { value: 'radio', label: 'Radio' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'software', label: 'Software / system' },
  { value: 'site', label: 'Site' },
];

export const conditionOperators: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'in', label: 'is in' },
  { value: 'notIn', label: 'is not in' },
  { value: 'exists', label: 'has a value' },
  { value: 'notExists', label: 'has no value' },
  { value: 'greaterThan', label: 'is greater than' },
  { value: 'greaterThanOrEqual', label: 'is greater than or equal to' },
  { value: 'lessThan', label: 'is less than' },
  { value: 'lessThanOrEqual', label: 'is less than or equal to' },
];

export function replaceConditionField(
  condition: ConditionExpression | undefined,
  previous: string,
  next: string,
): ConditionExpression | undefined {
  if (!condition) return undefined;
  return {
    ...condition,
    field: condition.field === previous ? next : condition.field,
    all: condition.all?.map((child) => replaceConditionField(child, previous, next)!),
    any: condition.any?.map((child) => replaceConditionField(child, previous, next)!),
  };
}

export function conditionReferences(
  condition: ConditionExpression | undefined,
  fieldKey: string,
): boolean {
  if (!condition) return false;
  return condition.field === fieldKey ||
    Boolean(condition.all?.some((child) => conditionReferences(child, fieldKey))) ||
    Boolean(condition.any?.some((child) => conditionReferences(child, fieldKey)));
}

export function defaultConditionValue(field?: FieldDefinition): unknown {
  if (field?.type === 'boolean') return true;
  if (field?.type === 'number') return 0;
  if (field?.type === 'select') return field.options?.[0]?.value ?? '';
  return '';
}

export function parseConditionValue(field: FieldDefinition, value: string): unknown {
  if (field.type === 'number') return Number(value);
  if (field.type === 'boolean') return value.toLowerCase() === 'true';
  return value;
}

export const bindingKinds = [
  { module: 'iam', resourceType: 'policy', label: 'Permissions Policy', owner: 'Identity & Access' },
  { module: 'sla', resourceType: 'policy', label: 'SLA Policy', owner: 'SLA Management' },
  { module: 'automations', resourceType: 'workflow', label: 'Automation', owner: 'Automations' },
  { module: 'notifications', resourceType: 'template', label: 'Notification Template', owner: 'Notifications' },
  { module: 'integrations', resourceType: 'connector', label: 'Integration', owner: 'Integrations' },
  { module: 'reports', resourceType: 'metric', label: 'Report Metric', owner: 'Reports' },
];

export const sectionItems: Array<{
  id: Section;
  label: string;
  description: string;
  icon: typeof Info;
}> = [
  { id: 'general', label: 'General Information', description: 'Name, code, and purpose', icon: Info },
  { id: 'fields', label: 'Form Fields', description: 'Data that must be completed', icon: ListChecks },
  { id: 'detail', label: 'Visual Design', description: 'Where each element appears', icon: LayoutDashboard },
  { id: 'workflow', label: 'States & Transitions', description: 'Record lifecycle', icon: GitBranch },
  { id: 'relations', label: 'Related Cases', description: 'INC, PRB, and RFC links', icon: GitBranch },
  { id: 'resources', label: 'Connected Modules', description: 'IAM, SLA, and automations', icon: Link2 },
  { id: 'review', label: 'Validate & Publish', description: 'Review before activating', icon: CheckCircle2 },
  { id: 'advanced', label: 'Advanced Settings', description: 'JSON for expert users', icon: Code2 },
];

export const guidedSteps = sectionItems.filter((item) => item.id !== 'advanced');

// `technicalKey` se movio a features/catalog/field-types.ts, un modulo sin
// dependencias, para que la logica pura del editor de campos se pueda
// verificar desde Node. Se reexporta desde aqui porque medio builder la
// importa por esta ruta.
export { technicalKey } from '@/features/catalog/field-types';

export function statusLabel(status?: string) {
  if (status === 'published') return 'Published';
  if (status === 'draft') return 'Draft';
  if (status === 'deprecated' || status === 'archived') return 'Previous';
  if (status === 'retired') return 'Retired';
  return 'New';
}

export function statusClasses(status?: string) {
  if (status === 'published') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (status === 'draft') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-surface-container-high text-on-surface-variant border-border/50';
}
