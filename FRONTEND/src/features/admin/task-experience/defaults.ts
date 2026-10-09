import type { ChangeTaskOutcomeCode, ChangeTaskWorkType } from '@/features/changes/api';
import type { TaskTemplateDefinition } from './api';

const OUTCOMES: Record<Exclude<ChangeTaskWorkType, 'generic'>, Array<{ code: ChangeTaskOutcomeCode; label: string }>> = {
  inventory_readiness: [{ code: 'parts_not_required', label: 'No parts required' }, { code: 'parts_required', label: 'Parts required' }],
  service_scheduling: [{ code: 'schedule_confirmed', label: 'Schedule confirmed' }],
  field_work_order: [{ code: 'work_completed', label: 'Work completed' }, { code: 'work_failed', label: 'Work failed' }, { code: 'additional_issue_found', label: 'Additional issue found' }],
  restoration_validation: [{ code: 'restoration_validated', label: 'Restoration validated' }, { code: 'restoration_failed', label: 'Restoration failed' }],
  payment_approval: [{ code: 'payment_approved', label: 'Payment approved' }, { code: 'payment_rejected', label: 'Payment rejected' }, { code: 'payment_not_required', label: 'Payment not required' }],
  service_closeout: [{ code: 'closeout_completed', label: 'Closeout completed' }],
};

export const GOVERNED_WORK_TYPES = Object.keys(OUTCOMES) as Array<Exclude<ChangeTaskWorkType, 'generic'>>;

export const TASK_TEMPLATE_FAMILY: Record<Exclude<ChangeTaskWorkType, 'generic'>, string> = {
  inventory_readiness: 'inventory_readiness',
  service_scheduling: 'services_schedule',
  field_work_order: 'services_field_work',
  restoration_validation: 'it_post_work_validation',
  payment_approval: 'finance_payment_approval',
  service_closeout: 'services_closeout',
};

export function defaultTaskTemplate(workType: Exclude<ChangeTaskWorkType, 'generic'>): TaskTemplateDefinition {
  const label = workType.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
  return {
    title: label,
    summary: `Complete the governed ${label.toLowerCase()} task with a typed outcome and auditable evidence.`,
    instructions: ['Review the parent RFC and immutable asset context before starting.'],
    fields: [
      { key: 'work_notes', label: 'Work notes', type: 'textarea', required: true, multiple: true, helpText: 'Record each relevant action or finding separately.', options: [] },
      { key: 'evidence', label: 'Evidence', type: 'attachment', required: true, multiple: true, evidence: true, helpText: 'Attach or reference proof of the completed work.', options: [] },
    ],
    outcomes: OUTCOMES[workType].map((outcome) => ({ ...outcome, description: '', requiredFields: ['work_notes', 'evidence'] })),
    sections: [{ id: 'execution', title: 'Execution record', description: 'Required completion information', fieldKeys: ['work_notes', 'evidence'] }],
  };
}
