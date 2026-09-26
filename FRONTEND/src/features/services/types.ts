import type {
  AssignedChangeTask,
  AssignedChangeTaskFilter,
  ChangeTask,
  ChangeTaskStatus,
} from '@/features/changes/api';

/**
 * Services does not own a fourth case aggregate. A work order is the
 * operational projection of an RFC task directed to the Services department.
 * The RFC remains the change/governance record and the task remains the
 * authoritative assignment, dependency, evidence and lifecycle record.
 */
export type ServiceWorkOrder = AssignedChangeTask;
export type ServiceWorkOrderTask = ChangeTask;
export type ServiceWorkOrderStatus = ChangeTaskStatus;
export type ServiceWorkOrderScope = AssignedChangeTaskFilter;

export type WorkOrderAttention = 'overdue' | 'due-soon' | 'on-track' | 'none';

export interface WorkOrderAssetSnapshot {
  id: string;
  name: string;
  type: string;
  serial?: string;
  role?: string;
  siteAssetId?: string;
}

export interface WorkOrderAction {
  key: 'start' | 'block' | 'unblock' | 'complete' | 'reopen';
  label: string;
  requiresInput?: 'reason' | 'evidence';
}
