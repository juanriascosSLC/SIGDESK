import type {
  Dealership,
  RecurringProblem,
  SrvTicket,
  Subcontractor,
  DealershipPOC,
  SrvQuoteSummary,
} from './types';

/** Deliberately broken dealership id — every mock query keyed off it
 *  rejects (except getDealershipPOC, which by design never rejects — see
 *  api.ts), so Playwright specs can hit ErrorState/retry deterministically
 *  without random failure injection. Never render this in a "real" list;
 *  it exists only to be navigated to directly by id. */
export const ERROR_DEMO_DEALERSHIP_ID = 'dealership-error-demo';
export const ERROR_DEMO_SRV_ID = 'srv-error-demo';

export const MOCK_DEALERSHIPS: Dealership[] = [
  { id: 'dealership-atl-01', name: 'Sunrise Auto Group', city: 'Atlanta', state: 'GA', region: 'Atlanta, GA' },
  { id: 'dealership-chg-01', name: 'Lakeshore Motors', city: 'Chicago', state: 'IL', region: 'Chicago, IL' },
  { id: ERROR_DEMO_DEALERSHIP_ID, name: 'Errored Dealership (E2E fixture)', city: '—', state: '—', region: 'ERROR_DEMO_REGION' },
];

export const MOCK_RECURRING_PROBLEMS: RecurringProblem[] = [
  {
    id: 'rp-1',
    dealershipId: 'dealership-atl-01',
    title: 'Elevator lift intermittent fault',
    severity: 'high',
    occurredAt: '2026-08-12T09:00:00Z',
  },
  {
    id: 'rp-2',
    dealershipId: 'dealership-atl-01',
    title: 'Bay door sensor misaligned',
    severity: 'medium',
    occurredAt: '2026-07-30T14:00:00Z',
  },
  // dealership-chg-01 intentionally has zero entries here — exercises
  // RecurringProblemsPanel's reassuring empty state (Design Review Pass 2).
];

export const MOCK_SRV_TICKETS: SrvTicket[] = [
  {
    id: 'srv-1001',
    humanId: 'SRV-1001',
    dealershipId: 'dealership-atl-01',
    title: 'Elevator inspection — 15ft ladder required',
    status: 'requires_action',
    priority: 'High',
    equipment: [
      { id: 'eq-1', label: 'Telescoping ladder, 15ft minimum', quantity: 1, status: 'missing' },
      { id: 'eq-2', label: 'Contact cleaner kit', quantity: 2, status: 'confirmed' },
      { id: 'eq-3', label: 'Insulated gloves, size L', quantity: 1, status: 'in_transit', isValidating: true },
    ],
    subcontractorId: 'sub-nighthawk',
    assignedScope: 'mine',
    createdAt: '2026-09-01T10:00:00Z',
    // Three IT tickets bundled into one trip — the same bundling
    // RecurringProblemsPanel surfaces from the dealership side.
    coveredTickets: [
      { id: 'inc-1042', humanId: 'INC-1042', entityKey: 'INC', title: 'Showroom network switch has no link' },
      { id: 'inc-1051', humanId: 'INC-1051', entityKey: 'INC', title: 'Lot camera offline' },
      { id: 'prb-0308', humanId: 'PRB-0308', entityKey: 'PRB', title: 'Recurring power dips in the service bay' },
    ],
    currentStage: 'equipment',
  },
  {
    id: 'srv-1002',
    humanId: 'SRV-1002',
    dealershipId: 'dealership-chg-01',
    title: 'Bay door sensor realignment',
    status: 'waiting',
    priority: 'Medium',
    equipment: [
      {
        id: 'eq-4',
        label: 'Sensor alignment kit',
        quantity: 1,
        status: 'confirmed',
        validationError: 'Could not confirm against inventory',
      },
    ],
    assignedScope: 'team',
    createdAt: '2026-09-03T08:30:00Z',
    coveredTickets: [
      { id: 'inc-1077', humanId: 'INC-1077', entityKey: 'INC', title: 'Bay door will not close fully' },
    ],
    // Waiting on someone else — exercises the disabled Next Action with an
    // explicit "who are we waiting on" sentence.
    currentStage: 'approval',
    awaitingActor: 'the Services approver',
  },
  {
    // Exercises the two stage flags that are NOT plain forward progress:
    // returned by the destination department, on a visit that also has an
    // unconfirmed transition elsewhere. Both render without the amber ⚠.
    id: 'srv-1003',
    humanId: 'SRV-1003',
    dealershipId: 'dealership-atl-01',
    title: 'Compressor line inspection — returned by IT',
    status: 'awaiting_info',
    priority: 'High',
    equipment: [
      { id: 'eq-5', label: 'Pressure gauge set', quantity: 1, status: 'confirmed' },
    ],
    assignedScope: 'mine',
    createdAt: '2026-09-04T11:15:00Z',
    coveredTickets: [
      { id: 'prb-0311', humanId: 'PRB-0311', entityKey: 'PRB', title: 'Compressor trips breaker under load' },
    ],
    currentStage: 'diagnosis',
    stageFlag: 'returned',
    returnedBy: 'IT',
  },
  {
    id: ERROR_DEMO_SRV_ID,
    humanId: 'SRV-ERR',
    dealershipId: ERROR_DEMO_DEALERSHIP_ID,
    title: 'Errored SRV (E2E fixture)',
    status: 'requires_action',
    priority: 'Low',
    equipment: [],
    assignedScope: 'unassigned',
    createdAt: '2026-09-01T00:00:00Z',
    coveredTickets: [],
    currentStage: 'diagnosis',
  },
];

