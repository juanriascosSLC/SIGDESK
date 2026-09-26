import type {
  SaveDraftInput,
  WorkflowAssignmentConfig,
  WorkflowIncidentWorkConfig,
  WorkflowServiceEscalationConfig,
} from './api';

export interface BlueprintADraftInput {
  departmentId: string;
  departmentName: string;
  teamId: string;
  teamName: string;
}

export interface BlueprintA3DraftInput {
  it1DepartmentId: string;
  it1DepartmentName: string;
  it1TeamId: string;
  it1TeamName: string;
  it2DepartmentId: string;
  it2DepartmentName: string;
  it2TeamId: string;
  it2TeamName: string;
}

/**
 * ADR-0061 canonical incident orchestration. This creates a draft only.
 * Published v1/v2 definitions remain immutable and replayable.
 */
export function buildBlueprintA3Draft(input: BlueprintA3DraftInput): SaveDraftInput {
  const triggerNotDuplicate = crypto.randomUUID();
  const triggerEscalated = crypto.randomUUID();
  const triggerServiceRequired = crypto.randomUUID();
  const it1RuleId = crypto.randomUUID();
  const it2RuleId = crypto.randomUUID();
  const rfcRuleId = crypto.randomUUID();
  const required = true;
  const it1: WorkflowIncidentWorkConfig = {
    work_key: 'it1_remote_troubleshooting', work_type: 'it1_remote_troubleshooting',
    title: 'IT 1 remote troubleshooting',
    instructions: 'Diagnose the incident remotely, document evidence, and record resolved or escalate_to_it2.',
    required, due_in_minutes: 30, department_id: input.it1DepartmentId, team_id: input.it1TeamId,
  };
  const it2: WorkflowIncidentWorkConfig = {
    work_key: 'it2_troubleshooting', work_type: 'it2_troubleshooting',
    title: 'IT 2 troubleshooting',
    instructions: 'Perform the advanced diagnosis and record resolved, client_action_required, or service_required.',
    required, due_in_minutes: 60, department_id: input.it2DepartmentId, team_id: input.it2TeamId,
  };
  const rfc: WorkflowServiceEscalationConfig = {
    service_affected: 'Field Services', change_type: 'normal', impact: 'medium', probability: 'low', urgency: 'medium',
    lead_time_minutes: 60, duration_minutes: 120,
    implementation_plan: 'Services validates inventory readiness, purchasing gates, scheduling, field work, restoration and closeout.',
    rollback_plan: 'Stop field work, preserve the approved cycle, restore the previous equipment state and create a linked follow-up cycle when required.',
    validation_plan: 'IT validates restoration against the frozen incident, requester, site, assets, assignments and evidence context.',
    request_approval: true,
  };
  const actionNode = (id: string, label: string, actionType: string, extra: Record<string, unknown>, x: number, y: number) => ({ id, type: 'action', position: { x, y }, data: { catalogKey: actionType === 'createServiceRfc' ? 'action.create_service_rfc' : 'action.create_incident_work', label, title: label, description: label, supportStatus: 'operational', color: 'emerald', actionType, ...extra } });
  const triggerNode = (id: string, catalogKey: string, label: string, y: number) => ({ id, type: 'trigger', position: { x: 80, y }, data: { catalogKey, label, title: label, description: label, supportStatus: 'operational', color: 'cyan' } });
  return {
    categoria_id: 'INC', version: 3,
    reglas: [
      { id: it1RuleId, accion: 'create_incident_work_item', condicion: 'siempre', demora_segundos: 0, config: it1 },
      { id: it2RuleId, accion: 'create_incident_work_item', condicion: 'siempre', demora_segundos: 0, config: it2 },
      { id: rfcRuleId, accion: 'create_service_rfc', condicion: 'siempre', demora_segundos: 0, config: rfc },
    ],
    layout: {
      nodes: [
        triggerNode(triggerNotDuplicate, 'incident.not_duplicate', 'Not a duplicate', 60),
        actionNode(it1RuleId, `Create IT 1 work · ${input.it1TeamName}`, 'createIncidentWork', { workKey: it1.work_key, workType: it1.work_type, departmentId: input.it1DepartmentId, departmentName: input.it1DepartmentName, teamId: input.it1TeamId, teamName: input.it1TeamName, workTitle: it1.title, workInstructions: it1.instructions, workRequired: true, workDueMinutes: '30' }, 470, 60),
        triggerNode(triggerEscalated, 'incident.escalated_to_it2', 'Escalated to IT 2', 250),
        actionNode(it2RuleId, `Create IT 2 work · ${input.it2TeamName}`, 'createIncidentWork', { workKey: it2.work_key, workType: it2.work_type, departmentId: input.it2DepartmentId, departmentName: input.it2DepartmentName, teamId: input.it2TeamId, teamName: input.it2TeamName, workTitle: it2.title, workInstructions: it2.instructions, workRequired: true, workDueMinutes: '60' }, 470, 250),
        triggerNode(triggerServiceRequired, 'incident.service_required', 'Service required', 440),
        actionNode(rfcRuleId, 'Create governed Service RFC', 'createServiceRfc', { serviceAffected: rfc.service_affected, changeType: rfc.change_type, impact: rfc.impact, probability: rfc.probability, urgency: rfc.urgency, leadTimeMinutes: '60', durationMinutes: '120', implementationPlan: rfc.implementation_plan, rollbackPlan: rfc.rollback_plan, validationPlan: rfc.validation_plan, requestApproval: true }, 470, 440),
      ],
      edges: [
        { id: `e-${triggerNotDuplicate}-${it1RuleId}`, source: triggerNotDuplicate, target: it1RuleId },
        { id: `e-${triggerEscalated}-${it2RuleId}`, source: triggerEscalated, target: it2RuleId },
        { id: `e-${triggerServiceRequired}-${rfcRuleId}`, source: triggerServiceRequired, target: rfcRuleId },
      ],
    },
    execution_plan: {
      version: 2, entrypoints: [triggerNotDuplicate, triggerEscalated, triggerServiceRequired],
      nodes: [
        { id: triggerNotDuplicate, kind: 'trigger', type: 'incident_not_duplicate', next: [it1RuleId] },
        { id: it1RuleId, kind: 'action', action: 'create_incident_work_item', next: [] },
        { id: triggerEscalated, kind: 'trigger', type: 'incident_escalated_to_it2', next: [it2RuleId] },
        { id: it2RuleId, kind: 'action', action: 'create_incident_work_item', next: [] },
        { id: triggerServiceRequired, kind: 'trigger', type: 'incident_service_required', next: [rfcRuleId] },
        { id: rfcRuleId, kind: 'action', action: 'create_service_rfc', next: [] },
      ],
    },
  };
}

