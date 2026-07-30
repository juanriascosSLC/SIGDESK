import type { ReactNode } from 'react';
import type { PagePlacement } from '@/features/catalog/metamodel';
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
    const widget = TICKET_WIDGETS[placement.widgetKey];
    if (!widget) return null;
    return <widget.RuntimeComponent placement={placement} context={context} />;
  }
  return null;
}
