import { mockQuery, mockQueryError } from '@/lib/mockQuery';
import {
  MOCK_DEALERSHIPS,
  MOCK_RECURRING_PROBLEMS,
  MOCK_SRV_TICKETS,
  MOCK_SUBCONTRACTORS,
  MOCK_POCS,
  ERROR_DEMO_DEALERSHIP_ID,
  ERROR_DEMO_SRV_ID,
} from './mockData';
import type { Dealership, RecurringProblem, SrvTicket, Subcontractor, DealershipPOC } from './types';

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

export async function listSrvTickets(): Promise<SrvTicket[]> {
  return mockQuery(MOCK_SRV_TICKETS);
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
