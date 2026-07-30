import type { ReactNode } from 'react';
import {
  FileText,
  History,
  IdCard,
  Lightbulb,
  Link2,
  Merge,
  Paperclip,
  Server,
  SlidersHorizontal,
  Timer,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { PagePlacement, RegionName, WidgetKey } from '@/features/catalog/metamodel';
import { ActivityWidget } from './ActivityWidget';
import { AssetDetailsWidget } from './AssetDetailsWidget';
import { AttachmentsWidget } from './AttachmentsWidget';
import type { TicketPageContext } from './context';
import { DescriptionWidget } from './DescriptionWidget';
import { MergedTicketsWidget } from './MergedTicketsWidget';
import { RelationsWidget } from './RelationsWidget';
import { RequesterDetailsWidget } from './RequesterDetailsWidget';
import { SlaWidget } from './SlaWidget';
import { StatusHistoryWidget } from './StatusHistoryWidget';
import { SuggestedSolutionsWidget } from './SuggestedSolutionsWidget';
import { TicketActionsWidget } from './TicketActionsWidget';
import { TicketHeaderWidget } from './TicketHeaderWidget';

export interface TicketWidgetDefinition {
  key: WidgetKey;
  label: string;
  icon: LucideIcon;
  ownerModule: string;
  allowedRegions: RegionName[];
  minColumnSpan: number;
  allowMultiple: boolean;
  required: boolean;
  RuntimeComponent: (props: { placement: PagePlacement; context: TicketPageContext }) => ReactNode;
}

// The single source of truth for the widget catalog — the palette, the
// runtime/preview dispatcher in TicketPageLayout, and page-document-ops (drop
// validation) all read from this registry instead of hardcoding widget
// knowledge in more than one place. Mirrors BACKEND's pageWidgetRules
// (definition.go) for allowedRegions/allowMultiple/required — keep both in
// sync when adding a widget.
export const TICKET_WIDGETS: Record<WidgetKey, TicketWidgetDefinition> = {
  ticketHeader: {
    key: 'ticketHeader',
    label: 'Encabezado del ticket',
    icon: IdCard,
    ownerModule: 'Tickets',
    allowedRegions: ['header'],
    minColumnSpan: 12,
    allowMultiple: false,
    required: true,
    RuntimeComponent: ({ context }) => <TicketHeaderWidget context={context} />,
  },
  ticketActions: {
    key: 'ticketActions',
    label: 'Barra de acciones',
    icon: SlidersHorizontal,
    ownerModule: 'Tickets',
    allowedRegions: ['actions'],
    minColumnSpan: 12,
    allowMultiple: false,
    required: true,
    RuntimeComponent: ({ context }) => <TicketActionsWidget context={context} />,
  },
  sla: {
    key: 'sla',
    label: 'Acuerdo de nivel de servicio',
    icon: Timer,
    ownerModule: 'SLA',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <SlaWidget context={context} />,
  },
  attachments: {
    key: 'attachments',
    label: 'Adjuntos',
    icon: Paperclip,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <AttachmentsWidget context={context} />,
  },
  activity: {
    key: 'activity',
    label: 'Actividad y comentarios',
    icon: FileText,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <ActivityWidget context={context} />,
  },
  mergedTickets: {
    key: 'mergedTickets',
    label: 'Tickets combinados',
    icon: Merge,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <MergedTicketsWidget context={context} />,
  },
  itsmRelations: {
    key: 'itsmRelations',
    label: 'Relaciones ITSM',
    icon: Link2,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <RelationsWidget context={context} />,
  },
  assetDetails: {
    key: 'assetDetails',
    label: 'Detalles del activo',
    icon: Server,
    ownerModule: 'Tickets (proyección SIGInventory)',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <AssetDetailsWidget context={context} />,
  },
  description: {
    key: 'description',
    label: 'Descripción',
    icon: FileText,
    ownerModule: 'Catalog (campo)',
    allowedRegions: ['main', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <DescriptionWidget context={context} />,
  },
  suggestedSolutions: {
    key: 'suggestedSolutions',
    label: 'Soluciones sugeridas',
    icon: Lightbulb,
    ownerModule: 'Tickets (vía relaciones PRB)',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <SuggestedSolutionsWidget context={context} />,
  },
  requesterDetails: {
    key: 'requesterDetails',
    label: 'Datos del solicitante',
    icon: UserRound,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar'],
    minColumnSpan: 3,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <RequesterDetailsWidget context={context} />,
  },
  statusHistory: {
    key: 'statusHistory',
    label: 'Historial de estado',
    icon: History,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    RuntimeComponent: ({ context }) => <StatusHistoryWidget context={context} />,
  },
};

export const REQUIRED_WIDGET_REGIONS: Partial<Record<WidgetKey, RegionName>> = Object.fromEntries(
  Object.values(TICKET_WIDGETS)
    .filter((widget) => widget.required)
    .map((widget) => [widget.key, widget.allowedRegions[0]]),
);
