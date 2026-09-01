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
  kindLabel: 'Detalle',
  specKey: 'detailPage',
  headline: {
    title: 'Diseñador de plantilla',
    description:
      'Arma la página del ticket por zonas. Haz clic en un componente de la biblioteca para agregarlo, o arrástralo a un punto exacto; selecciónalo en el lienzo para ajustar su ancho, su posición y cuándo se muestra.',
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
      hint: 'Bloques completos que ya traen su propia lógica',
      items: widgetLibraryItems(DETAIL_SURFACE, entityKey),
      defaultOpen: true,
    },
    {
      id: 'catalog-fields',
      title: 'Campos de esta entidad',
      hint: 'Los campos que definiste en «Campos del formulario»',
      items: catalogFieldLibraryItems(specification),
      defaultOpen: true,
    },
    {
      id: 'ticket-fields',
      title: 'Campos internos del sistema',
      hint: 'Datos que el módulo de Tickets mantiene por su cuenta',
      items: ticketFieldLibraryItems(DETAIL_SURFACE, entityKey, ticketDetailFields),
      defaultOpen: false,
    },
    {
      id: 'structure',
      title: 'Elementos estructurales',
      hint: 'Títulos, notas y espaciado — no guardan datos',
      items: contentPaletteItems(),
      defaultOpen: true,
    },
  ],

  // The detail page has no 1.4 counterpart to keep in step: `layouts.detail`
  // is not read by the ticket runtime and no backend rule depends on it.
  projectToLegacy: null,
};
