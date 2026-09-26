import type { BadgeTone } from '@/components/ui';
import type { ChangeTask, ChangeTaskStatus } from '@/features/changes/api';
import type {
  WorkOrderAction,
  WorkOrderAssetSnapshot,
  WorkOrderAttention,
} from './types';

export const WORK_ORDER_STATUS: Record<ChangeTaskStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Awaiting dependencies', tone: 'neutral' },
  ready: { label: 'Ready to start', tone: 'primary' },
  in_progress: { label: 'In progress', tone: 'info' },
  blocked: { label: 'Blocked', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  canceled: { label: 'Canceled', tone: 'danger' },
};

export const PRIORITY_TONE: Record<string, BadgeTone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger',
};

export const WORK_ORDER_STAGE: Record<string, string> = {
  services_schedule: 'Planning',
  services_field_work: 'Field execution',
  services_closeout: 'Closeout',
};

export function workOrderStage(task: ChangeTask): string {
  return task.workflowKey ? WORK_ORDER_STAGE[task.workflowKey] ?? 'Work order' : 'Work order';
}

export function workOrderGovernanceBlock(task: ChangeTask, changeState: string): string | undefined {
  if (task.status === 'ready' && task.workflowKey === 'services_field_work' && changeState !== 'implementing') {
    return 'Field execution is ready, but it cannot start until Change Management moves the source RFC to Implementing.';
  }
  return undefined;
}

export function actionsForWorkOrder(status: ChangeTaskStatus, governanceBlocked = false): WorkOrderAction[] {
  if (governanceBlocked) return [];
  switch (status) {
    case 'ready':
      return [{ key: 'start', label: 'Start work' }];
    case 'in_progress':
      return [
        { key: 'complete', label: 'Complete with evidence', requiresInput: 'evidence' },
        { key: 'block', label: 'Report blocker', requiresInput: 'reason' },
      ];
    case 'blocked':
      // The domain's `unblock` transition returns the task to `ready`; work
      // must be started explicitly afterwards. Keep the label honest instead
      // of implying an automatic blocked -> in_progress transition.
      return [{ key: 'unblock', label: 'Clear blocker' }];
    case 'completed':
    case 'canceled':
      return [{ key: 'reopen', label: 'Reopen' }];
    default:
      return [];
  }
}

export function workOrderAttention(task: ChangeTask, now = Date.now()): WorkOrderAttention {
  if (!task.dueAt || task.status === 'completed' || task.status === 'canceled') return 'none';
  const dueAt = new Date(task.dueAt).getTime();
  if (!Number.isFinite(dueAt)) return 'none';
  const remaining = dueAt - now;
  if (remaining < 0) return 'overdue';
  if (remaining <= 24 * 60 * 60 * 1000) return 'due-soon';
  return 'on-track';
}

export function workOrderSiteId(task: ChangeTask): string | undefined {
  return task.assetContext?.siteAssetId;
}

export function workOrderAssets(task: ChangeTask): WorkOrderAssetSnapshot[] {
  return (task.assetContext?.links ?? []).map((link) => {
    const snapshot = link.snapshot ?? {};
    return {
      id: link.assetId,
      name: stringValue(snapshot.displayName) || stringValue(snapshot.name) || 'Asset unavailable',
      type: stringValue(snapshot.assetType) || stringValue(snapshot.type) || 'asset',
      serial: stringValue(snapshot.serial) || undefined,
      role: link.role || undefined,
      siteAssetId: stringValue(snapshot.siteAssetId) || task.assetContext?.siteAssetId,
    };
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
