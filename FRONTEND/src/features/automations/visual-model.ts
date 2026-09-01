import type { Edge } from '@xyflow/react';
import type {
  PublishWorkflowInput,
  WorkflowAssignmentConfig,
  WorkflowDefinition,
  WorkflowRule,
  WorkflowVisualLayout,
} from './api';
import type { WorkflowNode, WorkflowNodeData } from './CustomNodes';

export type CatalogGroup = 'Disparadores' | 'Condiciones' | 'Control' | 'Acciones';
export type SupportStatus = 'operational' | 'planned';

export interface WorkflowCatalogItem {
  key: string;
  group: CatalogGroup;
  nodeType: 'trigger' | 'condition' | 'delay' | 'action' | 'approval' | 'foreach' | 'parser';
  title: string;
  description: string;
  support: SupportStatus;
  color: 'cyan' | 'amber' | 'blue' | 'emerald' | 'purple' | 'pink';
  defaults?: Partial<WorkflowNodeData>;
}

export const workflowCatalog: WorkflowCatalogItem[] = [
  { key: 'ticket.created', group: 'Disparadores', nodeType: 'trigger', title: 'INC creado', description: 'Al registrar un incidente.', support: 'operational', color: 'cyan' },
  { key: 'ticket.status_changed', group: 'Disparadores', nodeType: 'trigger', title: 'Estado modificado', description: 'Al transicionar un ticket.', support: 'planned', color: 'cyan' },
  { key: 'ticket.assigned', group: 'Disparadores', nodeType: 'trigger', title: 'Ticket asignado', description: 'Al cambiar responsable o equipo.', support: 'planned', color: 'cyan' },
  { key: 'ticket.comment_added', group: 'Disparadores', nodeType: 'trigger', title: 'Comentario agregado', description: 'Al registrar actividad.', support: 'planned', color: 'cyan' },
  { key: 'ticket.sla_at_risk', group: 'Disparadores', nodeType: 'trigger', title: 'SLA en riesgo', description: 'Al alcanzar un umbral SLA.', support: 'planned', color: 'cyan' },
  { key: 'problem.created', group: 'Disparadores', nodeType: 'trigger', title: 'PRB creado', description: 'Al abrir una investigación.', support: 'planned', color: 'cyan' },
  { key: 'change.created', group: 'Disparadores', nodeType: 'trigger', title: 'RFC creado', description: 'Al registrar un cambio.', support: 'planned', color: 'cyan' },
  { key: 'task.overdue', group: 'Disparadores', nodeType: 'trigger', title: 'Task vencida', description: 'Cuando vence una tarea RFC.', support: 'planned', color: 'cyan' },

  { key: 'condition.priority', group: 'Condiciones', nodeType: 'condition', title: 'Prioridad', description: 'Baja, media, alta o crítica.', support: 'operational', color: 'amber', defaults: { conditionMode: 'priority', priority: 'critica' } },
  { key: 'condition.status', group: 'Condiciones', nodeType: 'condition', title: 'Estado', description: 'Compara el estado actual.', support: 'planned', color: 'amber' },
  { key: 'condition.site', group: 'Condiciones', nodeType: 'condition', title: 'Sitio', description: 'Filtra por sitio afectado.', support: 'planned', color: 'amber' },
  { key: 'condition.device_type', group: 'Condiciones', nodeType: 'condition', title: 'Tipo de dispositivo', description: 'Cámara, NVR, switch, PDU…', support: 'planned', color: 'amber' },
  { key: 'condition.team', group: 'Condiciones', nodeType: 'condition', title: 'Equipo o área', description: 'Responsable o interesado.', support: 'planned', color: 'amber' },
  { key: 'condition.custom_field', group: 'Condiciones', nodeType: 'condition', title: 'Campo dinámico', description: 'Evalúa un campo del Catalog Builder.', support: 'planned', color: 'amber' },
  { key: 'condition.sla_percent', group: 'Condiciones', nodeType: 'condition', title: 'Consumo de SLA', description: 'Compara porcentaje consumido.', support: 'planned', color: 'amber' },

  { key: 'control.delay', group: 'Control', nodeType: 'delay', title: 'Esperar', description: 'Temporizador durable de Temporal.', support: 'operational', color: 'blue', defaults: { delayValue: '15', delayUnit: 'minutes' } },
  { key: 'control.approval', group: 'Control', nodeType: 'approval', title: 'Solicitar aprobación', description: 'Pausa hasta aprobar o rechazar.', support: 'planned', color: 'purple' },
  { key: 'control.foreach', group: 'Control', nodeType: 'foreach', title: 'Por cada elemento', description: 'Itera dispositivos o relaciones.', support: 'planned', color: 'cyan' },
  { key: 'control.parser', group: 'Control', nodeType: 'parser', title: 'Transformar datos', description: 'Mapea variables para una acción.', support: 'planned', color: 'pink' },

  { key: 'action.notify_stakeholders', group: 'Acciones', nodeType: 'action', title: 'Notificar interesados', description: 'Creador, personas y áreas interesadas.', support: 'operational', color: 'emerald', defaults: { actionType: 'notify', title: 'Notificar interesados' } },
  { key: 'action.assign_user', group: 'Acciones', nodeType: 'action', title: 'Asignar persona', description: 'Asigna un responsable concreto.', support: 'planned', color: 'emerald', defaults: { assignmentMode: 'user', overwriteExisting: false } },
  { key: 'action.assign_team', group: 'Acciones', nodeType: 'action', title: 'Asignar equipo', description: 'Envía el trabajo a un equipo.', support: 'planned', color: 'emerald', defaults: { assignmentMode: 'team', overwriteExisting: false } },
  { key: 'action.add_stakeholder', group: 'Acciones', nodeType: 'action', title: 'Agregar interesado', description: 'Añade persona o área interesada.', support: 'planned', color: 'emerald' },
  { key: 'action.change_status', group: 'Acciones', nodeType: 'action', title: 'Cambiar estado', description: 'Solicita una transición válida.', support: 'planned', color: 'emerald' },
  { key: 'action.change_priority', group: 'Acciones', nodeType: 'action', title: 'Cambiar prioridad', description: 'Actualiza la prioridad del ticket.', support: 'planned', color: 'emerald' },
  { key: 'action.add_comment', group: 'Acciones', nodeType: 'action', title: 'Agregar comentario', description: 'Registra actividad automática.', support: 'planned', color: 'emerald' },
  { key: 'action.create_prb', group: 'Acciones', nodeType: 'action', title: 'Crear PRB', description: 'Abre un problema relacionado.', support: 'planned', color: 'emerald' },
  { key: 'action.create_rfc', group: 'Acciones', nodeType: 'action', title: 'Crear RFC', description: 'Abre un cambio relacionado.', support: 'planned', color: 'emerald' },
  { key: 'action.create_task', group: 'Acciones', nodeType: 'action', title: 'Crear Task', description: 'Crea trabajo multiárea en un RFC.', support: 'planned', color: 'emerald' },
  { key: 'action.webhook', group: 'Acciones', nodeType: 'action', title: 'Invocar webhook', description: 'Llama una integración publicada.', support: 'planned', color: 'purple' },
];

