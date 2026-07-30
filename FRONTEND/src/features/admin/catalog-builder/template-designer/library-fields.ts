import type { DetailFieldSource, WidgetKey } from '@/features/catalog/metamodel';

// Ticket-owned fields a layout may reference by (source: 'ticket', fieldKey).
// Kept identical across create/edit/detail for this increment — the backend
// allow-list (allowedTicketFields) does not differentiate by view kind either.
export const ticketDetailFields: Array<{ source: DetailFieldSource; fieldKey: string; label: string }> = [
  { source: 'ticket', fieldKey: 'requester', label: 'Solicitante' },
  { source: 'ticket', fieldKey: 'assignee', label: 'Asignado a' },
  { source: 'ticket', fieldKey: 'createdAt', label: 'Fecha de creación' },
  { source: 'ticket', fieldKey: 'status', label: 'Estado' },
  { source: 'ticket', fieldKey: 'humanId', label: 'Número del ticket' },
  { source: 'ticket', fieldKey: 'mergedCount', label: 'Tickets combinados' },
];

export const widgetLibraryItems: Array<{ widgetKey: WidgetKey; label: string }> = [
  { widgetKey: 'sla', label: 'Acuerdo de nivel de servicio' },
  { widgetKey: 'attachments', label: 'Adjuntos' },
  { widgetKey: 'activity', label: 'Actividad y comentarios' },
];
