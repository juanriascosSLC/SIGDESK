import type { BadgeTone } from '@/components/ui/Badge';
import type {
  SrvStatus,
  EquipmentItemStatus,
  ProblemSeverity,
  SrvStage,
  InvoiceStatus,
  SrvTicket,
} from './types';

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

/** The 6 stages in order. The array IS the order — nothing else defines it. */
export const SRV_STAGES: SrvStage[] = [
  'diagnosis',
  'approval',
  'equipment',
  'scheduling',
  'service',
  'closure',
];

export const SRV_STAGE_LABELS: Record<SrvStage, string> = {
  diagnosis: 'Diagnosis',
  approval: 'Approval',
  equipment: 'Equipment',
  scheduling: 'Scheduling',
  service: 'Service',
  closure: 'Closure',
};

/**
 * Next Action copy per stage (spec §4).
 *
 * A generic "Continue" on all six loses the specificity the reference mockup
 * suggested, which is exactly the open decision Design Review Pass 7 flagged.
 *
 * Closure deliberately does NOT depend on invoice state: making the stepper's
 * terminal button wait on the quote card would give step 7 a hidden
 * dependency on step 5, so a slip in one breaks the other's acceptance
 * criteria. Sending the invoice to Accounting is the card's action.
 */
export const SRV_NEXT_ACTION_LABELS: Record<SrvStage, string> = {
  diagnosis: 'Submit for approval',
  approval: 'Waiting on approval',
  equipment: 'Confirm equipment checklist',
  scheduling: 'Schedule dispatch',
  service: 'Record service outcome',
  closure: 'Close ticket',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pendiente: 'Pendiente',
  recibido: 'Recibido',
  verificado: 'Verificado',
  enviado_a_accounting: 'Enviado a Accounting',
};

/** Reuses the same 4 tone meanings as everything else — no new colors. */
export const INVOICE_STATUS_TONES: Record<InvoiceStatus, BadgeTone> = {
  pendiente: 'warning',
  recibido: 'info',
  verificado: 'success',
  enviado_a_accounting: 'success',
};

export interface NextAction {
  label: string;
  description: string;
  disabled: boolean;
}

/**
 * What the single primary button on SrvDetail says and whether it is live.
 *
 * Two rules encoded here, both from docs/design-rules.md R-5:
 *  - A primary button never lies. When the actor is someone else, it is
 *    disabled AND says who we are waiting on.
 *  - Missing equipment keeps PR1's existing "Resolve blockers" behaviour
 *    rather than being replaced by the per-stage copy.
 */
export function nextActionFor(ticket: SrvTicket): NextAction {
  const hasMissingEquipment = ticket.equipment.some((item) => item.status === 'missing');

  if (ticket.stageFlag === 'returned') {
    return {
      label: 'Rework diagnosis',
      description: `Returned by ${ticket.returnedBy ?? 'the destination department'} — rework this stage before resubmitting.`,
      disabled: false,
    };
  }

  if (ticket.awaitingActor) {
    return {
      label: SRV_NEXT_ACTION_LABELS[ticket.currentStage],
      description: `Waiting on ${ticket.awaitingActor}.`,
      disabled: true,
    };
  }

  if (hasMissingEquipment) {
    return {
      label: 'Resolve blockers',
      description: 'Confirm the missing equipment below before dispatch.',
      disabled: false,
    };
  }

  return {
    label: SRV_NEXT_ACTION_LABELS[ticket.currentStage],
    description: 'No blocking action right now.',
    disabled: false,
  };
}

/**
 * Formats a decimal-string amount for display.
 *
 * Takes the string straight from the mock/backend and never does arithmetic
 * on it — parseFloat here is for RENDERING only (Intl needs a number), and
 * no total is ever derived from these values (docs/design-rules.md R-8).
 */
export function formatMoney(amount: string, currency: string): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return `${currency} ${amount}`;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(parsed);
}
