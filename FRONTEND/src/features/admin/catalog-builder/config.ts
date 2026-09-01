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
  /** Agrupa el selector. Una lista plana de once tipos no se lee. */
  group: 'Texto' | 'Opciones' | 'Números y fechas' | 'Contacto';
}> = [
  { value: 'text', label: 'Texto corto', description: 'Nombres, asuntos o identificadores', group: 'Texto' },
  { value: 'textarea', label: 'Texto largo', description: 'Descripciones y comentarios', group: 'Texto' },
  { value: 'select', label: 'Lista desplegable', description: 'Una opción de una lista controlada', group: 'Opciones' },
  { value: 'radio', label: 'Opciones visibles', description: 'Una opción, todas a la vista', group: 'Opciones' },
  { value: 'multiselect', label: 'Selección múltiple', description: 'Varias opciones de una lista', group: 'Opciones' },
  { value: 'boolean', label: 'Sí / No', description: 'Una confirmación o condición', group: 'Opciones' },
  { value: 'number', label: 'Número', description: 'Cantidades y valores numéricos', group: 'Números y fechas' },
  { value: 'date', label: 'Fecha', description: 'Una fecha seleccionable', group: 'Números y fechas' },
  { value: 'datetime', label: 'Fecha y hora', description: 'Una ventana con fecha y hora', group: 'Números y fechas' },
  { value: 'email', label: 'Correo electrónico', description: 'Se valida el formato en el servidor', group: 'Contacto' },
  { value: 'phone', label: 'Teléfono', description: 'Dígitos, espacios y prefijo internacional', group: 'Contacto' },
  { value: 'url', label: 'Enlace', description: 'Una dirección http o https', group: 'Contacto' },
];

export const fieldTypeGroups = ['Texto', 'Opciones', 'Números y fechas', 'Contacto'] as const;

/** Los formatos que se pueden exigir sobre un campo de texto ya publicado,
 *  sin cambiarle el tipo. Los resuelve el servidor. */
export const textFormatOptions: Array<{ value: '' | 'email' | 'phone' | 'url'; label: string }> = [
  { value: '', label: 'Sin formato exigido' },
  { value: 'email', label: 'Correo electrónico' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'url', label: 'Enlace http/https' },
];

/** Etiqueta corta de un tipo, para el resumen de una tarjeta colapsada. */
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
  { value: '', label: 'Ninguno', description: 'Un campo normal de la definición' },
  {
    value: 'recursoId',
    label: 'Recurso legado',
    description: 'Compatibilidad con recursos creados manualmente',
  },
  {
    value: 'siteAssetId',
    label: 'Sitio de Inventory',
    description: 'Sitio real sincronizado desde Assets / CMDB',
  },
  {
    value: 'assetId',
    label: 'Dispositivo del sitio',
    description: 'Cámara, NVR, switch, servidor u otro activo del sitio elegido',
  },
  {
    value: 'agenteItId',
    label: 'Agente IT',
    description: 'Referencia real a un agente de soporte registrado en organization_service',
  },
];

export const resourceTypeOptions: Array<{ value: ResourceTypeFilter | ''; label: string }> = [
  { value: '', label: 'Cualquier tipo' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'software_licencia', label: 'Licencia de software' },
  { value: 'infraestructura_red', label: 'Infraestructura de red' },
  { value: 'camera', label: 'Cámara' },
  { value: 'nvr', label: 'NVR' },
  { value: 'server', label: 'Servidor' },
  { value: 'switch', label: 'Switch' },
  { value: 'router', label: 'Router' },
  { value: 'pdu', label: 'PDU' },
  { value: 'access-point', label: 'Punto de acceso' },
  { value: 'access-control', label: 'Control de acceso' },
  { value: 'radio', label: 'Radio' },
  { value: 'speaker', label: 'Altavoz' },
  { value: 'software', label: 'Software / sistema' },
  { value: 'site', label: 'Sitio' },
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
  { id: 'general', label: 'Información general', description: 'Nombre, código y propósito', icon: Info },
  { id: 'fields', label: 'Campos del formulario', description: 'Qué datos deben completar', icon: ListChecks },
  { id: 'detail', label: 'Diseño visual', description: 'Dónde aparece cada elemento', icon: LayoutDashboard },
  { id: 'workflow', label: 'Estados y transiciones', description: 'Ciclo de vida del registro', icon: GitBranch },
  { id: 'relations', label: 'Relaciones ITSM', description: 'Vínculos INC, PRB y RFC', icon: GitBranch },
  { id: 'resources', label: 'Módulos conectados', description: 'IAM, SLA y automatizaciones', icon: Link2 },
  { id: 'review', label: 'Validar y publicar', description: 'Revisar antes de activar', icon: CheckCircle2 },
  { id: 'advanced', label: 'Configuración avanzada', description: 'JSON para usuarios expertos', icon: Code2 },
];

export const guidedSteps = sectionItems.filter((item) => item.id !== 'advanced');

// `technicalKey` se movio a features/catalog/field-types.ts, un modulo sin
// dependencias, para que la logica pura del editor de campos se pueda
// verificar desde Node. Se reexporta desde aqui porque medio builder la
// importa por esta ruta.
export { technicalKey } from '@/features/catalog/field-types';

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
