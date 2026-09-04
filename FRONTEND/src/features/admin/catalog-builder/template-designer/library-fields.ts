import type { DetailFieldSource, WidgetKey } from '@/features/catalog/metamodel';

// Ticket-owned fields a layout may reference by (source: 'ticket', fieldKey).
// Kept identical across create/edit/detail for this increment — the backend
// allow-list (allowedTicketFields) does not differentiate by view kind either.
export const ticketDetailFields: Array<{ source: DetailFieldSource; fieldKey: string; label: string }> = [
  { source: 'ticket', fieldKey: 'requester', label: 'Requester' },
  { source: 'ticket', fieldKey: 'assignee', label: 'Assigned to' },
  { source: 'ticket', fieldKey: 'createdAt', label: 'Creation date' },
  { source: 'ticket', fieldKey: 'status', label: 'Status' },
  { source: 'ticket', fieldKey: 'humanId', label: 'Ticket number' },
  { source: 'ticket', fieldKey: 'mergedCount', label: 'Merged tickets' },
];

export const widgetLibraryItems: Array<{ widgetKey: WidgetKey; label: string }> = [
  { widgetKey: 'sla', label: 'SLA' },
  { widgetKey: 'attachments', label: 'Attachments' },
  { widgetKey: 'activity', label: 'Activity & comments' },
];
