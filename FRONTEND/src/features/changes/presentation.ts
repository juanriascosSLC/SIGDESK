import type { EntityRecord } from '@/features/catalog/metamodel';
import type { ChangeTask, ChangeTaskStatus, ChangeTaskWorkType } from './api';

export const changeStateLabels: Record<string, string> = {
  draft: 'Draft',
  assessment: 'Assessment',
  pending_approval: 'Pending CAB',
  approved: 'Approved',
  rejected: 'Rejected',
  scheduled: 'Scheduled',
  implementing: 'Implementing',
  completed: 'Implemented',
  failed: 'Failed',
  rolled_back: 'Rolled back',
  closed: 'Closed',
};

export const changeStateStyles: Record<string, string> = {
  draft: 'border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg',
  assessment: 'border-status-info-border bg-status-info-bg text-status-info-fg',
  pending_approval: 'border-status-warning-border bg-status-warning-bg text-status-warning-fg',
  approved: 'border-status-success-border bg-status-success-bg text-status-success-fg',
  rejected: 'border-status-danger-border bg-status-danger-bg text-status-danger-fg',
  scheduled: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  implementing: 'border-primary/30 bg-primary/10 text-primary',
  completed: 'border-status-success-border bg-status-success-bg text-status-success-fg',
  failed: 'border-status-danger-border bg-status-danger-bg text-status-danger-fg',
  rolled_back: 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300',
  closed: 'border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg',
};

/**
 * Etiquetas de estado de una Task de RFC. Viven aquí y no en el tablero
 * porque ahora hay dos superficies que las pintan: el plan de trabajo de la
 * RFC (quien gobierna el cambio) y «Mis tareas» (quien lo ejecuta). Con una
 * copia por vista, la misma tarea acabaría llamándose distinto en cada una.
 */
export const taskStatusMeta: Record<ChangeTaskStatus, { label: string; style: string }> = {
  pending: { label: 'Awaiting dependencies', style: 'border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg' },
  ready: { label: 'Ready', style: 'border-primary/30 bg-primary/10 text-primary' },
  in_progress: { label: 'In progress', style: 'border-status-info-border bg-status-info-bg text-status-info-fg' },
  blocked: { label: 'Blocked', style: 'border-status-warning-border bg-status-warning-bg text-status-warning-fg' },
  completed: { label: 'Completed', style: 'border-status-success-border bg-status-success-bg text-status-success-fg' },
  canceled: { label: 'Canceled', style: 'border-status-danger-border bg-status-danger-bg text-status-danger-fg' },
};

export const taskWorkTypeMeta: Record<ChangeTaskWorkType, { label: string; stage: string; owner: string }> = {
  generic: { label: 'Operational task', stage: 'Execution', owner: 'Assigned team' },
  inventory_readiness: { label: 'Inventory readiness', stage: 'Parts decision', owner: 'Inventory / Services' },
  service_scheduling: { label: 'Field service scheduling', stage: 'Planning', owner: 'Services' },
  field_work_order: { label: 'Field Work Order', stage: 'Field execution', owner: 'Services' },
  restoration_validation: { label: 'Service restoration validation', stage: 'Technical validation', owner: 'IT' },
  payment_approval: { label: 'Payment disposition', stage: 'Financial gate', owner: 'Finance' },
  service_closeout: { label: 'Service closeout', stage: 'Closeout', owner: 'Services' },
};

export function isGovernedTask(task: Pick<ChangeTask, 'workType'>): boolean {
  return task.workType !== 'generic';
}

export type TaskAttention = 'none' | 'overdue' | 'due-soon' | 'on-track';

export function taskAttention(task: Pick<ChangeTask, 'dueAt' | 'status'>, now = Date.now()): TaskAttention {
  if (!task.dueAt || task.status === 'completed' || task.status === 'canceled') return 'none';
  const due = new Date(task.dueAt).getTime();
  if (!Number.isFinite(due)) return 'none';
  if (due < now) return 'overdue';
  if (due - now <= 24 * 60 * 60 * 1000) return 'due-soon';
  return 'on-track';
}

export const riskStyles: Record<string, string> = {
  low: 'border-status-success-border bg-status-success-bg text-status-success-fg',
  medium: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300',
  critical: 'border-status-danger-border bg-status-danger-bg text-status-danger-fg',
};

export function textData(change: EntityRecord, key: string): string {
  const value = change.data[key];
  return value === null || value === undefined ? '' : String(value);
}

export function formatDateTime(value: unknown): string {
  if (!value) return 'Not scheduled';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