/**
 * Builds a reviewable draft for Blueprint A: Incident IT Triage & Work Item.
 * Enforces strong compile-time typing on incident work configuration (due_in_minutes).
 */
export function buildBlueprintADraft(input: BlueprintADraftInput): SaveDraftInput {
  const triggerId = crypto.randomUUID();
  const assignRuleId = crypto.randomUUID();
  const workItemRuleId = crypto.randomUUID();

  const assignConfig: WorkflowAssignmentConfig = {
    mode: 'team',
    department_id: input.departmentId,
    team_id: input.teamId,
    overwrite_existing: false,
  };

  const workItemConfig: WorkflowIncidentWorkConfig = {
    work_key: 'initial_troubleshooting',
    title: 'Troubleshoot incident',
    instructions: 'Validate power, network, affected devices, service health, and recent changes. Document the findings.',
    required: true,
    due_in_minutes: 30,
  };

  return {
    categoria_id: 'INC',
    version: 1,
    reglas: [
      {
        id: assignRuleId,
        accion: 'asignar_automatico',
        condicion: 'siempre',
        demora_segundos: 0,
        config: assignConfig satisfies WorkflowAssignmentConfig,
      },
      {
        id: workItemRuleId,
        accion: 'create_incident_work_item',
        condicion: 'siempre',
        demora_segundos: 0,
        config: workItemConfig satisfies WorkflowIncidentWorkConfig,
      },
    ],
    layout: {
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          position: { x: 80, y: 160 },
          data: {
            catalogKey: 'ticket.created',
            label: 'INC Created',
            title: 'INC Created',
            description: 'When an incident is created.',
            supportStatus: 'operational',
            color: 'cyan',
          },
        },
        {
          id: assignRuleId,
          type: 'action',
          position: { x: 420, y: 80 },
          data: {
            catalogKey: 'action.assign',
            label: `Assign to ${input.teamName || 'IT Team'}`,
            title: 'Assign to IT Team',
            description: 'Routes the incident to IT. An omitted assignment stops only this routing branch.',
            supportStatus: 'operational',
            color: 'emerald',
            actionType: 'assign',
            assignmentMode: 'team',
            departmentId: input.departmentId,
            departmentName: input.departmentName,
            teamId: input.teamId,
            teamName: input.teamName,
            overwriteExisting: false,
            onOmitted: 'stop',
          },
        },
        {
          id: workItemRuleId,
          type: 'action',
          position: { x: 420, y: 260 },
          data: {
            catalogKey: 'action.create_incident_work',
            label: 'Create Incident Work',
            title: 'Create Incident Work',
            description: 'Creates initial troubleshooting work item.',
            supportStatus: 'operational',
            color: 'emerald',
            actionType: 'createIncidentWork',
            workKey: workItemConfig.work_key,
            workTitle: workItemConfig.title,
            workInstructions: workItemConfig.instructions,
            workRequired: workItemConfig.required,
            workDueMinutes: String(workItemConfig.due_in_minutes),
          },
        },
      ],
      edges: [
        { id: `e-${triggerId}-${assignRuleId}`, source: triggerId, target: assignRuleId },
        { id: `e-${triggerId}-${workItemRuleId}`, source: triggerId, target: workItemRuleId },
      ],
    },
    execution_plan: {
      version: 1,
      entrypoints: [triggerId],
      nodes: [
        {
          id: triggerId,
          kind: 'trigger',
          type: 'ticket_created',
          next: [assignRuleId, workItemRuleId],
        },
        {
          id: assignRuleId,
          kind: 'action',
          action: 'asignar_automatico',
          on_omitted: 'stop',
          next: [],
        },
        {
          id: workItemRuleId,
          kind: 'action',
          action: 'create_incident_work_item',
          next: [],
        },
      ],
    },
  };
}

