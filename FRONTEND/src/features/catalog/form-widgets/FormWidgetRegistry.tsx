import { Building2, ClipboardCheck, FileText, Paperclip, SlidersHorizontal, Timer, UserRound, Users } from 'lucide-react';
import type { FormWidgetKey } from '../metamodel';
import { ANY_ENTITY, type PageWidgetDefinition } from '../runtime/widget-registry';
import type { FormPageContext } from './context';
import { FormActionsWidget } from './FormActionsWidget';
import { FormHeaderWidget } from './FormHeaderWidget';
import { FormRequesterDetailsWidget } from './FormRequesterDetailsWidget';
import { FormSlaPreviewWidget } from './FormSlaPreviewWidget';
import { FormAttachmentsWidget } from './FormAttachmentsWidget';
import { FormAssetSummaryWidget } from './FormAssetSummaryWidget';
import { FormRecordSummaryWidget } from './FormRecordSummaryWidget';
import { FormStakeholdersWidget } from './FormStakeholdersWidget';

export type FormWidgetDefinition = PageWidgetDefinition<FormPageContext>;

// The widget catalog of the create/edit FORM pages — the sibling of
// TICKET_WIDGETS, and the reason a `sla` card cannot be dropped onto a form
// (it is not in this catalog) nor a `formActions` bar onto the ticket detail
// (it is not in that one). Keep aligned with BACKEND's formPageWidgetRules
// (validar_page_layout.go) when adding a widget.
//
// `supportedEntityKeys: [ANY_ENTITY]` where the ticket registry names entities
// explicitly: a form header serves any entity an admin defines, including ones
// that do not exist yet. `formSlaPreview` is the exception — SLA is an
// incident concept today, exactly as the ticket page's `sla` widget is.
export const FORM_WIDGETS: Record<FormWidgetKey, FormWidgetDefinition> = {
  formHeader: {
    key: 'formHeader',
    label: 'Service Header',
    icon: FileText,
    ownerModule: 'Catalog',
    allowedRegions: ['header'],
    minColumnSpan: 12,
    allowMultiple: false,
    required: true,
    supportedEntityKeys: [ANY_ENTITY],
    RuntimeComponent: ({ context }) => <FormHeaderWidget context={context} />,
  },
  formActions: {
    key: 'formActions',
    label: 'Action Bar',
    icon: SlidersHorizontal,
    ownerModule: 'Catalog',
    allowedRegions: ['actions'],
    minColumnSpan: 12,
    allowMultiple: false,
    required: true,
    supportedEntityKeys: [ANY_ENTITY],
    RuntimeComponent: ({ context }) => <FormActionsWidget context={context} />,
  },
  formRequesterDetails: {
    key: 'formRequesterDetails',
    label: 'Requester Details',
    icon: UserRound,
    ownerModule: 'Catalog (Session)',
    allowedRegions: ['main', 'sidebar'],
    minColumnSpan: 3,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: [ANY_ENTITY],
    RuntimeComponent: ({ context }) => <FormRequesterDetailsWidget context={context} />,
  },
  formSlaPreview: {
    key: 'formSlaPreview',
    label: 'Expected SLA',
    icon: Timer,
    ownerModule: 'SLA',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 3,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <FormSlaPreviewWidget context={context} />,
  },
  formAttachments: {
    key: 'formAttachments',
    label: 'Attachments',
    icon: Paperclip,
    ownerModule: 'Tickets',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC'],
    RuntimeComponent: ({ context }) => <FormAttachmentsWidget context={context} />,
  },
  formRecordSummary: {
    key: 'formRecordSummary',
    label: 'Intake Summary',
    icon: ClipboardCheck,
    ownerModule: 'Catalog',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 3,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: [ANY_ENTITY],
    RuntimeComponent: ({ context }) => <FormRecordSummaryWidget context={context} />,
  },
  formAssetSummary: {
    key: 'formAssetSummary',
    label: 'Asset Context',
    icon: Building2,
    ownerModule: 'Assets / CMDB',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 3,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: [ANY_ENTITY],
    RuntimeComponent: ({ context }) => <FormAssetSummaryWidget context={context} />,
  },
  formStakeholders: {
    key: 'formStakeholders',
    label: 'Stakeholders and Interested Teams',
    icon: Users,
    ownerModule: 'Organization / Notifications',
    allowedRegions: ['main', 'sidebar', 'footer'],
    minColumnSpan: 4,
    allowMultiple: false,
    required: false,
    supportedEntityKeys: ['INC', 'PRB', 'RFC'],
    RuntimeComponent: ({ context }) => <FormStakeholdersWidget context={context} />,
  },
};
