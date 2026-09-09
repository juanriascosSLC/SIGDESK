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

/**
 * The 6 progress stages of a service visit (Recommended Approach step 7,
 * services-department-frontend.md). Deliberately NOT the same axis as
 * `SrvStatus` above: the pill vocabulary describes urgency, the stage
 * describes position in the visit. Which of the two is authoritative once
 * there is real wiring is the SRV ADR's job (Open Questions) — PR2 mocks
 * both and documents the split rather than silently picking a winner.
 */
export type SrvStage =
  | 'diagnosis'
  | 'approval'
  | 'equipment'
  | 'scheduling'
  | 'service'
  | 'closure';

/**
 * A deviation from plain forward progress on the current stage.
 *
 * `returned` is a REVERSAL (the destination department sent the visit back),
 * never a 7th stage — adding one would render rejection as forward progress.
 * `unconfirmed` is the backend being unable to confirm the transition.
 *
 * They render differently on purpose, and neither uses the amber ⚠: that
 * symbol already means "could not validate this equipment item" in
 * SrvDetail. One symbol, one meaning.
 */
export type SrvStageFlag = 'returned' | 'unconfirmed';

/**
 * An IT ticket (INC/PRB) covered by one service visit.
 *
 * Proposed shape, pending the ADR of `entity_key SRV` — the relation
 * SRV → tickets[] does not exist in any backend domain yet, and none of
 * "work order", "quote" or "invoice" is in Docs/glossary.md. Typed here the
 * same way PR1 typed `Subcontractor`/`DealershipPOC`, and requested
 * explicitly in docs/handoff/2026-09-05-services-pr2.md.
 */
export interface CoveredTicket {
  id: string;
  /** Visible number, per the glossary convention entity_key + "-" + sequence. */
  humanId: string;
  entityKey: 'INC' | 'PRB';
  title: string;
}

export interface SrvTicket {
  id: string;
  humanId: string;
  dealershipId: string;
  title: string;
  status: SrvStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  equipment: EquipmentChecklistItem[];
  /**
   * The IT tickets resolved during this visit. One SRV is the visit, and the
   * visit bundles several INC/PRB — the same bundling `RecurringProblemsPanel`
   * surfaces from the dealership side.
   */
  coveredTickets: CoveredTicket[];
  currentStage: SrvStage;
  stageFlag?: SrvStageFlag;
  /** Which department sent it back. Only meaningful with stageFlag 'returned'. */
  returnedBy?: string;
  /** Who the visit is waiting on when the next action is not ours to take. */
  awaitingActor?: string;
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

/**
 * Money amounts are decimal STRINGS, never numbers.
 *
 * A JSON number is an IEEE double and silently loses cents. This is also why
 * nothing in this file exposes a computed total: the frontend never derives
 * money (docs/design-rules.md R-8). Rounding and tax rules belong to the
 * backend, and a UI that recomputes them ends up disagreeing with the
 * invoice of record.
 */
export type MoneyString = string;

export interface MoneyTotals {
  subTotal: MoneyString;
  discount: MoneyString;
  totalNet: MoneyString;
  shippingCost: MoneyString;
  salesTax: MoneyString;
  total: MoneyString;
}

/**
 * One line of the subcontractor quote: the work requested for one covered
 * ticket during this visit.
 */
export interface QuoteLineItem {
  ticketId: string;
  /**
   * Present on exactly ONE line per visit, absent on the rest.
   *
   * Travel is a per-visit cost, not a per-ticket one. Putting it on every row
   * would bill N trips that never happened — the shape of the data prevents
   * that, rather than relying on anyone noticing later.
   */
  travelRate?: MoneyString;
  price: MoneyString;
  taxRatePct: string;
  additionalHourRate: MoneyString;
  hourQuantity: string;
}

/**
 * What SIG Systems PAYS the subcontractor for this visit.
 *
 * Proposed shape, pending ADR — see CoveredTicket. Distinct from
 * CustomerInvoice below: they are two documents in opposite money
 * directions, and the UI always labels which is which.
 */
export interface VendorQuote {
  subcontractorId: string;
  /** ISO 4217, e.g. "USD". Never assumed by the formatter. */
  currency: string;
  lineItems: QuoteLineItem[];
  totals: MoneyTotals;
}

export type InvoiceStatus = 'pendiente' | 'recibido' | 'verificado' | 'enviado_a_accounting';

/** What SIG Systems CHARGES the dealership for this visit. */
export interface CustomerInvoice {
  dealershipId: string;
  currency: string;
  status: InvoiceStatus;
  totals: MoneyTotals;
}

/**
 * Both sides of the money for one visit. Either side can be absent (not
 * quoted yet / not invoiced yet) without the other being absent.
 */
export interface SrvQuoteSummary {
  srvId: string;
  vendorQuote: VendorQuote | null;
  customerInvoice: CustomerInvoice | null;
}
