import type { EntityRecord } from '@/features/catalog/metamodel';
import type { ChangeTaskStatus } from './api';

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
