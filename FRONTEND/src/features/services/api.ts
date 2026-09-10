import { mockQuery, mockQueryError } from '@/lib/mockQuery';
import {
  MOCK_DEALERSHIPS,
  MOCK_RECURRING_PROBLEMS,
  MOCK_SRV_TICKETS,
  MOCK_SUBCONTRACTORS,
  MOCK_POCS,
  MOCK_QUOTE_SUMMARIES,
  ERROR_DEMO_DEALERSHIP_ID,
  ERROR_DEMO_SRV_ID,
} from './mockData';
import type {
  Dealership,
  RecurringProblem,
  SrvTicket,
  Subcontractor,
  DealershipPOC,
  SrvQuoteSummary,
} from './types';

export async function listDealerships(): Promise<Dealership[]> {
  return mockQuery(MOCK_DEALERSHIPS);
}

export async function getDealership(id: string): Promise<Dealership> {
  const found = MOCK_DEALERSHIPS.find((d) => d.id === id);
  if (!found) return mockQueryError(`Dealership ${id} not found`);
  return mockQuery(found);
}

export async function listRecurringProblems(dealershipId: string): Promise<RecurringProblem[]> {
  if (dealershipId === ERROR_DEMO_DEALERSHIP_ID) {
    return mockQueryError('No se pudo cargar el historial de este sitio');
  }
  return mockQuery(MOCK_RECURRING_PROBLEMS.filter((p) => p.dealershipId === dealershipId));
}

/**
 * Excludes the error-demo sentinel — it's an E2E fixture meant to be hit
 * directly by id (getSrvTicket), never to appear as a normal-looking row a
 * real agent could click into and land on a guaranteed error page (Codex
 * structured review finding).
 */
export async function listSrvTickets(): Promise<SrvTicket[]> {
  return mockQuery(MOCK_SRV_TICKETS.filter((t) => t.id !== ERROR_DEMO_SRV_ID));
}

export async function getSrvTicket(id: string): Promise<SrvTicket> {
  if (id === ERROR_DEMO_SRV_ID) return mockQueryError('No se pudo cargar este ticket SRV');
  const found = MOCK_SRV_TICKETS.find((t) => t.id === id);
  if (!found) return mockQueryError(`SRV ${id} not found`);
  return mockQuery(found);
}

export async function listSubcontractors(region: string): Promise<Subcontractor[]> {
  if (region === 'ERROR_DEMO_REGION') return mockQueryError('No se pudo cargar subcontractors');
  return mockQuery(MOCK_SUBCONTRACTORS.filter((s) => s.region === region));
}

/**
 * No Error state exists for POCCard by design (Design Review Pass 2 — its
 * table lists "—" in the Error column) — this never rejects, only
 * resolves to a POC or null, even for the error-demo dealership.
 */
export async function getDealershipPOC(dealershipId: string): Promise<DealershipPOC | null> {
  return mockQuery(MOCK_POCS.find((poc) => poc.dealershipId === dealershipId) ?? null);
}

/**
 * Both money documents for one visit.
 *
 * Rejects for the error-demo sentinel so QuoteCard's own ErrorState is
 * reachable from a spec — and, importantly, it is a PANEL-level error: the
 * rest of SrvDetail stays up (Design Review Pass 2's rule that one panel
 * failing never takes the page down).
 *
 * A visit with no quote and no invoice yet resolves to a summary with both
 * sides null. That is an empty state, not an error.
 */
export async function getSrvQuoteSummary(srvId: string): Promise<SrvQuoteSummary> {
  if (srvId === ERROR_DEMO_SRV_ID) {
    return mockQueryError('No se pudo cargar la cotización de esta visita');
  }
  return mockQuery(
    MOCK_QUOTE_SUMMARIES[srvId] ?? { srvId, vendorQuote: null, customerInvoice: null },
  );
}
