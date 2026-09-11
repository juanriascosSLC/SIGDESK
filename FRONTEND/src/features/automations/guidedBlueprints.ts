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
          position: { x: 420, y: 160 },
          data: {
            catalogKey: 'action.assign',
            label: `Assign to ${input.teamName || 'IT Team'}`,
            title: 'Assign to IT Team',
            description: 'Assigns automatically to IT team with on_omitted: stop.',
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
          position: { x: 780, y: 160 },
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
        { id: `e-${assignRuleId}-${workItemRuleId}`, source: assignRuleId, target: workItemRuleId },
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
          next: [assignRuleId],
        },
        {
          id: assignRuleId,
          kind: 'action',
          action: 'asignar_automatico',
          on_omitted: 'stop',
          next: [workItemRuleId],
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
