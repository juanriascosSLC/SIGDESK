import type { ReactNode } from 'react';
import type { PageLayout, PagePlacement } from '@/features/catalog/metamodel';
import { PageLayoutRenderer } from '@/features/catalog/runtime/PageLayoutRenderer';
import type { TicketPageContext } from './widgets/context';
import { renderTicketPlacementContent } from './widgets/render-placement';

// The single entry point used by the real ticket page and the Catalog
// Builder preview — both render the exact same TICKET_WIDGETS components;
// the only difference is whether `context` comes from live hooks or
// simulated sample data. The designer canvas does NOT use this component: it
// renders the same `renderTicketPlacementContent` dispatch directly, wrapped
// in its own editable-chrome/drop-zone canvas (see
// page-designer/DesignerRegionCanvas.tsx).
export function TicketPageLayout({
  page,
  context,
  onAssignClick,
}: {
  page: PageLayout;
  context: TicketPageContext;
  onAssignClick?: () => void;
}) {
  function renderPlacement(placement: PagePlacement): ReactNode {
    return renderTicketPlacementContent(placement, context, onAssignClick ?? (() => {}));
  }

  return <PageLayoutRenderer page={page} data={context.entityData} renderPlacement={renderPlacement} />;
}