/**
 * Both money documents per visit, keyed by SRV id.
 *
 * All amounts are decimal strings and every total is pre-computed here: the
 * card renders them, it never derives them (docs/design-rules.md R-8). The
 * numbers below are internally consistent so a reader checking the arithmetic
 * by hand finds it correct — but the UI would render them unchanged either
 * way, which is the point.
 */
export const MOCK_QUOTE_SUMMARIES: Record<string, SrvQuoteSummary> = {
  'srv-1001': {
    srvId: 'srv-1001',
    vendorQuote: {
      subcontractorId: 'sub-nighthawk',
      currency: 'USD',
      lineItems: [
        // Travel is charged once for the whole visit, on this line only.
        { ticketId: 'inc-1042', travelRate: '125.00', price: '180.00', taxRatePct: '8.5', additionalHourRate: '95.00', hourQuantity: '1.5' },
        { ticketId: 'inc-1051', price: '140.00', taxRatePct: '8.5', additionalHourRate: '95.00', hourQuantity: '1.0' },
        { ticketId: 'prb-0308', price: '160.00', taxRatePct: '8.5', additionalHourRate: '95.00', hourQuantity: '2.0' },
      ],
      totals: {
        subTotal: '605.00',
        discount: '30.00',
        totalNet: '575.00',
        shippingCost: '45.00',
        salesTax: '52.70',
        total: '672.70',
      },
    },
    customerInvoice: {
      dealershipId: 'dealership-atl-01',
      currency: 'USD',
      status: 'pendiente',
      totals: {
        subTotal: '910.00',
        discount: '0.00',
        totalNet: '910.00',
        shippingCost: '45.00',
        salesTax: '81.18',
        total: '1036.18',
      },
    },
  },
  // Quoted but not yet invoiced — exercises one side present, one absent.
  'srv-1002': {
    srvId: 'srv-1002',
    vendorQuote: {
      subcontractorId: 'sub-ironclad',
      currency: 'USD',
      lineItems: [
        { ticketId: 'inc-1077', travelRate: '110.00', price: '95.00', taxRatePct: '9.0', additionalHourRate: '85.00', hourQuantity: '1.0' },
      ],
      totals: {
        subTotal: '290.00',
        discount: '0.00',
        totalNet: '290.00',
        shippingCost: '0.00',
        salesTax: '26.10',
        total: '316.10',
      },
    },
    customerInvoice: null,
  },
  // Neither side yet — exercises the empty state of the whole card.
  'srv-1003': {
    srvId: 'srv-1003',
    vendorQuote: null,
    customerInvoice: null,
  },
};

export const MOCK_SUBCONTRACTORS: Subcontractor[] = [
  {
    id: 'sub-nighthawk',
    name: 'Nighthawk Technologies Solutions',
    region: 'Atlanta, GA',
    skills: ['Elevator lift', 'Electrical', 'HVAC'],
  },
  {
    id: 'sub-ironclad',
    name: 'Ironclad Facilities Services',
    region: 'Atlanta, GA',
    skills: ['Bay doors', 'General maintenance'],
  },
  // Chicago, IL intentionally has zero coverage — exercises
  // SubcontractorPicker's "request coverage" empty state.
];

export const MOCK_POCS: DealershipPOC[] = [
  {
    dealershipId: 'dealership-atl-01',
    name: 'Marcus Webb',
    role: 'Site Facilities Manager',
    phone: '+1 (404) 555-0142',
    email: 'mwebb@sunriseauto.example',
  },
  // dealership-chg-01 intentionally has no POC — exercises POCCard's
  // empty state.
];
