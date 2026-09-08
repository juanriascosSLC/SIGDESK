import { REQUESTER_LABEL, ASSIGNED_TO_LABEL } from '../identity-labels';

export const ticketFieldLabels: Record<string, string> = {
  humanId: 'Ticket number',
  requester: REQUESTER_LABEL,
  assignee: ASSIGNED_TO_LABEL,
  createdAt: 'Created date',
  status: 'Status',
  mergedCount: 'Merged tickets',
};
