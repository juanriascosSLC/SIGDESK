import { apiRequest } from '@/lib/apiClient';

export interface WorkflowAssignmentConfig {
  mode: 'team' | 'user';
  department_id: string;
  team_id: string;
  assignee_user_id?: string;
  overwrite_existing: boolean;
}

/** Configuración de `cambiar_estado_ticket`.
 *
 *  Lleva la TRANSICIÓN y no el estado destino: el estado al que se llega lo
 *  decide la definición de Entity Builder con la que nació cada ticket, y una
 *  automatización no interpreta el lifecycle de otro módulo. */
export interface WorkflowStatusConfig {
  transition_key: string;
}

export type WorkflowRuleConfig = WorkflowAssignmentConfig | WorkflowStatusConfig | Record<string, unknown>;

/** Plan ejecutable: el contrato que gobierna el ORDEN de ejecución.
 *
 *  `layout` es presentación —posiciones, colores, bloques que todavía no se
 *  ejecutan— y el runtime no lo interpreta nunca. El plan es la traducción
 *  ejecutable de ese diagrama: un grafo sin ciclos, con identidad estable por
 *  nodo, que el backend valida al publicar y después es inmutable.
 *
 *  El id de un nodo de acción ES el id de su regla. Así el historial es por
 *  nodo sin inventar una segunda identidad, y el execution_id
 *  (`automation:<workflow>:<regla>:<ticket>`) conserva su forma. */
export interface WorkflowPlanNode {
  id: string;
  kind: 'trigger' | 'condition' | 'delay' | 'action';
  type?: string;
  expression?: { condicion: string };
  delay_seconds?: number;
  action?: string;
  next?: string[];
  on_true?: string[];
  on_false?: string[];
  on_omitted?: 'continue' | 'stop';
}

export interface WorkflowExecutionPlan {
  version: number;
  entrypoints: string[];
  nodes: WorkflowPlanNode[];
}

export interface WorkflowAssignmentDirectory {
  departments: Array<{ id: string; nombre: string }>;
  teams: Array<{ id: string; nombre: string; department_id: string }>;
  assignees: Array<{ id: string; nombre: string; email: string; team_id: string }>;
}

export interface WorkflowRule {
  id: string;
  accion: string;
  condicion?: string;
  demora_segundos?: number;
  config?: WorkflowRuleConfig;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_version: number;
  regla_id: string;
  ticket_id: string;
  accion: string;
  estado: 'en_ejecucion' | 'completada' | 'fallida' | 'omitida';
  intentos: number;
  ultimo_error?: string;
  motivo?: string;
  iniciada_en: string;
  finalizada_en?: string;
}

export interface WorkflowVisualLayout {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
}

/** Lo que envía el diseñador al guardar SIN publicar.
 *
 * `id` vacío crea un borrador; con `id` se actualiza el existente. Los ids de
 * las reglas viajan de vuelta para conservarlos: el runtime calcula el
 * execution_id a partir de workflow_id + regla_id, y regenerarlos en cada
 * guardado desligaría el historial de su regla. */
export interface SaveDraftInput {
  id?: string;
  /** La revisión que el editor leyó. Sin ella el backend no puede saber si
   *  alguien más guardó primero. */
  revision?: number;
  categoria_id: string;
  version: number;
  reglas: Array<{
    id?: string;
    accion: string;
    condicion: string;
    demora_segundos: number;
    config?: WorkflowRuleConfig;
  }>;
  layout?: WorkflowVisualLayout;
  /** Plan compilado del diagrama. Puede faltar en un borrador a medias; al
   *  publicar es obligatorio si el diagrama tiene conexiones. */
  execution_plan?: WorkflowExecutionPlan;
}

export interface PublishWorkflowInput {
  categoria_id: string;
  version: number;
  reglas: Array<{
    /** El id de la regla es el id del NODO del canvas.
     *
     *  No es un detalle de implementación: el plan ejecutable referencia el
     *  nodo, el execution_id se construye con el id de la regla, y el
     *  historial se agrupa por ella. Con ids distintos, el plan y las reglas
     *  hablarían de cosas distintas y el backend rechazaría la publicación. */
    id?: string;
    accion: string;
    condicion: string;
    demora_segundos: number;
    config?: WorkflowRuleConfig;
  }>;
  layout?: WorkflowVisualLayout;
  execution_plan?: WorkflowExecutionPlan;
}

