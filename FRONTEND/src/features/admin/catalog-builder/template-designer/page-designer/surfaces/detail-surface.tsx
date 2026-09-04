import type { CatalogSpecification, PagePlacement } from '@/features/catalog/metamodel';
import { synthesizePageLayoutFromLegacy } from '@/features/catalog/runtime/page-layout-normalizer';
import { ticketFieldLabels } from '@/features/tickets/widgets/ticket-field-labels';
import { TICKET_WIDGETS } from '@/features/tickets/widgets/TicketWidgetRegistry';
import type { TicketPageContext } from '@/features/tickets/widgets/context';
import { renderTicketPlacementContent } from '@/features/tickets/widgets/render-placement';
import { ticketDetailFields } from '../../library-fields';
import {
  catalogFieldLibraryItems,
  contentPaletteItems,
  ticketFieldLibraryItems,
  widgetLibraryItems,
  CONTENT_REGIONS,
} from '../page-library';
import { TICKET_REGION_META } from '../region-meta';
import type { PageSurface } from '../surface';
import { useSimulatedTicketContext } from '../useSimulatedTicketContext';

// The ticket detail page — the surface metamodel 1.5 shipped, now expressed as
// one PageSurface among three instead of as constants baked into PageDesigner.
// Nothing about its behaviour changes here.
export const DETAIL_SURFACE: PageSurface<TicketPageContext> = {
  kind: 'detail',
  kindLabel: 'Detail',
  specKey: 'detailPage',
  headline: {
    title: 'Template designer',
    description:
      'Build the ticket page by regions. Click a component in the library to add it, or drag to an exact spot; select it on the canvas to adjust its width, position, and visibility conditions.',
  },

  widgets: TICKET_WIDGETS,
  regionMeta: TICKET_REGION_META,
  contentRegions: CONTENT_REGIONS,
  systemFieldLabels: ticketFieldLabels,
  fieldSources: ['catalog', 'ticket'],

  synthesizeBaseline: (specification: CatalogSpecification, entityKey: string) =>
    synthesizePageLayoutFromLegacy(specification, entityKey),

  useSimulatedContext: useSimulatedTicketContext,

  renderPlacementContent: (placement: PagePlacement, context: TicketPageContext) =>
    renderTicketPlacementContent(placement, context, () => {}),

  paletteGroups: (entityKey, specification) => [
    {
      id: 'widgets',
      title: 'Widgets',
      hint: 'Complete blocks with built-in logic',
      items: widgetLibraryItems(DETAIL_SURFACE, entityKey),
      defaultOpen: true,
    },
    {
      id: 'catalog-fields',
      title: 'Fields in this entity',
      hint: 'Fields defined in "Form fields"',
      items: catalogFieldLibraryItems(specification),
      defaultOpen: true,
    },
    {
      id: 'ticket-fields',
      title: 'Internal system fields',
      hint: 'Data maintained automatically by the Tickets module',
      items: ticketFieldLibraryItems(DETAIL_SURFACE, entityKey, ticketDetailFields),
      defaultOpen: false,
    },
    {
      id: 'structure',
      title: 'Structural elements',
      hint: 'Headings, notes, and spacing — store no data',
      items: contentPaletteItems(),
      defaultOpen: true,
    },
  ],

  // The detail page has no 1.4 counterpart to keep in step: `layouts.detail`
  // is not read by the ticket runtime and no backend rule depends on it.
  projectToLegacy: null,
};
