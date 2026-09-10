import { MousePointerClick, PanelBottom, PanelRight, PanelTop, Rows3, type LucideIcon } from 'lucide-react';
import type { RegionName } from '@/features/catalog/metamodel';

// One description of every page region, shared by the canvas headers, the
// palette's region chips and the properties panel's "mover a" control. Before
// this existed each of those kept its own REGION_LABELS map and they had
// already drifted (the canvas called `main` "Contenido principal", the
// properties panel agreed, the palette said nothing at all).
export interface RegionMeta {
  label: string;
  /** One word, for chips and other places a full label would wrap. */
  short: string;
  icon: LucideIcon;
  description: string;
  /**
   * A fixed region hosts exactly one locked, required structural widget of
   * the surface (ticketHeader/ticketActions on the detail page,
   * formHeader/formActions on a form page) and accepts nothing else. Enforced in
   * `placementAllowedInRegion` (designer-actions.ts), not just in copy — the
   * old canvas told the user these regions were fixed while still accepting
   * fields and structural elements into them, which then rendered as a broken
   * second row on the real ticket page.
   */
  fixed: boolean;
  emptyHint: string;
}

export const TICKET_REGION_META: Record<RegionName, RegionMeta> = {
  header: {
    label: 'Header',
    short: 'Header',
    icon: PanelTop,
    description: 'Ticket number, title, and status.',
    fixed: true,
    emptyHint: 'Fixed region: always displays ticket header.',
  },
  actions: {
    label: 'Actions bar',
    short: 'Actions',
    icon: MousePointerClick,
    description: 'Action buttons for the ticket.',
    fixed: true,
    emptyHint: 'Fixed region: always displays actions bar.',
  },
  main: {
    label: 'Main content',
    short: 'Main',
    icon: Rows3,
    description: 'The wide column. Where content the agent reads first goes.',
    fixed: false,
    emptyHint: 'Drop fields or widgets here, or click one in the library.',
  },
  sidebar: {
    label: 'Sidebar',
    short: 'Sidebar',
    icon: PanelRight,
    description: 'The narrow column next to main content.',
    fixed: false,
    emptyHint: 'Ideal for compact cards: SLA, asset, requester.',
  },
  footer: {
    label: 'Footer sections',
    short: 'Footer',
    icon: PanelBottom,
    description: 'Full width, below both columns.',
    fixed: false,
    emptyHint: 'Good place for history and secondary content.',
  },
};

// The same five regions, described for a form. The geometry is identical on
// purpose — that is what makes a create form line up with the ticket it
// creates — but the copy has to talk about the form, not about a ticket that
// does not exist yet.
export const FORM_REGION_META: Record<RegionName, RegionMeta> = {
  header: {
    label: 'Header',
    short: 'Header',
    icon: PanelTop,
    description: 'Service name and summary.',
    fixed: true,
    emptyHint: 'Fixed region: always displays service header.',
  },
  actions: {
    label: 'Actions bar',
    short: 'Actions',
    icon: MousePointerClick,
    description: 'Submit and cancel buttons.',
    fixed: true,
    emptyHint: 'Fixed region: always displays form buttons.',
  },
  main: {
    label: 'Main content',
    short: 'Main',
    icon: Rows3,
    description: 'The wide column. Where fields to be filled out go.',
    fixed: false,
    emptyHint: 'Drop fields here, or click one in the library.',
  },
  sidebar: {
    label: 'Sidebar',
    short: 'Sidebar',
    icon: PanelRight,
    description: 'The narrow column next to main content.',
    fixed: false,
    emptyHint: 'Ideal for help, requester info, or expected SLA.',
  },
  footer: {
    label: 'Footer sections',
    short: 'Footer',
    icon: PanelBottom,
    description: 'Full width, below both columns.',
    fixed: false,
    emptyHint: 'Good place for optional fields and footnotes.',
  },
};

export const REGION_ORDER: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];

export function regionLabel(
  regionMeta: Record<RegionName, RegionMeta>,
  region: RegionName,
): string {
  return regionMeta[region].label;
}
