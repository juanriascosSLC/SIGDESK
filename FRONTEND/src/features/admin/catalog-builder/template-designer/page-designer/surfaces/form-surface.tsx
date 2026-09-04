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
    title: 'Template designer',
    description:
      'Build the creation form by regions, just like the ticket page. Click a field in the library to add it, or drag to an exact spot; select it on the canvas to adjust its width, position, and visibility conditions.',
  },
  edit: {
    title: 'Template designer',
    description:
      'Build the edit form by regions. A field left out cannot be edited from here, but retains its value: it is never deleted.',
  },
};

function buildFormSurface(kind: FormPageKind): PageSurface<FormPageContext> {
  const surface: PageSurface<FormPageContext> = {
    kind,
    kindLabel: kind === 'create' ? 'Create' : 'Edit',
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
        title: 'Components',
        hint: 'Form blocks with built-in logic',
        items: widgetLibraryItems(surface, entityKey),
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
        id: 'structure',
        title: 'Structural elements',
        hint: 'Headings, notes, and spacing — store no data',
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
