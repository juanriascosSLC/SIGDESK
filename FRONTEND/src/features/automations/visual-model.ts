import type { Edge } from '@xyflow/react';
import type {
  PublishWorkflowInput,
  WorkflowAssignmentConfig,
  WorkflowDefinition,
  WorkflowExecutionPlan,
  WorkflowPlanNode,
  WorkflowRule,
  WorkflowIncidentWorkConfig,
  WorkflowServiceEscalationConfig,
  WorkflowStatusConfig,
  WorkflowVisualLayout,
} from './api';
import type { WorkflowNode, WorkflowNodeData } from './CustomNodes';

export type CatalogGroup = 'Triggers' | 'Conditions' | 'Control' | 'Actions';
export type SupportStatus = 'operational' | 'planned';

// English display labels for the (Spanish-valued) priority enum stored on a
// ticket/condition node. Shared between the editor's own priority dropdown
// (WorkflowCanvasEditor) and the canvas node's summary text (CustomNodes) —
// a single source so both never drift: CustomNodes used to interpolate the
// raw enum value directly ("Priority = critica"), a real English-localization
// gap only the canvas summary had, found live while migrating this
// workstream's E2E specs.
export const priorityLabels: Record<string, string> = {
  baja: 'Low',
  media: 'Medium',
  alta: 'High',
  critica: 'Critical',
};

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
  { key: 'ticket.created', group: 'Triggers', nodeType: 'trigger', title: 'INC Created', description: 'When an incident is created.', support: 'operational', color: 'cyan' },
  { key: 'incident.not_duplicate', group: 'Triggers', nodeType: 'trigger', title: 'Not a Duplicate', description: 'After IT 1 records the typed not_duplicate decision.', support: 'operational', color: 'cyan' },
  { key: 'incident.escalated_to_it2', group: 'Triggers', nodeType: 'trigger', title: 'Escalated to IT 2', description: 'After IT 1 records the typed escalate_to_it2 outcome.', support: 'operational', color: 'cyan' },
  { key: 'incident.service_required', group: 'Triggers', nodeType: 'trigger', title: 'Service Required', description: 'When IT documents that the incident requires field or service work.', support: 'operational', color: 'cyan' },
  { key: 'ticket.status_changed', group: 'Triggers', nodeType: 'trigger', title: 'Status Changed', description: 'When a ticket transitions.', support: 'planned', color: 'cyan' },
  { key: 'ticket.assigned', group: 'Triggers', nodeType: 'trigger', title: 'Ticket Assigned', description: 'When assignee or team changes.', support: 'planned', color: 'cyan' },
  { key: 'ticket.comment_added', group: 'Triggers', nodeType: 'trigger', title: 'Comment Added', description: 'When activity is recorded.', support: 'planned', color: 'cyan' },
  { key: 'ticket.sla_at_risk', group: 'Triggers', nodeType: 'trigger', title: 'SLA at Risk', description: 'When an SLA threshold is reached.', support: 'planned', color: 'cyan' },
  { key: 'problem.created', group: 'Triggers', nodeType: 'trigger', title: 'PRB Created', description: 'When an investigation is opened.', support: 'planned', color: 'cyan' },
  { key: 'change.created', group: 'Triggers', nodeType: 'trigger', title: 'RFC Created', description: 'When a change is created.', support: 'planned', color: 'cyan' },
  { key: 'task.overdue', group: 'Triggers', nodeType: 'trigger', title: 'Task Overdue', description: 'When an RFC task is overdue.', support: 'planned', color: 'cyan' },

  { key: 'condition.priority', group: 'Conditions', nodeType: 'condition', title: 'Priority', description: 'Low, medium, high, or critical.', support: 'operational', color: 'amber', defaults: { conditionMode: 'priority', priority: 'critica' } },
  { key: 'condition.status', group: 'Conditions', nodeType: 'condition', title: 'Status', description: 'Compares the current status.', support: 'planned', color: 'amber' },
  { key: 'condition.site', group: 'Conditions', nodeType: 'condition', title: 'Site', description: 'Filters by affected site.', support: 'planned', color: 'amber' },
  { key: 'condition.device_type', group: 'Conditions', nodeType: 'condition', title: 'Device Type', description: 'Camera, NVR, switch, PDU…', support: 'planned', color: 'amber' },
  { key: 'condition.team', group: 'Conditions', nodeType: 'condition', title: 'Team or Area', description: 'Assignee or stakeholder.', support: 'planned', color: 'amber' },
  { key: 'condition.custom_field', group: 'Conditions', nodeType: 'condition', title: 'Dynamic Field', description: 'Evaluates an Entity Builder field.', support: 'planned', color: 'amber' },
  { key: 'condition.sla_percent', group: 'Conditions', nodeType: 'condition', title: 'SLA Consumption', description: 'Compares percentage consumed.', support: 'planned', color: 'amber' },

  { key: 'control.delay', group: 'Control', nodeType: 'delay', title: 'Wait', description: 'Temporal durable timer.', support: 'operational', color: 'blue', defaults: { delayValue: '15', delayUnit: 'minutes' } },
  { key: 'control.approval', group: 'Control', nodeType: 'approval', title: 'Request Approval', description: 'Pauses until approved or rejected.', support: 'planned', color: 'purple' },
  { key: 'control.foreach', group: 'Control', nodeType: 'foreach', title: 'For Each Item', description: 'Iterates over devices or relations.', support: 'planned', color: 'cyan' },
  { key: 'control.parser', group: 'Control', nodeType: 'parser', title: 'Transform Data', description: 'Maps variables for an action.', support: 'planned', color: 'pink' },

  { key: 'action.notify_stakeholders', group: 'Actions', nodeType: 'action', title: 'Notify Stakeholders', description: 'Creator, people, and interested areas.', support: 'operational', color: 'emerald', defaults: { actionType: 'notify', title: 'Notify Stakeholders' } },
  { key: 'action.assign', group: 'Actions', nodeType: 'action', title: 'Assign Automatically', description: 'Routes work to an area, team, or person.', support: 'operational', color: 'emerald', defaults: { assignmentMode: 'team', overwriteExisting: false } },
  { key: 'action.add_stakeholder', group: 'Actions', nodeType: 'action', title: 'Add Stakeholder', description: 'Adds person or interested area.', support: 'planned', color: 'emerald' },
  { key: 'action.change_status', group: 'Actions', nodeType: 'action', title: 'Change Status', description: 'Requests a published lifecycle transition.', support: 'operational', color: 'emerald', defaults: { actionType: 'changeStatus' } },
	{ key: 'action.create_incident_work', group: 'Actions', nodeType: 'action', title: 'Create Incident Work', description: 'Creates the initial IT troubleshooting checklist inside the INC.', support: 'operational', color: 'emerald', defaults: { actionType: 'createIncidentWork', workKey: 'initial_troubleshooting', workTitle: 'Troubleshoot incident', workInstructions: 'Validate power, network, affected devices, service health, and recent changes. Document the findings.', workRequired: true, workDueMinutes: '30' } },
  { key: 'action.create_service_rfc', group: 'Actions', nodeType: 'action', title: 'Create Service RFC', description: 'Creates a related RFC from documented troubleshooting and sends it for approval.', support: 'operational', color: 'emerald', defaults: { actionType: 'createServiceRfc', serviceAffected: 'Field Services', changeType: 'normal', impact: 'medium', probability: 'low', urgency: 'medium', leadTimeMinutes: '60', durationMinutes: '120', requestApproval: true, changeImpact: 'medium', changeProbability: 'low', changeUrgency: 'medium', changeLeadMinutes: '60', changeDurationMinutes: '120', implementationPlan: 'Services will inspect the affected site and devices, perform the approved corrective work, and record evidence.', rollbackPlan: 'Stop work, restore the prior configuration or equipment state, and notify IT and interested areas.', validationPlan: 'IT validates service health, recording, playback, detections, and the original incident symptoms after field work.' } },
  { key: 'action.change_priority', group: 'Actions', nodeType: 'action', title: 'Change Priority', description: 'Updates ticket priority.', support: 'planned', color: 'emerald' },
  { key: 'action.add_comment', group: 'Actions', nodeType: 'action', title: 'Add Comment', description: 'Records automated activity.', support: 'planned', color: 'emerald' },
  { key: 'action.create_prb', group: 'Actions', nodeType: 'action', title: 'Create PRB', description: 'Opens a related problem.', support: 'planned', color: 'emerald' },
  { key: 'action.create_rfc', group: 'Actions', nodeType: 'action', title: 'Create RFC', description: 'Opens a related change.', support: 'planned', color: 'emerald' },
  { key: 'action.create_task', group: 'Actions', nodeType: 'action', title: 'Create Task', description: 'Creates multi-area work in an RFC.', support: 'planned', color: 'emerald' },
  { key: 'action.webhook', group: 'Actions', nodeType: 'action', title: 'Invoke Webhook', description: 'Calls a published integration.', support: 'planned', color: 'purple' },
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