export function catalogItem(key: string) {
  return workflowCatalog.find((item) => item.key === key);
}

export function nodeFromCatalog(item: WorkflowCatalogItem, position: { x: number; y: number }): WorkflowNode {
  return {
    id: crypto.randomUUID(),
    type: item.nodeType,
    position,
    data: {
      catalogKey: item.key,
      label: item.title,
      title: item.title,
      description: item.description,
      supportStatus: item.support,
      color: item.color,
      ...item.defaults,
    },
  };
}

function secondsFromNode(node?: WorkflowNode): number {
  if (!node) return 0;
  const value = Math.max(0, Number(node.data.delayValue ?? 0));
  const unit = String(node.data.delayUnit ?? 'minutes');
  return Math.round(value * (unit === 'hours' ? 3600 : unit === 'days' ? 86400 : unit === 'seconds' ? 1 : 60));
}

function ancestorsOf(nodeID: string, nodes: WorkflowNode[], edges: Edge[]) {
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const result: WorkflowNode[] = [];
  const queue = [nodeID];
  const visited = new Set<string>([nodeID]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges.filter((candidate) => candidate.target === current)) {
      if (visited.has(edge.source)) continue;
      visited.add(edge.source);
      const source = byID.get(edge.source);
      if (source) result.push(source);
      queue.push(edge.source);
    }
  }
  return result;
}

