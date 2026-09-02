import type { Edge } from '@xyflow/react';
import type {
  PublishWorkflowInput,
  WorkflowAssignmentConfig,
  WorkflowDefinition,
  WorkflowExecutionPlan,
  WorkflowPlanNode,
  WorkflowRule,
  WorkflowStatusConfig,
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
  // Un solo bloque, con el modo dentro del panel. Antes eran dos entradas
  // separadas ("Asignar persona" y "Asignar equipo") y ambas estaban en
  // preparación porque faltaba el directorio autenticado de Organization. Ya
  // existe, así que la acción pasa a ser funcional; y se unifica porque elegir
  // entre equipo y persona es una propiedad de la asignación, no dos bloques
  // distintos: separarlas obligaba a borrar el nodo y volver a configurarlo
  // entero solo para cambiar de modo.
  { key: 'action.assign', group: 'Acciones', nodeType: 'action', title: 'Asignar automáticamente', description: 'Envía el trabajo a un área, equipo o persona.', support: 'operational', color: 'emerald', defaults: { assignmentMode: 'team', overwriteExisting: false } },
  { key: 'action.add_stakeholder', group: 'Acciones', nodeType: 'action', title: 'Agregar interesado', description: 'Añade persona o área interesada.', support: 'planned', color: 'emerald' },
  // Operativo desde ADR-0038: hay runtime real detrás
  // (`cambiar_estado_ticket` → POST /internal/tickets/state), y es una
  // operación INDEPENDIENTE de la asignación. Antes de eso el bloque estaba en
  // preparación a propósito: la única ruta a `en_progreso` pasaba por asignar,
  // así que ofrecerlo habría prometido algo que el backend no hacía.
  { key: 'action.change_status', group: 'Acciones', nodeType: 'action', title: 'Cambiar estado', description: 'Solicita una transición publicada del lifecycle.', support: 'operational', color: 'emerald', defaults: { actionType: 'changeStatus' } },
  { key: 'action.change_priority', group: 'Acciones', nodeType: 'action', title: 'Cambiar prioridad', description: 'Actualiza la prioridad del ticket.', support: 'planned', color: 'emerald' },
  { key: 'action.add_comment', group: 'Acciones', nodeType: 'action', title: 'Agregar comentario', description: 'Registra actividad automática.', support: 'planned', color: 'emerald' },
  { key: 'action.create_prb', group: 'Acciones', nodeType: 'action', title: 'Crear PRB', description: 'Abre un problema relacionado.', support: 'planned', color: 'emerald' },
  { key: 'action.create_rfc', group: 'Acciones', nodeType: 'action', title: 'Crear RFC', description: 'Abre un cambio relacionado.', support: 'planned', color: 'emerald' },
  { key: 'action.create_task', group: 'Acciones', nodeType: 'action', title: 'Crear Task', description: 'Crea trabajo multiárea en un RFC.', support: 'planned', color: 'emerald' },
  { key: 'action.webhook', group: 'Acciones', nodeType: 'action', title: 'Invocar webhook', description: 'Llama una integración publicada.', support: 'planned', color: 'purple' },
];

/** Claves que ya no están en la paleta pero sí en diagramas guardados.
 *
 * Un borrador guardado antes de unificar el bloque trae `action.assign_user` o
 * `action.assign_team`. Resolverlas al bloque nuevo conservando su modo es lo
 * que impide que recargar un diagrama viejo pierda nodos. */
const clavesHistoricasDeAsignacion: Record<string, 'user' | 'team'> = {
  'action.assign_user': 'user',
  'action.assign_team': 'team',
};

export function esAccionDeAsignacion(key: unknown): boolean {
  const clave = String(key ?? '');
  return clave === 'action.assign' || clave in clavesHistoricasDeAsignacion;
}

