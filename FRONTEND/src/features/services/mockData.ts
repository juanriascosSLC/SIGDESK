import type { Dealership, RecurringProblem, SrvTicket, Subcontractor, DealershipPOC } from './types';

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
  },
];

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
