import type {
  CatalogSpecification,
  FormPageKind,
  PageLayout,
  PagePlacement,
} from '@/features/catalog/metamodel';
import type { FormPageContext } from '@/features/catalog/form-widgets/context';
import { FORM_WIDGETS } from '@/features/catalog/form-widgets/FormWidgetRegistry';
import { renderFormPlacementContent } from '@/features/catalog/form-widgets/render-placement';
import {
  projectFormPageToLegacyDocument,
  synthesizeFormPageFromLegacy,
} from '@/features/catalog/runtime/form-page-normalizer';
import {
  catalogFieldLibraryItems,
  contentPaletteItems,
  widgetLibraryItems,
  CONTENT_REGIONS,
} from '../page-library';
import { FORM_REGION_META } from '../region-meta';
import type { PageSurface } from '../surface';
import { useSimulatedFormContext } from '../useSimulatedFormContext';

const HEADLINES: Record<FormPageKind, { title: string; description: string }> = {
  create: {
    title: 'Diseñador de plantilla',
    description:
      'Arma el formulario de creación por zonas, igual que la página del ticket. Haz clic en un campo de la biblioteca para agregarlo, o arrástralo a un punto exacto; selecciónalo en el lienzo para ajustar su ancho, su posición y cuándo se muestra.',
  },
  edit: {
    title: 'Diseñador de plantilla',
    description:
      'Arma el formulario de edición por zonas. Un campo que dejes fuera no se podrá editar desde aquí, pero conserva su valor: nunca se borra.',
  },
};

function buildFormSurface(kind: FormPageKind): PageSurface<FormPageContext> {
  const surface: PageSurface<FormPageContext> = {
    kind,
    kindLabel: kind === 'create' ? 'Crear' : 'Editar',
    specKey: kind === 'create' ? 'createPage' : 'editPage',
    headline: HEADLINES[kind],

    widgets: FORM_WIDGETS,
    regionMeta: FORM_REGION_META,
    contentRegions: CONTENT_REGIONS,
    // A form has no ticket to read from, so there are no system fields and no
    // `ticket` source — the palette simply never offers them.
    systemFieldLabels: {},
    fieldSources: ['catalog'],

    synthesizeBaseline: (specification: CatalogSpecification): PageLayout =>
      synthesizeFormPageFromLegacy(specification, kind),

    useSimulatedContext: (specification: CatalogSpecification, entityKey: string) =>
      useSimulatedFormContext(specification, entityKey, kind),

    renderPlacementContent: (placement: PagePlacement, context: FormPageContext) =>
      renderFormPlacementContent(placement, context),

    paletteGroups: (entityKey, specification) => [
      {
        id: 'widgets',
        title: 'Componentes',
        hint: 'Bloques del formulario que ya traen su propia lógica',
        items: widgetLibraryItems(surface, entityKey),
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
        id: 'structure',
        title: 'Elementos estructurales',
        hint: 'Títulos, notas y espaciado — no guardan datos',
        items: contentPaletteItems(),
        defaultOpen: true,
      },
    ],

    projectToLegacy: (page: PageLayout) => projectFormPageToLegacyDocument(page, kind),
  };
  return surface;
}

export const CREATE_SURFACE = buildFormSurface('create');
export const EDIT_SURFACE = buildFormSurface('edit');
