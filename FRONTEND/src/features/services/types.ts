export interface Dealership {
  id: string;
  name: string;
  city: string;
  state: string;
  /** Groups subcontractor coverage — matches a Subcontractor's own
   *  `region` field exactly, so SubcontractorPicker can filter by it. */
  region: string;
}

export type ProblemSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RecurringProblem {
  id: string;
  dealershipId: string;
  title: string;
  severity: ProblemSeverity;
  occurredAt: string; // ISO date
}

export type EquipmentItemStatus = 'confirmed' | 'missing' | 'in_transit';

export interface EquipmentChecklistItem {
  id: string;
  label: string;
  quantity: number;
  status: EquipmentItemStatus;
  /** Present when this item's status couldn't be confirmed against
   *  inventory — rendered as a per-item warning; the rest of the checklist
   *  stays intact (Design Review Pass 2, SrvDetail "Error" column — this
   *  is a per-item concern, not a whole-page error). */
  validationError?: string;
  /** True while this single item is still resolving — lets the checklist
   *  render some items settled and one with an inline spinner (Design
   *  Review Pass 2, SrvDetail "Partial" column) instead of gating the
   *  whole list behind one loading flag. */
  isValidating?: boolean;
}

/**
 * The ticket-list status pill vocabulary from the mockup (Design Review
 * Pass 5). NOT the 6-stage Diagnosis→Closure progress stepper — that's
 * Recommended Approach step 7, explicit PR2 scope (see this plan's header
 * and SrvDetail's own doc comment).
 */
export type SrvStatus =
  | 'requires_action'
  | 'ready'
  | 'equipment_delivered'
  | 'waiting'
  | 'awaiting_info'
  | 'today'
  | 'service_completed';

export interface SrvTicket {
  id: string;
  humanId: string;
  dealershipId: string;
  title: string;
  status: SrvStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  equipment: EquipmentChecklistItem[];
  subcontractorId?: string;
  /**
   * Placeholder grouping for ServicesDashboard's My Work/Team/All tabs —
   * SRV has no real assignment model yet (Open Questions,
   * services-department-frontend.md). 'mine' tickets show under all three
   * tabs, 'team' under Team+All, 'unassigned' under All only. Documented
   * here so it isn't mistaken for real session-identity-based filtering.
   */
  assignedScope: 'mine' | 'team' | 'unassigned';
  createdAt: string;
}

/**
 * Proposed shape, pending the ADR of `organization_service`/
 * `resource_service` (Premise 4, services-department-frontend.md) —
 * Subcontractor is not a real domain entity yet, just a typed mock the
 * picker renders against.
 */
export interface Subcontractor {
  id: string;
  name: string;
  region: string;
  skills: string[];
}

/**
 * Proposed shape, pending the same ADR as Subcontractor above — a
 * dealership's receiving contact, modeled here as a typed mock.
 */
export interface DealershipPOC {
  dealershipId: string;
  name: string;
  role: string;
  phone: string;
  email: string;
}