const triggerTypeByCatalogKey: Record<string, string> = {
  'ticket.created': 'ticket_created',
  'incident.not_duplicate': 'incident_not_duplicate',
  'incident.escalated_to_it2': 'incident_escalated_to_it2',
  'incident.service_required': 'incident_service_required',
};

const triggerCatalogKeyByType: Record<string, string> = Object.fromEntries(
  Object.entries(triggerTypeByCatalogKey).map(([key, value]) => [value, key]),
);

function isOperationalTrigger(node: WorkflowNode): boolean {
  return node.type === 'trigger'
    && node.data.supportStatus === 'operational'
    && String(node.data.catalogKey) in triggerTypeByCatalogKey;
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

/** Devuelve los ancestros de un nodo, MÁS la rama ('yes'/'no', "Una conexión
 * sin handle explícito es la rama verdadera" — mismo default que `salidas()`
 * más abajo, ver línea ~474) por la que se llegó a cada nodo `condition`
 * encontrado en el camino hacia `nodeID`.
 *
 * Bug corregido 2026-09-09: antes esta función ignoraba `edge.sourceHandle`
 * por completo, así que una acción colgada de la salida "No" de una
 * condición terminaba con la MISMA `condicion` (la rama verdadera) que una
 * colgada de "Yes" — lógica invertida en silencio. Como el DSL de `reglas[]`
 * (`condicion: string`) no tiene hoy una forma de expresar "no se cumple X",
 * `compileVisualWorkflow` usa `conditionBranch` para bloquear la publicación
 * de esa rama en vez de inventar una sintaxis de negación no verificada. */
function ancestorsOf(nodeID: string, nodes: WorkflowNode[], edges: Edge[]) {
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const result: WorkflowNode[] = [];
  const conditionBranch = new Map<string, 'yes' | 'no'>();
  const queue = [nodeID];
  const visited = new Set<string>([nodeID]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges.filter((candidate) => candidate.target === current)) {
      if (visited.has(edge.source)) continue;
      visited.add(edge.source);
      const source = byID.get(edge.source);
      if (source) {
        result.push(source);
        if (source.type === 'condition') {
          conditionBranch.set(source.id, (edge.sourceHandle as 'yes' | 'no' | undefined) ?? 'yes');
        }
      }
      queue.push(edge.source);
    }
  }
  return { ancestors: result, conditionBranch };
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
  const triggers = nodes.filter(isOperationalTrigger);
  const actions = nodes.filter((node) => node.type === 'action'
    && node.data.supportStatus === 'operational'
    && (String(node.data.catalogKey) === 'action.notify_stakeholders'
      || String(node.data.catalogKey) === 'action.change_status'
		|| String(node.data.catalogKey) === 'action.create_incident_work'
      || String(node.data.catalogKey) === 'action.create_service_rfc'
      || esAccionDeAsignacion(node.data.catalogKey)));
  if (triggers.length === 0) fallar('The workflow must have at least one operational incident trigger.');
  if (actions.length === 0) fallar('Connect at least one operational action.');

  const connectedIDs = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of nodes.filter((candidate) => candidate.data.supportStatus === 'planned')) {
    if (connectedIDs.has(node.id)) fallar(`“${String(node.data.label)}” is under development and cannot be published yet.`, node.id);
    else warnings.push(`“${String(node.data.label)}” is on the canvas as a future design and will not be published.`);
  }

  const rules: PublishWorkflowInput['reglas'] = [];
  for (const action of actions) {
    const { ancestors, conditionBranch } = ancestorsOf(action.id, nodes, edges);
    const actionTriggers = ancestors.filter((node) => triggers.some((trigger) => trigger.id === node.id));
    if (actionTriggers.length === 0) {
      fallar(`Action “${String(action.data.label)}” is not connected to the trigger.`, action.id);
      continue;
    }
    if (actionTriggers.length > 1) {
      fallar(`Action "${String(action.data.label)}" is connected to more than one trigger. Use one deterministic trigger per action.`, action.id);
      continue;
    }
    const actionTriggerKey = String(actionTriggers[0].data.catalogKey);
    const conditions = ancestors.filter((node) => node.type === 'condition' && node.data.supportStatus === 'operational');
    const delays = ancestors.filter((node) => node.type === 'delay' && node.data.supportStatus === 'operational');
    if (conditions.length > 1) fallar('Each publishable branch supports only one operational condition in this version.', action.id);
    if (delays.length > 1) fallar('Each publishable branch supports only one durable wait in this version.', action.id);
    const condition = conditions[0];
    if (condition && condition.data.conditionMode !== 'always' && conditionBranch.get(condition.id) === 'no') {
      // Bug found 2026-09-09: this branch used to silently compile to the
      // SAME condition as "Yes" (inverted logic, no error). `reglas[].condicion`
      // has no way to express "condition NOT met" today — block instead of
      // guessing a negation syntax that was never verified against the backend.
      fallar(`“${String(action.data.label)}” is connected to the “No” output of “${String(condition.data.label)}” — publishing actions on the “No” branch isn’t supported yet. Connect it to “Yes”, or remove the condition.`, action.id);
      continue;
    }
    const conditionText = condition
      ? (condition.data.conditionMode === 'always' ? 'siempre' : `prioridad == ${String(condition.data.priority ?? 'critica')}`)
      : 'siempre';
    const delaySeconds = secondsFromNode(delays[0]);
    if (delaySeconds > 2_592_000) fallar('Maximum publishable wait is 30 days.', delays[0]?.id);
    if (String(action.data.catalogKey) === 'action.notify_stakeholders') {
      rules.push({ id: action.id, accion: 'notificar_interesados', condicion: conditionText, demora_segundos: delaySeconds });
      continue;
    }

    if (String(action.data.catalogKey) === 'action.change_status') {
      // Una referencia a una transición que Entity Builder ya no publica NO se
      // borra en silencio: el editor la marca al cargar las transiciones y aquí
      // bloquea la publicación. Limpiarla sola cambiaría lo que hace el flujo
      // sin que nadie lo decidiera.
      const ausentesEstado = Array.isArray(action.data.missingReferences) ? action.data.missingReferences as string[] : [];
      if (ausentesEstado.length > 0) {
        fallar(`“${String(action.data.label)}” points to ${ausentesEstado.join(', ')} which Entity Builder no longer publishes. Re-select the transition.`, action.id);
        continue;
      }
      const transitionKey = String(action.data.transitionKey ?? '').trim();
      if (!transitionKey) {
        fallar(`Select a transition in “${String(action.data.label)}”.`, action.id);
        continue;
      }
      if (transitionKey !== String(action.data.transitionKey)) {
        fallar(`Transition in “${String(action.data.label)}” contains surrounding whitespace.`, action.id);
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

		if (String(action.data.catalogKey) === 'action.create_incident_work') {
			if (!['ticket.created', 'incident.not_duplicate', 'incident.escalated_to_it2'].includes(actionTriggerKey)) {
				fallar('“Create Incident Work” must start from the “INC Created” trigger.', action.id);
				continue;
			}
			const workKey = String(action.data.workKey ?? '');
			const workType = String(action.data.workType ?? '');
			const title = String(action.data.workTitle ?? '');
			const instructions = String(action.data.workInstructions ?? '');
			const departmentID = String(action.data.departmentId ?? '');
			const teamID = String(action.data.teamId ?? '');
			const dueMinutes = Number(action.data.workDueMinutes ?? 0);
			if (!/^[a-z0-9][a-z0-9_:-]*$/.test(workKey) || workKey.length > 120) {
				fallar(`Use a stable lowercase work key in “${String(action.data.label)}”.`, action.id);
				continue;
			}
			if (!title.trim() || !instructions.trim()) {
				fallar(`Complete the title and instructions in “${String(action.data.label)}”.`, action.id);
				continue;
			}
			const expectedWorkType = actionTriggerKey === 'incident.not_duplicate'
				? 'it1_remote_troubleshooting'
				: actionTriggerKey === 'incident.escalated_to_it2' ? 'it2_troubleshooting' : '';
			if (expectedWorkType && (workType !== expectedWorkType || !departmentID.trim() || !teamID.trim())) {
				fallar(`Incident work must use ${expectedWorkType} with an explicit department and team.`, action.id);
				continue;
			}
			if ([workKey, workType, title, instructions, departmentID, teamID].some((value) => value !== value.trim())) {
				fallar(`Incident work in “${String(action.data.label)}” contains surrounding whitespace.`, action.id);
				continue;
			}
			if (!Number.isInteger(dueMinutes) || dueMinutes < 0 || dueMinutes > 43_200) {
				fallar(`Due time in “${String(action.data.label)}” must be between 0 and 43,200 minutes.`, action.id);
				continue;
			}
			rules.push({
				id: action.id,
				accion: 'create_incident_work_item',
				condicion: conditionText,
				demora_segundos: delaySeconds,
				config: {
					work_key: workKey,
					...(workType ? { work_type: workType as WorkflowIncidentWorkConfig['work_type'] } : {}),
					title,
					instructions,
					required: action.data.workRequired !== false,
					due_in_minutes: dueMinutes,
					...(departmentID ? { department_id: departmentID } : {}),
					...(teamID ? { team_id: teamID } : {}),
				} satisfies WorkflowIncidentWorkConfig,
			});
			continue;
		}

    if (String(action.data.catalogKey) === 'action.create_service_rfc') {
      if (actionTriggerKey !== 'incident.service_required') {
        fallar('“Create Service RFC” must start from the “Service Required” trigger.', action.id);
        continue;
      }
      const serviceAffected = String(action.data.serviceAffected ?? '');
      const changeType = String(action.data.changeType ?? '');
      const impact = String(action.data.impact ?? action.data.changeImpact ?? '');
      const probability = String(action.data.probability ?? action.data.changeProbability ?? '');
      const urgency = String(action.data.urgency ?? action.data.changeUrgency ?? '');
      const leadMinutes = Number(action.data.leadTimeMinutes ?? action.data.changeLeadMinutes ?? 0);
      const durationMinutes = Number(action.data.durationMinutes ?? action.data.changeDurationMinutes ?? 0);
      const implementationPlan = String(action.data.implementationPlan ?? '');
      const rollbackPlan = String(action.data.rollbackPlan ?? '');
      const validationPlan = String(action.data.validationPlan ?? '');
      const textValues = [serviceAffected, changeType, impact, probability, urgency, implementationPlan, rollbackPlan, validationPlan];
      if (textValues.some((value) => !value.trim() || value !== value.trim())) {
        fallar(`Complete the RFC governance fields in “${String(action.data.label)}” without surrounding whitespace.`, action.id);
        continue;
      }
      if (!Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > 43_200
        || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 43_200) {
        fallar(`Planning times in “${String(action.data.label)}” are invalid.`, action.id);
        continue;
      }
      rules.push({
        id: action.id,
        accion: 'create_service_rfc',
        condicion: conditionText,
        demora_segundos: delaySeconds,
        config: {
          service_affected: serviceAffected,
          change_type: changeType as WorkflowServiceEscalationConfig['change_type'],
          impact: impact as WorkflowServiceEscalationConfig['impact'],
          probability: probability as WorkflowServiceEscalationConfig['probability'],
          urgency: urgency as WorkflowServiceEscalationConfig['urgency'],
          lead_time_minutes: leadMinutes,
          duration_minutes: durationMinutes,
          implementation_plan: implementationPlan,
          rollback_plan: rollbackPlan,
          validation_plan: validationPlan,
          request_approval: true,
        } satisfies WorkflowServiceEscalationConfig,
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
      fallar(`“${String(action.data.label)}” points to ${ausentes.join(', ')} which Organization no longer recognizes. Re-select the destination.`, action.id);
      continue;
    }
    if (!departmentID || !teamID || (mode === 'user' && !assigneeUserID)) {
      fallar(mode === 'user'
        ? `Complete area, team, and person in “${String(action.data.label)}”.`
        : `Complete area and team in “${String(action.data.label)}”.`, action.id);
      continue;
    }
    if ([departmentID, teamID, assigneeUserID].some((id) => id && id !== id.trim())) {
      fallar(`Assignment “${String(action.data.label)}” contains non-normalized identifiers.`, action.id);
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
  const plan = compileExecutionPlan(nodes, edges, triggers, rules);
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

function incidentWorkConfig(config: WorkflowRule['config']): WorkflowIncidentWorkConfig | undefined {
	if (!config || typeof config !== 'object') return undefined;
	const candidate = config as Partial<WorkflowIncidentWorkConfig>;
	if (typeof candidate.work_key !== 'string' || typeof candidate.title !== 'string' || typeof candidate.instructions !== 'string') return undefined;
	return candidate as WorkflowIncidentWorkConfig;
}

function serviceEscalationConfig(config: WorkflowRule['config']): WorkflowServiceEscalationConfig | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const candidate = config as Partial<WorkflowServiceEscalationConfig>;
  if (typeof candidate.service_affected !== 'string'
    || typeof candidate.change_type !== 'string'
    || typeof candidate.impact !== 'string'
    || typeof candidate.probability !== 'string'
    || typeof candidate.urgency !== 'string'
    || typeof candidate.lead_time_minutes !== 'number'
    || typeof candidate.duration_minutes !== 'number'
    || typeof candidate.implementation_plan !== 'string'
    || typeof candidate.rollback_plan !== 'string'
    || typeof candidate.validation_plan !== 'string'
    || candidate.request_approval !== true) return undefined;
  return candidate as WorkflowServiceEscalationConfig;
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
	if (rule.accion === 'create_incident_work_item') {
		const config = incidentWorkConfig(rule.config);
		const node = nodeFromCatalog(catalogItem('action.create_incident_work')!, position);
		node.data.workKey = config?.work_key ?? '';
		node.data.workType = config?.work_type ?? '';
		node.data.workTitle = config?.title ?? '';
		node.data.workInstructions = config?.instructions ?? '';
		node.data.workRequired = config?.required !== false;
		node.data.workDueMinutes = String(config?.due_in_minutes ?? 0);
		node.data.departmentId = config?.department_id ?? '';
		node.data.teamId = config?.team_id ?? '';
		return node;
	}
  if (rule.accion === 'create_service_rfc') {
    const config = serviceEscalationConfig(rule.config);
    const node = nodeFromCatalog(catalogItem('action.create_service_rfc')!, position);
    node.data.serviceAffected = config?.service_affected ?? '';
    node.data.changeType = config?.change_type ?? 'normal';
    node.data.impact = config?.impact ?? 'medium';
    node.data.probability = config?.probability ?? 'low';
    node.data.urgency = config?.urgency ?? 'medium';
    node.data.leadTimeMinutes = String(config?.lead_time_minutes ?? 60);
    node.data.durationMinutes = String(config?.duration_minutes ?? 120);
    node.data.requestApproval = true;
    node.data.changeImpact = config?.impact ?? 'medium';
    node.data.changeProbability = config?.probability ?? 'low';
    node.data.changeUrgency = config?.urgency ?? 'medium';
    node.data.changeLeadMinutes = String(config?.lead_time_minutes ?? 60);
    node.data.changeDurationMinutes = String(config?.duration_minutes ?? 120);
    node.data.implementationPlan = config?.implementation_plan ?? '';
    node.data.rollbackPlan = config?.rollback_plan ?? '';
    node.data.validationPlan = config?.validation_plan ?? '';
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
      description: 'Published action retained for compatibility.',
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
  const persistedPlanNodes = definition.execution_plan?.nodes ?? [];
  if (persistedPlanNodes.length > 0) {
    const rulesByID = new Map((definition.reglas ?? []).map((rule) => [rule.id, rule]));
    const nodes: WorkflowNode[] = [];
    const edges: Edge[] = [];
    persistedPlanNodes.forEach((planNode, index) => {
      const position = { x: planNode.kind === 'trigger' ? 80 : planNode.kind === 'action' ? 760 : 410, y: 70 + index * 180 };
      if (planNode.kind === 'trigger') {
        const triggerKey = triggerCatalogKeyByType[String(planNode.type ?? '')];
        const item = triggerKey ? catalogItem(triggerKey) : undefined;
        if (!item) return;
        const node = nodeFromCatalog(item, position);
        node.id = planNode.id;
        nodes.push(node);
        return;
      }
      if (planNode.kind === 'action') {
        const rule = rulesByID.get(planNode.id);
        if (!rule) return;
        const node = actionFromRule(rule, position);
        node.id = planNode.id;
        node.data.onOmitted = planNode.on_omitted;
        nodes.push(node);
        return;
      }
      if (planNode.kind === 'condition') {
        const node = nodeFromCatalog(catalogItem('condition.priority')!, position);
        node.id = planNode.id;
        const expression = planNode.expression?.condicion ?? 'siempre';
        node.data.conditionMode = expression === 'siempre' ? 'always' : 'priority';
        if (node.data.conditionMode === 'priority') node.data.priority = expression.split('==')[1]?.trim() || 'critica';
        nodes.push(node);
        return;
      }
      if (planNode.kind === 'delay') {
        const node = nodeFromCatalog(catalogItem('control.delay')!, position);
        node.id = planNode.id;
        node.data.delayValue = String(planNode.delay_seconds ?? 0);
        node.data.delayUnit = 'seconds';
        nodes.push(node);
      }
    });
    const nodeIDs = new Set(nodes.map((node) => node.id));
    persistedPlanNodes.forEach((planNode) => {
      const connect = (target: string, handle?: 'yes' | 'no') => {
        if (!nodeIDs.has(planNode.id) || !nodeIDs.has(target)) return;
        edges.push({
          id: `e-${planNode.id}-${handle ?? 'next'}-${target}`,
          source: planNode.id,
          target,
          ...(handle ? { sourceHandle: handle } : {}),
          animated: true,
        });
      };
      (planNode.next ?? []).forEach((target) => connect(target));
      (planNode.on_true ?? []).forEach((target) => connect(target, 'yes'));
      (planNode.on_false ?? []).forEach((target) => connect(target, 'no'));
    });
    return { nodes, edges };
  }
  const publishedTriggerType = definition.execution_plan?.nodes.find((node) => node.kind === 'trigger')?.type;
  const triggerKey = triggerCatalogKeyByType[String(publishedTriggerType ?? '')] ?? 'ticket.created';
  const trigger = nodeFromCatalog(catalogItem(triggerKey)!, { x: 80, y: 160 });
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
  if (node.type === 'trigger') return isOperationalTrigger(node);
  if (node.type === 'condition') return node.data.catalogKey === 'condition.priority';
  if (node.type === 'delay') return node.data.catalogKey === 'control.delay';
  if (node.type === 'action') {
    const clave = String(node.data.catalogKey ?? '');
		return clave === 'action.notify_stakeholders'
      || clave === 'action.change_status'
      || clave === 'action.create_incident_work'
      || clave === 'action.create_service_rfc'
      || esAccionDeAsignacion(clave);
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
	if (clave === 'action.create_incident_work') return 'create_incident_work_item';
  if (clave === 'action.create_service_rfc') return 'create_service_rfc';
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
  triggers: WorkflowNode[],
  rules: PublishWorkflowInput['reglas'],
): WorkflowExecutionPlan | undefined {
  if (triggers.length === 0) return undefined;

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
      const triggerType = triggerTypeByCatalogKey[String(node.data.catalogKey)];
      if (!triggerType) continue;
      planNodes.push({
        id: node.id,
        kind: 'trigger',
        type: triggerType,
        next: salidas(node.id),
      });
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
    planNodes.push({
      id: node.id,
      kind: 'action',
      action: accion,
      next: salidas(node.id),
      ...(node.data.onOmitted ? { on_omitted: node.data.onOmitted } : {}),
    });
  }

  return {
    version: triggers.length > 1 ? 2 : 1,
    entrypoints: triggers.map((trigger) => trigger.id).sort(),
    // Ordenado por id, por la misma razón que las salidas: el plan publicado
    // tiene que ser el mismo para el mismo diagrama.
    nodes: planNodes.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
