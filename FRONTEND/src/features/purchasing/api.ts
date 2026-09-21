import { apiRequest } from '@/lib/apiClient';

export type ServiceRequestStatus =
  | 'pending_manager_approval'
  | 'approved'
  | 'ordered'
  | 'shipped'
  | 'delivered'
  | 'rejected'
  | 'canceled';

export interface PurchaseLine {
  sku?: string;
  description: string;
  quantity: number;
}

export interface PurchaseOrder {
  reference: string;
  supplier: string;
  amount?: string;
  currency?: string;
  recordedBy: string;
  recordedAt: string;
  evidence: string[];
}

export interface PurchaseShipment {
  carrier: string;
  tracking: string;
  shippedBy: string;
  shippedAt: string;
  evidence: string[];
}

export interface PurchaseDelivery {
  receivedBy: string;
  deliveredAt: string;
  recordedBy: string;
  evidence: string[];
}

export interface ServiceRequestHistoryEntry {
  sequence: number;
  from?: ServiceRequestStatus;
  to: ServiceRequestStatus;
  actorId: string;
  reason?: string;
  occurredAt: string;
}

export interface ServiceRequest {
  id: number;
  humanId: string;
  incidentId: number;
  incidentHumanId: string;
  changeId: string;
  changeHumanId: string;
  requesterId: string;
  requesterName: string;
  organizationUnitId?: string;
  title: string;
  description: string;
  lines: PurchaseLine[];
  status: ServiceRequestStatus;
  managerId: string;
  managerDecisionAt?: string | null;
  purchaseOrder?: PurchaseOrder | null;
  shipment?: PurchaseShipment | null;
  delivery?: PurchaseDelivery | null;
  history: ServiceRequestHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ServiceRequestCommand {
  expectedRevision: number;
  reason?: string;
  reference?: string;
  supplier?: string;
  amount?: string;
  currency?: string;
  carrier?: string;
  tracking?: string;
  receivedBy?: string;
  evidence: string[];
  deliveredAt?: string;
}

function normalize(item: ServiceRequest): ServiceRequest {
  return {
    ...item,
    lines: Array.isArray(item.lines) ? item.lines : [],
    history: Array.isArray(item.history) ? item.history : [],
    purchaseOrder: item.purchaseOrder ? { ...item.purchaseOrder, evidence: item.purchaseOrder.evidence ?? [] } : null,
    shipment: item.shipment ? { ...item.shipment, evidence: item.shipment.evidence ?? [] } : null,
    delivery: item.delivery ? { ...item.delivery, evidence: item.delivery.evidence ?? [] } : null,
  };
}

export interface ServiceRequestPage {
  items: ServiceRequest[];
  nextCursor?: string;
}

export async function listServiceRequests(status?: ServiceRequestStatus, cursor?: string): Promise<ServiceRequestPage> {
  const params = new URLSearchParams({ limit: '30' });
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  const response = await apiRequest<{ items: ServiceRequest[]; nextCursor?: string }>(`/service-requests?${params}`);
  return { items: (response.items ?? []).map(normalize), nextCursor: response.nextCursor || undefined };
}

export async function getServiceRequest(id: string): Promise<ServiceRequest> {
  return normalize(await apiRequest<ServiceRequest>(`/service-requests/${encodeURIComponent(id)}`));
}

export async function executeServiceRequestCommand(
  id: number,
  command: 'approve' | 'reject' | 'record_purchase_order' | 'record_shipment' | 'record_delivery' | 'cancel',
  input: ServiceRequestCommand,
): Promise<ServiceRequest> {
  const response = await apiRequest<{ serviceRequest: ServiceRequest }>(`/service-requests/${id}/commands/${command}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ ...input, evidence: input.evidence ?? [] }),
  });
  return normalize(response.serviceRequest);
}
