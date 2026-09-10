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
  Users,
  ListChecks,
} from 'lucide-react';
import type { RegionName, TicketWidgetKey, WidgetKey } from '@/features/catalog/metamodel';
import type { PageWidgetDefinition } from '@/features/catalog/runtime/widget-registry';
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
import { ChangeTasksWidget } from './ChangeTasksWidget';
import { StakeholdersWidget } from './StakeholdersWidget';

// The ticket page's specialization of the shared registry shape. Kept as a
// named alias because a dozen modules already import this name.
export type TicketWidgetDefinition = PageWidgetDefinition<TicketPageContext>;

// The single source of truth for the DETAIL page's widget catalog — the
// palette, the runtime/preview dispatcher in TicketPageLayout, and
// page-document-ops (drop validation) all read from this registry instead of
// hardcoding widget knowledge in more than one place. Mirrors BACKEND's
// detailPageWidgetRules (validar_page_layout.go) for
// allowedRegions/allowMultiple/required — keep both in sync when adding a
// widget. The create/edit form pages have their own registry
// (catalog/form-widgets/FormWidgetRegistry.tsx); a widget is admitted on a
// page only if it is in THAT page's registry.
export const TICKET_WIDGETS: Record<TicketWidgetKey, TicketWidgetDefinition> = {
  ticketHeader: {
    key: 'ticketHeader',
    label: 'Ticket Header',
    icon: IdCard,
    ownerModule: 'Tickets',
    allowedRegions: ['header'],
    minColumnSpan: 12,
    allowMultiple: false,
    required: true,
    supportedEntityKeys: ['INC', 'PRB', 'RFC'],
    RuntimeComponent: ({ context }) => <TicketHeaderWidget context={context} />,
  },
  ticketActions: {
    key: 'ticketActions',
    label: 'Action Bar',
    icon: SlidersHorizontal,
    ownerModule: 'Tickets',
    allowedRegions: ['actions'],
    minColumnSpan: 12,
    allowMultiple: false,
    required: true,
    supportedEntityKeys: ['INC', 'PRB', 'RFC'],
    RuntimeComponent: ({ context }) => <TicketActionsWidget context={context} />,
  },
  sla: {
    key: 'sla',
    label: 'Service Level Agreement (SLA)',
    icon: Timer,
    ownerModule: 'SLA',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <SlaWidget context={context} />,
  },
  attachments: {
    key: 'attachments',
    label: 'Attachments',
    icon: Paperclip,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <AttachmentsWidget context={context} />,
  },
  activity: {
    key: 'activity',
    label: 'Activity & Comments',
    icon: FileText,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <ActivityWidget context={context} />,
  },
  mergedTickets: {
    key: 'mergedTickets',
    label: 'Merged Tickets',
    icon: Merge,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <MergedTicketsWidget context={context} />,
  },
  itsmRelations: {
    key: 'itsmRelations',
    label: 'Related Cases',
    icon: Link2,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC', 'PRB', 'RFC'],
    RuntimeComponent: ({ context }) => <RelationsWidget context={context} />,
  },
  assetDetails: {
    key: 'assetDetails',
    label: 'Asset Details',
    icon: Server,
    ownerModule: 'Tickets (SIGInventory projection)',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <AssetDetailsWidget context={context} />,
  },
  description: {
    key: 'description',
    label: 'Description',
    icon: FileText,
    ownerModule: 'Catalog (field)',
    allowedRegions: ['main', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC', 'PRB', 'RFC'],
    RuntimeComponent: ({ context }) => <DescriptionWidget context={context} />,
  },
  suggestedSolutions: {
    key: 'suggestedSolutions',
    label: 'Suggested Solutions',
    icon: Lightbulb,
    ownerModule: 'Tickets (via PRB relations)',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <SuggestedSolutionsWidget context={context} />,
  },
  requesterDetails: {
    key: 'requesterDetails',
    label: 'Requester Details',
    icon: UserRound,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar'],
    minColumnSpan: 3,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <RequesterDetailsWidget context={context} />,
  },
  statusHistory: {
    key: 'statusHistory',
    label: 'Status History',
    icon: History,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <StatusHistoryWidget context={context} />,
  },
  changeTasks: {
    key: 'changeTasks',
    label: 'Work Plan',
    icon: ListChecks,
    ownerModule: 'Change Management',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 6,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['RFC'],
    RuntimeComponent: ({ context }) => <ChangeTasksWidget context={context} />,
  },
  stakeholders: {
    key: 'stakeholders',
    label: 'Stakeholders and interested areas',
    icon: Users,
    ownerModule: 'Organization / Notifications',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC', 'PRB', 'RFC'],
    RuntimeComponent: ({ context }) => <StakeholdersWidget context={context} />,
  },
};

export const REQUIRED_WIDGET_REGIONS: Partial<Record<WidgetKey, RegionName>> = Object.fromEntries(
  Object.values(TICKET_WIDGETS)
    .filter((widget) => widget.required)
    .map((widget) => [widget.key, widget.allowedRegions[0]]),
);
