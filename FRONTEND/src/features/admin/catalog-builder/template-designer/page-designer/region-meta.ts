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
    label: 'Encabezado',
    short: 'Encabezado',
    icon: PanelTop,
    description: 'Número, título y estado del ticket.',
    fixed: true,
    emptyHint: 'Zona fija: siempre muestra el encabezado del ticket.',
  },
  actions: {
    label: 'Barra de acciones',
    short: 'Acciones',
    icon: MousePointerClick,
    description: 'Botones de acción sobre el ticket.',
    fixed: true,
    emptyHint: 'Zona fija: siempre muestra la barra de acciones.',
  },
  main: {
    label: 'Contenido principal',
    short: 'Principal',
    icon: Rows3,
    description: 'La columna ancha. Aquí va el contenido que el agente lee primero.',
    fixed: false,
    emptyHint: 'Suelta aquí campos o widgets, o haz clic en uno de la biblioteca.',
  },
  sidebar: {
    label: 'Columna lateral',
    short: 'Lateral',
    icon: PanelRight,
    description: 'La columna angosta junto al contenido principal.',
    fixed: false,
    emptyHint: 'Ideal para tarjetas compactas: SLA, activo, solicitante.',
  },
  footer: {
    label: 'Secciones inferiores',
    short: 'Inferior',
    icon: PanelBottom,
    description: 'Ancho completo, debajo de las dos columnas.',
    fixed: false,
    emptyHint: 'Buen lugar para historiales y contenido secundario.',
  },
};

// The same five regions, described for a form. The geometry is identical on
// purpose — that is what makes a create form line up with the ticket it
// creates — but the copy has to talk about the form, not about a ticket that
// does not exist yet.
export const FORM_REGION_META: Record<RegionName, RegionMeta> = {
  header: {
    label: 'Encabezado',
    short: 'Encabezado',
    icon: PanelTop,
    description: 'Nombre del servicio y de qué se trata.',
    fixed: true,
    emptyHint: 'Zona fija: siempre muestra el encabezado del servicio.',
  },
  actions: {
    label: 'Barra de acciones',
    short: 'Acciones',
    icon: MousePointerClick,
    description: 'Los botones de enviar y cancelar.',
    fixed: true,
    emptyHint: 'Zona fija: siempre muestra los botones del formulario.',
  },
  main: {
    label: 'Contenido principal',
    short: 'Principal',
    icon: Rows3,
    description: 'La columna ancha. Aquí van los campos que hay que completar.',
    fixed: false,
    emptyHint: 'Suelta aquí campos, o haz clic en uno de la biblioteca.',
  },
  sidebar: {
    label: 'Columna lateral',
    short: 'Lateral',
    icon: PanelRight,
    description: 'La columna angosta junto al contenido principal.',
    fixed: false,
    emptyHint: 'Ideal para ayuda, datos del solicitante o el SLA esperado.',
  },
  footer: {
    label: 'Secciones inferiores',
    short: 'Inferior',
    icon: PanelBottom,
    description: 'Ancho completo, debajo de las dos columnas.',
    fixed: false,
    emptyHint: 'Buen lugar para campos opcionales y notas al pie.',
  },
};

export const REGION_ORDER: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];

export function regionLabel(
  regionMeta: Record<RegionName, RegionMeta>,
  region: RegionName,
): string {
  return regionMeta[region].label;
}
