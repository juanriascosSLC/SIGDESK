import type { BadgeTone } from '@/components/ui/Badge';
import type { SrvStatus, EquipmentItemStatus, ProblemSeverity } from './types';

export const SRV_STATUS_LABELS: Record<SrvStatus, string> = {
  requires_action: 'Requires Action',
  ready: 'Ready',
  equipment_delivered: 'Equipment Delivered',
  waiting: 'Waiting',
  awaiting_info: 'Awaiting Info',
  today: 'Today',
  service_completed: 'Service Completed',
};

/** Design Review Pass 5's exact mapping — reuses the same 4 tone
 *  meanings tickets/SLA severity already use, no new colors invented. */
export const SRV_STATUS_TONES: Record<SrvStatus, BadgeTone> = {
  requires_action: 'danger',
  ready: 'success',
  equipment_delivered: 'success',
  waiting: 'warning',
  awaiting_info: 'warning',
  today: 'info',
  service_completed: 'info',
};

export const EQUIPMENT_ITEM_LABELS: Record<EquipmentItemStatus, string> = {
  confirmed: 'Confirmed',
  missing: 'Missing',
  in_transit: 'In transit',
};

export const EQUIPMENT_ITEM_TONES: Record<EquipmentItemStatus, BadgeTone> = {
  confirmed: 'success',
  missing: 'danger',
  in_transit: 'warning',
};

export const PROBLEM_SEVERITY_TONES: Record<ProblemSeverity, BadgeTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
