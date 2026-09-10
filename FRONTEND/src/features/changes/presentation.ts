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
  draft: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  assessment: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  pending_approval: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  approved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-300',
  scheduled: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  implementing: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-300',
  rolled_back: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  closed: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

/**
 * Etiquetas de estado de una Task de RFC. Viven aquí y no en el tablero
 * porque ahora hay dos superficies que las pintan: el plan de trabajo de la
 * RFC (quien gobierna el cambio) y «Mis tareas» (quien lo ejecuta). Con una
 * copia por vista, la misma tarea acabaría llamándose distinto en cada una.
 */
export const taskStatusMeta: Record<ChangeTaskStatus, { label: string; style: string }> = {
  pending: { label: 'Awaiting dependencies', style: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  ready: { label: 'Ready', style: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' },
  in_progress: { label: 'In progress', style: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  blocked: { label: 'Blocked', style: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  completed: { label: 'Completed', style: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  canceled: { label: 'Canceled', style: 'border-red-500/30 bg-red-500/10 text-red-300' },
};

export const riskStyles: Record<string, string> = {
  low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  medium: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  critical: 'border-red-500/30 bg-red-500/10 text-red-300',
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