export interface CompilationResult {
  payload?: PublishWorkflowInput;
  errors: string[];
  warnings: string[];
}

export function compileVisualWorkflow(nodes: WorkflowNode[], edges: Edge[], version: number): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const triggers = nodes.filter((node) => node.type === 'trigger' && node.data.catalogKey === 'ticket.created');
  const actions = nodes.filter((node) => node.type === 'action'
    && node.data.supportStatus === 'operational'
    && ['action.notify_stakeholders', 'action.assign_user', 'action.assign_team'].includes(String(node.data.catalogKey)));
  if (triggers.length !== 1) errors.push('El flujo debe tener exactamente un disparador operativo “INC creado”.');
  if (actions.length === 0) errors.push('Conecta al menos una acción operativa.');

  const connectedIDs = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of nodes.filter((candidate) => candidate.data.supportStatus === 'planned')) {
    if (connectedIDs.has(node.id)) errors.push(`“${String(node.data.label)}” está en preparación y todavía no puede publicarse.`);
    else warnings.push(`“${String(node.data.label)}” está en el canvas como diseño futuro, pero no se publicará.`);
  }

  const rules: PublishWorkflowInput['reglas'] = [];
  for (const action of actions) {
    const ancestors = ancestorsOf(action.id, nodes, edges);
    if (!ancestors.some((node) => triggers.some((trigger) => trigger.id === node.id))) {
      errors.push(`La acción “${String(action.data.label)}” no está conectada al disparador.`);
      continue;
    }
    const conditions = ancestors.filter((node) => node.type === 'condition' && node.data.supportStatus === 'operational');
    const delays = ancestors.filter((node) => node.type === 'delay' && node.data.supportStatus === 'operational');
    if (conditions.length > 1) errors.push('Cada rama publicable admite una condición operativa en esta versión.');
    if (delays.length > 1) errors.push('Cada rama publicable admite una sola espera durable en esta versión.');
    const condition = conditions[0];
    const conditionText = condition
      ? (condition.data.conditionMode === 'always' ? 'siempre' : `prioridad == ${String(condition.data.priority ?? 'critica')}`)
      : 'siempre';
    const delaySeconds = secondsFromNode(delays[0]);
    if (delaySeconds > 2_592_000) errors.push('La espera máxima publicable es de 30 días.');
    if (action.data.catalogKey === 'action.notify_stakeholders') {
      rules.push({ accion: 'notificar_interesados', condicion: conditionText, demora_segundos: delaySeconds });
      continue;
    }

    const mode = action.data.catalogKey === 'action.assign_user' ? 'user' : 'team';
    const departmentID = String(action.data.departmentId ?? '');
    const teamID = String(action.data.teamId ?? '');
    const assigneeUserID = String(action.data.assigneeUserId ?? '');
    if (!departmentID || !teamID || (mode === 'user' && !assigneeUserID)) {
      errors.push(mode === 'user'
        ? `Completa área, equipo y persona en “${String(action.data.label)}”.`
        : `Completa área y equipo en “${String(action.data.label)}”.`);
      continue;
    }
    if ([departmentID, teamID, assigneeUserID].some((id) => id && id !== id.trim())) {
      errors.push(`La asignación “${String(action.data.label)}” contiene identificadores no normalizados.`);
      continue;
    }
    rules.push({
      accion: 'asignar_automatico',
      condicion: conditionText,
      demora_segundos: delaySeconds,
      config: {
        mode,
        department_id: departmentID,
        team_id: teamID,
        ...(mode === 'user' ? { assignee_user_id: assigneeUserID } : {}),
        overwrite_existing: action.data.overwriteExisting === true,
      },
    });
  }

  if (errors.length > 0) return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  const layout: WorkflowVisualLayout = {
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data: { ...data } })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })),
  };
  return {
    errors,
    warnings: [...new Set(warnings)],
    payload: { categoria_id: 'INC', version, reglas: rules, layout },
  };
}

