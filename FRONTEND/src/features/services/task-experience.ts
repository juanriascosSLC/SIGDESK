import type { ChangeTask, ChangeTaskOutcomeCode } from '@/features/changes/api';

export interface TaskOutcomeDefinition {
  code: ChangeTaskOutcomeCode;
  label: string;
  description: string;
  requiresParts?: boolean;
}

export interface TaskExperienceDefinition {
  key: ChangeTask['workType'];
  label: string;
  objective: string;
  notesLabel: string;
  notesHelp: string;
  evidenceLabel: string;
  evidenceHelp: string;
  outcomes: TaskOutcomeDefinition[];
}

// Built-in templates are the backwards-compatible baseline. A published
// TaskTemplate version will override these presentation instructions without
// changing the domain transition/outcome contract enforced by change_service.
export const BUILTIN_TASK_EXPERIENCES: Partial<Record<ChangeTask['workType'], TaskExperienceDefinition>> = {
  inventory_readiness: {
    key: 'inventory_readiness',
    label: 'Inventory readiness',
    objective: 'Determine whether field execution can proceed with available inventory.',
    notesLabel: 'Readiness findings',
    notesHelp: 'Record each verification or inventory finding separately.',
    evidenceLabel: 'Verification evidence',
    evidenceHelp: 'Add inventory references, screenshots, quotes or inspection evidence.',
    outcomes: [
      { code: 'parts_not_required', label: 'No parts required', description: 'Purchasing is not applicable and scheduling may continue.' },
      { code: 'parts_required', label: 'Parts required', description: 'Create the governed purchasing request and block scheduling.', requiresParts: true },
    ],
  },
  service_scheduling: {
    key: 'service_scheduling',
    label: 'Service scheduling',
    objective: 'Confirm the approved execution window and operational coordination.',
    notesLabel: 'Coordination notes',
    notesHelp: 'Record contacts, access requirements and confirmed constraints.',
    evidenceLabel: 'Schedule evidence',
    evidenceHelp: 'Add the confirmation or calendar reference supporting the schedule.',
    outcomes: [
      { code: 'schedule_confirmed', label: 'Schedule confirmed', description: 'The field Work Order has a valid execution window.' },
    ],
  },
  field_work_order: {
    key: 'field_work_order',
    label: 'Field Work Order',
    objective: 'Execute the approved on-site work and preserve a complete technical record.',
    notesLabel: 'Work performed',
    notesHelp: 'Record each intervention, observation and validation as a separate entry.',
    evidenceLabel: 'Completion evidence',
    evidenceHelp: 'Reference measurements, photos, logs or uploaded Work Order files.',
    outcomes: [
      { code: 'work_completed', label: 'Work completed', description: 'The approved scope was completed successfully.' },
      { code: 'work_failed', label: 'Work failed', description: 'Execution did not restore the expected service.' },
      { code: 'additional_issue_found', label: 'Additional issue found', description: 'Preserve this cycle and start a new governed service cycle.' },
    ],
  },
  restoration_validation: {
    key: 'restoration_validation',
    label: 'Restoration validation',
    objective: 'Independently verify that service has been restored after field execution.',
    notesLabel: 'Validation steps',
    notesHelp: 'Record each technical or user validation performed.',
    evidenceLabel: 'Validation evidence',
    evidenceHelp: 'Add monitoring, test or requester-confirmation references.',
    outcomes: [
      { code: 'restoration_validated', label: 'Restoration validated', description: 'Service is operating as expected.' },
      { code: 'restoration_failed', label: 'Restoration failed', description: 'The incident must remain open for further governed work.' },
    ],
  },
  payment_approval: {
    key: 'payment_approval',
    label: 'Payment decision',
    objective: 'Record the governed financial disposition for the completed service.',
    notesLabel: 'Financial review',
    notesHelp: 'Record invoice, approval or rejection context without exposing secrets.',
    evidenceLabel: 'Financial evidence',
    evidenceHelp: 'Add approved document references or the basis for not requiring payment.',
    outcomes: [
      { code: 'payment_approved', label: 'Payment approved', description: 'The payment obligation is approved.' },
      { code: 'payment_rejected', label: 'Payment rejected', description: 'The payment gate remains unsuccessful.' },
      { code: 'payment_not_required', label: 'Payment not required', description: 'Financial processing is explicitly not applicable.' },
    ],
  },
  service_closeout: {
    key: 'service_closeout',
    label: 'Service closeout',
    objective: 'Confirm all technical, service, purchasing and financial gates are terminal.',
    notesLabel: 'Closeout checks',
    notesHelp: 'Record the final gate verification and handoff details.',
    evidenceLabel: 'Closeout evidence',
    evidenceHelp: 'Add references proving the service cycle is complete.',
    outcomes: [
      { code: 'closeout_completed', label: 'Close out service cycle', description: 'All required governed gates are successful.' },
    ],
  },
};

export function taskExperienceFor(task: ChangeTask): TaskExperienceDefinition | undefined {
  if (task.taskTemplate) {
    const fields = task.taskTemplate.fields;
    const noteField = fields.find((field) => field.key === 'work_notes' || field.key === 'notes');
    const evidenceField = fields.find((field) => field.evidence || field.type === 'attachment');
    return {
      key: task.workType,
      label: task.taskTemplate.title,
      objective: task.taskTemplate.summary,
      notesLabel: noteField?.label ?? 'Work notes',
      notesHelp: noteField?.helpText ?? 'Record the actions and findings separately.',
      evidenceLabel: evidenceField?.label ?? 'Evidence',
      evidenceHelp: evidenceField?.helpText ?? 'Add evidence references or upload task files.',
      outcomes: task.taskTemplate.outcomes.map((outcome) => ({
        code: outcome.code,
        label: outcome.label,
        description: outcome.description ?? '',
        requiresParts: outcome.code === 'parts_required',
      })),
    };
  }
  return BUILTIN_TASK_EXPERIENCES[task.workType];
}