export interface WorkflowDefinition {
  id: string;
  /** Identidad ESTABLE del workflow entre sus versiones.
   *
   *  `id` identifica una versión concreta; esto identifica el workflow. Es lo
   *  que permite tener a la vez varios workflows independientes en la misma
   *  categoría —asignación, notificación, escalamiento— y versionarlos por
   *  separado: publicar uno solo archiva a su propia predecesora. */
  workflow_family_id?: string;
  /** Control optimista del borrador. Debe reenviarse al guardar: es lo que
   *  impide que dos administradores editando a la vez se pisen en silencio. */
  revision?: number;
  categoria_id: string;
  version: number;
  estado: 'borrador' | 'publicado' | 'desactivado';
  fecha_publicacion?: string;
  reglas?: WorkflowRule[];
  layout?: WorkflowVisualLayout;
  /** Ausente en los workflows publicados antes de que el plan existiera: esos
   *  se ejecutan por el orden histórico (demora y después id de regla). El
   *  diseñador lo dice en pantalla en vez de dejar creer que sus conexiones
   *  mandan. */
  execution_plan?: WorkflowExecutionPlan;
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  const response = await apiRequest<{ items: WorkflowDefinition[] | null }>('/workflows');
  return response.items ?? [];
}

export function getWorkflow(id: string): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>(`/workflows/${encodeURIComponent(id)}`);
}

export function publishWorkflow(input: PublishWorkflowInput): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>('/workflows', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Guarda un borrador. No publica nada ni emite eventos. */
export function saveWorkflowDraft(input: SaveDraftInput): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>('/workflows/drafts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Abre un borrador nuevo desde una versión publicada.
 *
 *  Es lo que sustituye a "editar una versión publicada", que el backend rechaza
 *  con 409: esa versión es la que el runtime está ejecutando. El borrador nuevo
 *  hereda la familia y conserva los rule_id. */
export function createDraftFromVersion(id: string): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>(`/workflows/${encodeURIComponent(id)}/borradores`, {
    method: 'POST',
  });
}

/** Publica un borrador ya guardado, conservando su id y su versión. */
export function publishWorkflowDraft(id: string): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>(`/workflows/${encodeURIComponent(id)}/publicar`, {
    method: 'POST',
  });
}

export async function listWorkflowExecutions(id: string): Promise<WorkflowExecution[]> {
  const response = await apiRequest<{ items: WorkflowExecution[] | null }>(
    `/workflows/${encodeURIComponent(id)}/executions`,
  );
  return response.items ?? [];
}

export function deactivateWorkflow(id: string): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>(`/workflows/${encodeURIComponent(id)}/desactivar`, {
    method: 'POST',
  });
}

/** Una transición publicada del lifecycle de Entity Builder. */
export interface CatalogTransition {
  key: string;
  from: string;
  to: string;
  label?: string;
  /** Cuando la transición exige información adicional que una automatización
   *  no puede aportar —justificación de SLA al cerrar, motivo al reabrir—. */
  requiresInput?: boolean;
}

const ESTADOS_QUE_EXIGEN_DATOS = ['closed', 'cerrado', 'reopened', 'reabierto'];

/** Transiciones publicadas de una entidad, leídas de su definición ACTIVA.
 *
 *  Se leen de Entity Builder, que es su dueño, en vez de mantener una lista
 *  propia en Automations: una copia se desincroniza en el primer cambio de
 *  lifecycle y el diseñador ofrecería transiciones que ya no existen.
 *
 *  Ojo con lo que esto NO garantiza: la definición activa puede tener
 *  transiciones que la versión histórica de un ticket concreto no tenga. Quien
 *  decide eso es Tickets al ejecutar, contra la definición de ESE ticket. */
export async function listCatalogTransitions(entityKey: string): Promise<CatalogTransition[]> {
  const definicion = await apiRequest<{ specification?: Record<string, unknown> }>(
    `/catalog/definitions/${encodeURIComponent(entityKey)}`,
  );
  const lifecycle = (definicion.specification?.lifecycle ?? {}) as Record<string, unknown>;
  const crudas = Array.isArray(lifecycle.transitions) ? lifecycle.transitions : [];
  return crudas
    .map((cruda) => (cruda ?? {}) as Record<string, unknown>)
    .filter((cruda) => typeof cruda.key === 'string' && typeof cruda.from === 'string' && typeof cruda.to === 'string')
    .map((cruda) => ({
      key: String(cruda.key),
      from: String(cruda.from),
      to: String(cruda.to),
      label: typeof cruda.label === 'string' ? cruda.label : undefined,
      requiresInput: ESTADOS_QUE_EXIGEN_DATOS.includes(String(cruda.to).toLowerCase()),
    }));
}

export function getWorkflowAssignmentDirectory(): Promise<WorkflowAssignmentDirectory> {
  return apiRequest<WorkflowAssignmentDirectory>('/organization/assignment-directory?capability=tickets');
}