function assignmentConfig(config: WorkflowRule['config']): WorkflowAssignmentConfig | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const candidate = config as Partial<WorkflowAssignmentConfig>;
  if ((candidate.mode !== 'team' && candidate.mode !== 'user')
    || typeof candidate.department_id !== 'string'
    || typeof candidate.team_id !== 'string') return undefined;
  if (candidate.mode === 'user' && typeof candidate.assignee_user_id !== 'string') return undefined;
  return {
    mode: candidate.mode,
    department_id: candidate.department_id,
    team_id: candidate.team_id,
    assignee_user_id: candidate.assignee_user_id,
    overwrite_existing: candidate.overwrite_existing === true,
  };
}

function actionFromRule(rule: WorkflowRule, position: { x: number; y: number }): WorkflowNode {
  if (rule.accion === 'notificar_interesados') {
    return nodeFromCatalog(catalogItem('action.notify_stakeholders')!, position);
  }
  if (rule.accion === 'asignar_automatico') {
    const config = assignmentConfig(rule.config);
    const key = config?.mode === 'user' ? 'action.assign_user' : 'action.assign_team';
    const node = nodeFromCatalog(catalogItem(key)!, position);
    // Una regla que ya fue publicada por el backend es ejecutable aunque el
    // editor todavía no permita crear otra hasta disponer del directorio
    // autenticado de Organization. El modo read-only no debe presentarla
    // erróneamente como una idea futura ni perder sus identificadores.
    node.data.supportStatus = 'operational';
    node.data.assignmentMode = config?.mode;
    node.data.departmentId = config?.department_id;
    node.data.teamId = config?.team_id;
    node.data.assigneeUserId = config?.assignee_user_id;
    node.data.overwriteExisting = config?.overwrite_existing ?? false;
    return node;
  }
  return {
    id: crypto.randomUUID(),
    type: 'action',
    position,
    data: {
      catalogKey: `published.${rule.accion}`,
      label: rule.accion,
      title: rule.accion,
      description: 'Acción publicada conservada por compatibilidad.',
      supportStatus: 'operational',
      color: 'emerald',
    },
  };
}

export function graphFromDefinition(definition: WorkflowDefinition): { nodes: WorkflowNode[]; edges: Edge[] } {
  if (definition.layout?.nodes?.length) {
    return {
      nodes: definition.layout.nodes as WorkflowNode[],
      edges: definition.layout.edges as Edge[],
    };
  }
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 80, y: 160 });
  trigger.id = 'trigger-published';
  const nodes: WorkflowNode[] = [trigger];
  const edges: Edge[] = [];
  (definition.reglas ?? []).forEach((rule, index) => {
    const y = 70 + index * 230;
    const condition = nodeFromCatalog(catalogItem('condition.priority')!, { x: 400, y });
    condition.id = `condition-${rule.id}`;
    if (!rule.condicion || rule.condicion === 'siempre') {
      condition.data.conditionMode = 'always';
      condition.data.label = 'Siempre';
    } else {
      condition.data.priority = rule.condicion.split('==')[1]?.trim() || 'critica';
    }
    const action = actionFromRule(rule, { x: (rule.demora_segundos ?? 0) > 0 ? 980 : 700, y });
    action.id = `action-${rule.id}`;
    nodes.push(condition, action);
    edges.push({ id: `e-trigger-${rule.id}`, source: trigger.id, target: condition.id, animated: true });
    let previous = condition.id;
    if ((rule.demora_segundos ?? 0) > 0) {
      const delay = nodeFromCatalog(catalogItem('control.delay')!, { x: 690, y });
      delay.id = `delay-${rule.id}`;
      delay.data.delayValue = String(rule.demora_segundos);
      delay.data.delayUnit = 'seconds';
      nodes.push(delay);
      edges.push({ id: `e-condition-delay-${rule.id}`, source: condition.id, target: delay.id, animated: true });
      previous = delay.id;
    }
    edges.push({ id: `e-action-${rule.id}`, source: previous, target: action.id, animated: true });
  });
  return { nodes, edges };
}
