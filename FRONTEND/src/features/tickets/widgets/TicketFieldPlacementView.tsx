import { bindingList } from '@/features/catalog/metamodel';
import type { PagePlacement } from '@/features/catalog/metamodel';
import type { TicketPageContext } from './context';
import { ticketFieldLabels } from './ticket-field-labels';
import { assigneeText } from '../identity-labels';

function formatCatalogValue(
  value: unknown,
  field?: { type: string; options?: Array<{ value: string; label: string }> },
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field?.type === 'boolean') return value ? 'Yes' : 'No';
  if (field?.type === 'date') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }
  if (field?.type === 'select') {
    return field.options?.find((option) => option.value === value)?.label ?? String(value);
  }
  // Un valor de campo `bindsTo` es un BindingValue, o una lista de ellos si
  // el campo acepta varios dispositivos. Sin esta rama caería en el
  // JSON.stringify de abajo (un objeto) o en el `map(String)` (una lista),
  // que renderiza "[object Object]". Es alcanzable hoy desde la vista previa
  // del diseñador de detalle, que alimenta este widget con datos de muestra.
  const bound = bindingList(value);
  if (bound.length) return bound.map((item) => item.displayName).join(', ');
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// The runtime view for any `kind: 'field'` page placement (source
// catalog/ticket) — this is the "TicketFieldsWidget" concept: it is not a
// registry entry because any catalog field can be placed this way, not a
// fixed named block.
export function TicketFieldPlacementView({
  placement,
  context,
  onAssignClick,
}: {
  placement: PagePlacement;
  context: TicketPageContext;
  onAssignClick: () => void;
}) {
  if (placement.kind !== 'field' || !placement.source || !placement.fieldKey) return null;
  const field = context.fields.find((candidate) => candidate.key === placement.fieldKey);
  const isAssignee = placement.source === 'ticket' && placement.fieldKey === 'assignee';

  const label =
    placement.label ||
    (placement.source === 'ticket' ? ticketFieldLabels[placement.fieldKey] : field?.label) ||
    placement.fieldKey;

  let value: string;
  if (placement.source === 'catalog') {
    value = formatCatalogValue(context.entityData[placement.fieldKey], field);
  } else {
    const { ticket } = context;
    switch (placement.fieldKey) {
      case 'humanId':
        // Bug found 2026-09-09: this showed ticket.id (the internal BIGINT
        // PK) under the "Ticket number" placement label. ticket.humanId is
        // the actual Numero visible (e.g. "INC-000123") -- see the
        // id-vs-humanId distinction documented in features/tickets/api.ts.
        // `humanId` is optional on the Ticket type, and the internal id is
        // NOT an acceptable fallback (that is the bug above), so an absent
        // Numero visible falls through to this view's own "no value" dash.
        value = ticket.humanId ?? '—';
        break;
      case 'requester':
        value = ticket.requesterDisplayName;
        break;
      case 'assignee':
        value = assigneeText(ticket);
        break;
      case 'createdAt':
        value = new Date(ticket.createdAt).toLocaleString();
        break;
      case 'status':
        value = ticket.status;
        break;
      case 'mergedCount':
        value = ticket.mergedCount ? `${ticket.mergedCount} tickets` : 'None';
        break;
      default:
        value = '—';
    }
  }

  return (
    <div
      data-testid={`ticket-detail-field-${placement.source}-${placement.fieldKey}`}
      onClick={isAssignee ? onAssignClick : undefined}
      className={`h-full bg-surface-container-low border border-border/40 rounded-2xl p-4 ${
        isAssignee ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''
      }`}
    >
      <span className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
        {label}
      </span>
      <span
        className={`text-sm font-medium text-on-surface ${
          field?.type === 'textarea' ? 'whitespace-pre-wrap leading-relaxed' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
