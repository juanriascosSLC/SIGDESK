import type { ReactNode } from 'react';
import type { PagePlacement, TicketWidgetKey } from '@/features/catalog/metamodel';
import type { TicketPageContext } from './context';
import { TicketFieldPlacementView } from './TicketFieldPlacementView';
import { TICKET_WIDGETS } from './TicketWidgetRegistry';

// Dispatches a `field`/`widget` placement to its real component — the exact
// same lookup used by the real ticket page and the Catalog Builder preview,
// and reused by the page designer canvas so the WYSIWYG canvas renders these
// same components (wrapped in editing chrome) instead of a lookalike.
// `content` placements are handled internally by PageLayoutRenderer.
export function renderTicketPlacementContent(
  placement: PagePlacement,
  context: TicketPageContext,
  onAssignClick: () => void,
): ReactNode {
  if (placement.kind === 'field') {
    return <TicketFieldPlacementView placement={placement} context={context} onAssignClick={onAssignClick} />;
  }
  if (placement.kind === 'widget' && placement.widgetKey) {
    // A widgetKey the ticket page does not own (a form widget, or one from a
    // future surface) renders as nothing rather than crashing the page — the
    // designer already refuses to place one here, so this is the trust
    // boundary for a document hand-edited in the Advanced JSON editor.
    const widget = TICKET_WIDGETS[placement.widgetKey as TicketWidgetKey];
    if (!widget) return null;
    return <widget.RuntimeComponent placement={placement} context={context} />;
  }
  return null;
}
