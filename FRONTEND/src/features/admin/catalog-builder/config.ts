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
} from '@/features/catalog/metamodel';

export type Section = 'general' | 'fields' | 'detail' | 'workflow' | 'relations' | 'resources' | 'review' | 'advanced';

export const fieldTypes: Array<{ value: FieldType; label: string; description: string }> = [
  { value: 'text', label: 'Texto corto', description: 'Nombres, asuntos o identificadores' },
  { value: 'textarea', label: 'Texto largo', description: 'Descripciones y comentarios' },
  { value: 'select', label: 'Lista de opciones', description: 'Una opción de una lista controlada' },
  { value: 'boolean', label: 'Sí / No', description: 'Una confirmación o condición' },
  { value: 'number', label: 'Número', description: 'Cantidades y valores numéricos' },
  { value: 'date', label: 'Fecha', description: 'Una fecha seleccionable' },
  { value: 'datetime', label: 'Fecha y hora', description: 'Una ventana con fecha y hora' },
];

export const conditionOperators: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'equals', label: 'es igual a' },
  { value: 'notEquals', label: 'es diferente de' },
  { value: 'in', label: 'está dentro de' },
  { value: 'notIn', label: 'no está dentro de' },
  { value: 'exists', label: 'tiene un valor' },
  { value: 'notExists', label: 'no tiene valor' },
  { value: 'greaterThan', label: 'es mayor que' },
  { value: 'greaterThanOrEqual', label: 'es mayor o igual que' },
  { value: 'lessThan', label: 'es menor que' },
  { value: 'lessThanOrEqual', label: 'es menor o igual que' },
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
  { module: 'iam', resourceType: 'policy', label: 'Política de permisos', owner: 'Identidad y acceso' },
  { module: 'sla', resourceType: 'policy', label: 'Política de SLA', owner: 'Gestión de SLA' },
  { module: 'automations', resourceType: 'workflow', label: 'Automatización', owner: 'Automatizaciones' },
  { module: 'notifications', resourceType: 'template', label: 'Plantilla de notificación', owner: 'Notificaciones' },
  { module: 'integrations', resourceType: 'connector', label: 'Integración', owner: 'Integraciones' },
  { module: 'reports', resourceType: 'metric', label: 'Métrica de reporte', owner: 'Reportes' },
];

export const sectionItems: Array<{
  id: Section;
  label: string;
  description: string;
  icon: typeof Info;
}> = [
  { id: 'general', label: 'Información', description: 'Identidad y propósito', icon: Info },
  { id: 'fields', label: 'Campos', description: 'Datos que captura', icon: ListChecks },
  { id: 'detail', label: 'Diseñador de plantilla', description: 'Crear, Editar y Detalle', icon: LayoutDashboard },
  { id: 'workflow', label: 'Flujo de trabajo', description: 'Estados y movimientos', icon: GitBranch },
  { id: 'relations', label: 'Relaciones', description: 'Vínculos entre entidades', icon: GitBranch },
  { id: 'resources', label: 'Recursos', description: 'Permisos, SLA y módulos', icon: Link2 },
  { id: 'review', label: 'Revisar', description: 'Comprobar y guardar', icon: CheckCircle2 },
  { id: 'advanced', label: 'Avanzado', description: 'Especificación técnica', icon: Code2 },
];

export const guidedSteps = sectionItems.filter((item) => item.id !== 'advanced');

export function technicalKey(value: string, uppercase = false) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character: string) => character.toUpperCase())
    .replace(/[^a-zA-Z0-9_]/g, '');
  const safe = normalized.replace(/^[^a-zA-Z]+/, '');
  return uppercase ? safe.toUpperCase() : `${safe.charAt(0).toLowerCase()}${safe.slice(1)}`;
}

export function statusLabel(status?: string) {
  if (status === 'published') return 'Publicada';
  if (status === 'draft') return 'Borrador';
  if (status === 'deprecated' || status === 'archived') return 'Anterior';
  if (status === 'retired') return 'Retirada';
  return 'Nueva';
}

export function statusClasses(status?: string) {
  if (status === 'published') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (status === 'draft') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-surface-container-high text-on-surface-variant border-border/50';
}