export function catalogItem(key: string) {
  const directo = workflowCatalog.find((item) => item.key === key);
  if (directo) return directo;
  const modo = clavesHistoricasDeAsignacion[key];
  if (!modo) return undefined;
  const unificado = workflowCatalog.find((item) => item.key === 'action.assign');
  if (!unificado) return undefined;
  return { ...unificado, defaults: { ...unificado.defaults, assignmentMode: modo } };
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

/** Un problema del diagrama, atado al nodo que lo causa cuando se puede.
 *
 * `errors` sigue existiendo como lista de textos porque es lo que consume el
 * resumen de validación; `issues` es lo que permite RESALTAR el nodo culpable y
 * enfocarlo al pulsar el error. Sin el id, la persona lee "completa área y
 * equipo" y tiene que buscar a mano en qué bloque de un diagrama grande. */
export interface WorkflowIssue {
  nodeId?: string;
  message: string;
}

export interface CompilationResult {
  payload?: PublishWorkflowInput;
  errors: string[];
  warnings: string[];
  issues: WorkflowIssue[];
}

export function compileVisualWorkflow(nodes: WorkflowNode[], edges: Edge[], version: number): CompilationResult {
  const issues: WorkflowIssue[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const fallar = (message: string, nodeId?: string) => {
    errors.push(message);
    issues.push({ nodeId, message });
  };
  const triggers = nodes.filter((node) => node.type === 'trigger' && node.data.catalogKey === 'ticket.created');
  const actions = nodes.filter((node) => node.type === 'action'
    && node.data.supportStatus === 'operational'
    && (String(node.data.catalogKey) === 'action.notify_stakeholders'
      || String(node.data.catalogKey) === 'action.change_status'
      || esAccionDeAsignacion(node.data.catalogKey)));
  if (triggers.length !== 1) fallar('El flujo debe tener exactamente un disparador operativo “INC creado”.');
  if (actions.length === 0) fallar('Conecta al menos una acción operativa.');

  const connectedIDs = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of nodes.filter((candidate) => candidate.data.supportStatus === 'planned')) {
    if (connectedIDs.has(node.id)) fallar(`“${String(node.data.label)}” está en preparación y todavía no puede publicarse.`, node.id);
    else warnings.push(`“${String(node.data.label)}” está en el canvas como diseño futuro, pero no se publicará.`);
  }

  const rules: PublishWorkflowInput['reglas'] = [];
  for (const action of actions) {
    const ancestors = ancestorsOf(action.id, nodes, edges);
    if (!ancestors.some((node) => triggers.some((trigger) => trigger.id === node.id))) {
      fallar(`La acción “${String(action.data.label)}” no está conectada al disparador.`, action.id);
      continue;
    }
    const conditions = ancestors.filter((node) => node.type === 'condition' && node.data.supportStatus === 'operational');
    const delays = ancestors.filter((node) => node.type === 'delay' && node.data.supportStatus === 'operational');
    if (conditions.length > 1) fallar('Cada rama publicable admite una condición operativa en esta versión.', action.id);
    if (delays.length > 1) fallar('Cada rama publicable admite una sola espera durable en esta versión.', action.id);
    const condition = conditions[0];
    const conditionText = condition
      ? (condition.data.conditionMode === 'always' ? 'siempre' : `prioridad == ${String(condition.data.priority ?? 'critica')}`)
      : 'siempre';
    const delaySeconds = secondsFromNode(delays[0]);
    if (delaySeconds > 2_592_000) fallar('La espera máxima publicable es de 30 días.', delays[0]?.id);
    if (String(action.data.catalogKey) === 'action.notify_stakeholders') {
      rules.push({ id: action.id, accion: 'notificar_interesados', condicion: conditionText, demora_segundos: delaySeconds });
      continue;
    }

    if (String(action.data.catalogKey) === 'action.change_status') {
      // Una referencia a una transición que Catalog Builder ya no publica NO se
      // borra en silencio: el editor la marca al cargar las transiciones y aquí
      // bloquea la publicación. Limpiarla sola cambiaría lo que hace el flujo
      // sin que nadie lo decidiera.
      const ausentesEstado = Array.isArray(action.data.missingReferences) ? action.data.missingReferences as string[] : [];
      if (ausentesEstado.length > 0) {
        fallar(`“${String(action.data.label)}” apunta a ${ausentesEstado.join(', ')} que Catalog Builder ya no publica. Vuelve a elegir la transición.`, action.id);
        continue;
      }
      const transitionKey = String(action.data.transitionKey ?? '').trim();
      if (!transitionKey) {
        fallar(`Elige la transición en “${String(action.data.label)}”.`, action.id);
        continue;
      }
      if (transitionKey !== String(action.data.transitionKey)) {
        fallar(`La transición de “${String(action.data.label)}” contiene espacios alrededor.`, action.id);
        continue;
      }
      rules.push({
        id: action.id,
        accion: 'cambiar_estado_ticket',
        condicion: conditionText,
        demora_segundos: delaySeconds,
        config: { transition_key: transitionKey } satisfies WorkflowStatusConfig,
      });
      continue;
    }

    // El modo vive en el NODO, no en la clave del catálogo: es lo que permite
    // cambiar de equipo a persona sin recrear el bloque.
    const mode = action.data.assignmentMode === 'user' ? 'user' : 'team';
    const departmentID = String(action.data.departmentId ?? '');
    const teamID = String(action.data.teamId ?? '');
    const assigneeUserID = String(action.data.assigneeUserId ?? '');

    // Una referencia que Organization ya no reconoce NO se borra en silencio:
    // el editor la marca al cargar el directorio y aquí bloquea la publicación.
    // Limpiarla sola haría que un diagrama guardado cambiara de destino sin que
    // nadie lo decidiera.
    const ausentes = Array.isArray(action.data.missingReferences) ? action.data.missingReferences as string[] : [];
    if (ausentes.length > 0) {
      fallar(`“${String(action.data.label)}” apunta a ${ausentes.join(', ')} que Organization ya no reconoce. Vuelve a elegir el destino.`, action.id);
      continue;
    }
    if (!departmentID || !teamID || (mode === 'user' && !assigneeUserID)) {
      fallar(mode === 'user'
        ? `Completa área, equipo y persona en “${String(action.data.label)}”.`
        : `Completa área y equipo en “${String(action.data.label)}”.`, action.id);
      continue;
    }
    if ([departmentID, teamID, assigneeUserID].some((id) => id && id !== id.trim())) {
      fallar(`La asignación “${String(action.data.label)}” contiene identificadores no normalizados.`, action.id);
      continue;
    }
    rules.push({
      id: action.id,
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

  if (errors.length > 0) return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], issues };
  const layout: WorkflowVisualLayout = {
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data: { ...data } })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })),
  };

  // El plan se compila del MISMO grafo del que salieron las reglas, así que el
  // orden publicado es el orden dibujado. El backend lo valida entero —ciclos,
  // nodos inalcanzables, conectores— y devuelve 422 con el motivo, que el canvas
  // muestra junto al nodo culpable.
  const plan = compileExecutionPlan(nodes, edges, triggers[0], rules);
  if (!plan) {
    fallar('El diagrama no se pudo compilar en un plan ejecutable. Revisa que todo cuelgue del disparador.');
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], issues };
  }

  return {
    errors,
    warnings: [...new Set(warnings)],
    issues,
    payload: { categoria_id: 'INC', version, reglas: rules, layout, execution_plan: plan },
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
    const node = nodeFromCatalog(catalogItem('action.assign')!, position);
    node.data.supportStatus = 'operational';
    // El modo viene de la configuración publicada, no de la clave del bloque:
    // una regla guardada manda sobre el valor por defecto de la paleta.
    node.data.assignmentMode = config?.mode ?? 'team';
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
    // El id del nodo de acción ES el id de la regla, no `action-<id>`.
    //
    // Importa al clonar un workflow legado —sin layout— a un borrador nuevo: al
    // publicarlo, el compilador usa el id del nodo como id de regla. Con el
    // prefijo, la regla cambiaría de identidad, el execution_id calculado sería
    // otro y el historial dejaría de poder seguir «la misma regla» entre
    // versiones, que es justo lo que el modelo de familias conserva.
    action.id = rule.id;
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

/** Nodos del canvas que el plan SÍ ejecuta.
 *
 *  Un bloque en preparación no entra: no tiene runtime, y meterlo en el plan
 *  haría que el backend rechazara la publicación por una acción que el canvas
 *  ya avisa que no se publicará. Lo que sí se rechaza es tenerlo CONECTADO, y
 *  eso lo comprueba compileVisualWorkflow antes de llegar aquí. */
function esNodoEjecutable(node: WorkflowNode): boolean {
  if (node.data.supportStatus !== 'operational') return false;
  if (node.type === 'trigger') return node.data.catalogKey === 'ticket.created';
  if (node.type === 'condition') return node.data.catalogKey === 'condition.priority';
  if (node.type === 'delay') return node.data.catalogKey === 'control.delay';
  if (node.type === 'action') {
    const clave = String(node.data.catalogKey ?? '');
    return clave === 'action.notify_stakeholders' || clave === 'action.change_status' || esAccionDeAsignacion(clave);
  }
  return false;
}

function conditionExpression(node: WorkflowNode): string {
  return node.data.conditionMode === 'always'
    ? 'siempre'
    : `prioridad == ${String(node.data.priority ?? 'critica')}`;
}

/** accionDeNodo traduce la clave del bloque a la acción que ejecuta el runtime.
 *
 *  Es la misma traducción que hacen las reglas, en un solo sitio: dos tablas
 *  para lo mismo divergen, y el plan y las reglas tienen que declarar la MISMA
 *  acción o el backend rechaza la publicación (y con razón: ejecutaría algo
 *  distinto de lo que el diagrama muestra). */
function accionDeNodo(node: WorkflowNode): string | undefined {
  const clave = String(node.data.catalogKey ?? '');
  if (clave === 'action.notify_stakeholders') return 'notificar_interesados';
  if (clave === 'action.change_status') return 'cambiar_estado_ticket';
  if (esAccionDeAsignacion(clave)) return 'asignar_automatico';
  return undefined;
}

/** Compila el diagrama en el plan ejecutable.
 *
 *  # Qué hace y qué no
 *
 *  Traduce nodos y conexiones a un grafo con identidad estable: el id de cada
 *  nodo del plan ES el id del nodo del canvas, y para las acciones es también
 *  el id de su regla. Eso es lo que hace que el historial sea por nodo y que
 *  recargar el diseñador muestre exactamente lo que se ejecutó.
 *
 *  NO valida el grafo. Ciclos, nodos inalcanzables y conectores incompatibles
 *  los rechaza el backend al publicar, que es el único sitio donde la
 *  comprobación no se puede saltar: el canvas es un cliente y un cliente
 *  siempre se puede eludir.
 *
 *  Devuelve undefined solo cuando no hay disparador ejecutable, porque entonces
 *  no hay plan que compilar. */
export function compileExecutionPlan(
  nodes: WorkflowNode[],
  edges: Edge[],
  trigger: WorkflowNode | undefined,
  rules: PublishWorkflowInput['reglas'],
): WorkflowExecutionPlan | undefined {
  if (!trigger) return undefined;

  const ejecutables = nodes.filter(esNodoEjecutable);
  const permitidos = new Set(ejecutables.map((node) => node.id));
  // Solo las conexiones entre nodos ejecutables. Una que toque un bloque en
  // preparación no se traduce: ese bloque no está en el plan y la conexión
  // apuntaría a un nodo inexistente, que el backend rechazaría con un mensaje
  // sobre el plan en vez de sobre el bloque.
  const conexiones = edges.filter((edge) => permitidos.has(edge.source) && permitidos.has(edge.target));
  const conIDDeRegla = new Set((rules ?? []).map((rule) => rule.id).filter(Boolean) as string[]);

  const salidas = (id: string, rama?: 'yes' | 'no') => conexiones
    .filter((edge) => edge.source === id)
    .filter((edge) => {
      if (!rama) return true;
      // Una conexión sin handle explícito es la rama verdadera: es como se
      // dibujaban las condiciones antes de que existiera la salida «No», y un
      // diagrama guardado entonces tiene que seguir significando lo mismo.
      const handle = edge.sourceHandle ?? 'yes';
      return handle === rama;
    })
    // Orden estable: el backend desempata ramas independientes por id de nodo,
    // así que emitirlas ordenadas hace que el JSON publicado sea idéntico entre
    // guardados y que un diff del plan solo muestre cambios reales.
    .map((edge) => edge.target)
    .sort();

  const planNodes: WorkflowPlanNode[] = [];
  for (const node of ejecutables) {
    if (node.type === 'trigger') {
      planNodes.push({ id: node.id, kind: 'trigger', type: 'ticket_created', next: salidas(node.id) });
      continue;
    }
    if (node.type === 'condition') {
      const siVerdadero = salidas(node.id, 'yes');
      const siFalso = salidas(node.id, 'no');
      planNodes.push({
        id: node.id,
        kind: 'condition',
        expression: { condicion: conditionExpression(node) },
        ...(siVerdadero.length > 0 ? { on_true: siVerdadero } : {}),
        ...(siFalso.length > 0 ? { on_false: siFalso } : {}),
      });
      continue;
    }
    if (node.type === 'delay') {
      planNodes.push({
        id: node.id, kind: 'delay',
        delay_seconds: secondsFromNode(node),
        next: salidas(node.id),
      });
      continue;
    }
    const accion = accionDeNodo(node);
    // Sin regla no hay configuración que ejecutar, y el backend lo rechaza con
    // razón. Puede pasar cuando la acción quedó fuera de las reglas por un
    // error de validación anterior; omitirla aquí deja que el mensaje que ve la
    // persona sea el de su bloque, no uno sobre el plan.
    if (!accion || !conIDDeRegla.has(node.id)) continue;
    planNodes.push({ id: node.id, kind: 'action', action: accion, next: salidas(node.id) });
  }

  return {
    version: 1,
    entrypoints: [trigger.id],
    // Ordenado por id, por la misma razón que las salidas: el plan publicado
    // tiene que ser el mismo para el mismo diagrama.
    nodes: planNodes.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