/**
 * Builds a reviewable draft for Blueprint B: Incident Service Escalation to RFC.
 * Enforces exact backend configuration and locked request_approval: true.
 */
export function buildBlueprintBDraft(): SaveDraftInput {
  const triggerId = crypto.randomUUID();
  const rfcRuleId = crypto.randomUUID();

  const serviceEscalationConfig: WorkflowServiceEscalationConfig = {
    service_affected: 'Field Services',
    change_type: 'normal',
    impact: 'medium',
    probability: 'low',
    urgency: 'medium',
    lead_time_minutes: 60,
    duration_minutes: 120,
    implementation_plan: 'Services will inspect the affected site and devices, perform the approved corrective work, and record evidence.',
    rollback_plan: 'Stop work, restore the prior configuration or equipment state, and notify IT and interested areas.',
    validation_plan: 'IT validates service health, recording, playback, detections, and the original incident symptoms after field work.',
    request_approval: true,
  };

  return {
    categoria_id: 'INC',
    version: 1,
    reglas: [
      {
        id: rfcRuleId,
        accion: 'create_service_rfc',
        condicion: 'siempre',
        demora_segundos: 0,
        config: serviceEscalationConfig satisfies WorkflowServiceEscalationConfig,
      },
    ],
    layout: {
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          position: { x: 80, y: 160 },
          data: {
            catalogKey: 'incident.service_required',
            label: 'Service Required',
            title: 'Service Required',
            description: 'When IT documents that the incident requires field or service work.',
            supportStatus: 'operational',
            color: 'cyan',
          },
        },
        {
          id: rfcRuleId,
          type: 'action',
          position: { x: 450, y: 160 },
          data: {
            catalogKey: 'action.create_service_rfc',
            label: 'Create Service RFC',
            title: 'Create Service RFC',
            description: 'Creates a related RFC from documented troubleshooting.',
            supportStatus: 'operational',
            color: 'emerald',
            actionType: 'createServiceRfc',
            serviceAffected: serviceEscalationConfig.service_affected,
            changeType: serviceEscalationConfig.change_type,
            impact: serviceEscalationConfig.impact,
            probability: serviceEscalationConfig.probability,
            urgency: serviceEscalationConfig.urgency,
            leadTimeMinutes: String(serviceEscalationConfig.lead_time_minutes),
            durationMinutes: String(serviceEscalationConfig.duration_minutes),
            implementationPlan: serviceEscalationConfig.implementation_plan,
            rollbackPlan: serviceEscalationConfig.rollback_plan,
            validationPlan: serviceEscalationConfig.validation_plan,
            requestApproval: true,
          },
        },
      ],
      edges: [
        { id: `e-${triggerId}-${rfcRuleId}`, source: triggerId, target: rfcRuleId },
      ],
    },
    execution_plan: {
      version: 1,
      entrypoints: [triggerId],
      nodes: [
        {
          id: triggerId,
          kind: 'trigger',
          type: 'incident_service_required',
          next: [rfcRuleId],
        },
        {
          id: rfcRuleId,
          kind: 'action',
          action: 'create_service_rfc',
          next: [],
        },
      ],
    },
  };
}
