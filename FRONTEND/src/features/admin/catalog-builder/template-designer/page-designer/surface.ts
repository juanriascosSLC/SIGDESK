import type { ReactNode } from 'react';
import type {
  CatalogSpecification,
  DetailFieldSource,
  LayoutDocument,
  LayoutKind,
  PageLayout,
  PagePlacement,
  RegionName,
} from '@/features/catalog/metamodel';
import type { PageWidgetMetaCatalog } from '@/features/catalog/runtime/widget-registry';
import type { PageLibraryItem } from './page-library';
import type { RegionMeta } from './region-meta';

// A "page surface" is one designable page: the ticket detail, the create form
// or the edit form. Metamodel 1.5 had exactly one, so PageDesigner could read
// TICKET_WIDGETS, REGION_META and `specification.detailPage` directly. With
// 1.6 there are three, and every one of those constants becomes a parameter.
//
// The descriptor is split in two on purpose. `SurfaceRules` is plain data and
// is the only half the designer's pure modules (designer-actions.ts,
// page-library.ts) consume — that is what keeps them free of React and
// unit-testable. `PageSurface` adds the React half.

export interface SurfaceRules {
  /**
   * The widgets this surface ADMITS. A `widgetKey` absent from this catalog is
   * not "unknown", it is "not allowed here" — that is what stops a ticket
   * widget from being dropped on a create form and vice versa, without making
   * `WidgetKey` two disjoint types.
   */
  widgets: PageWidgetMetaCatalog;
  regionMeta: Record<RegionName, RegionMeta>;
  /** Regions that take free content. Today always main/sidebar/footer. */
  contentRegions: RegionName[];
  /** Labels for `source: 'ticket'` fields. Empty on the form surfaces. */
  systemFieldLabels: Record<string, string>;
  /** Field origins this surface's library offers. Forms: catalog only. */
  fieldSources: DetailFieldSource[];
}

export interface PaletteGroupSpec {
  id: string;
  title: string;
  hint: string;
  items: PageLibraryItem[];
  defaultOpen: boolean;
}

export interface PageSurface<TContext = unknown> extends SurfaceRules {
  kind: LayoutKind;
  kindLabel: string;
  /** Where this page persists inside the specification. */
  specKey: 'createPage' | 'editPage' | 'detailPage';
  headline: { title: string; description: string };

  /** Deterministic baseline when the specification has no page yet. */
  synthesizeBaseline: (specification: CatalogSpecification, entityKey: string) => PageLayout;

  /**
   * The simulated context backing the canvas and the preview. This is a HOOK:
   * PageDesigner calls it unconditionally, once. Because a different surface
   * means a different hook, PageDesigner MUST be remounted when `kind`
   * changes — TemplateDesigner passes `key={activeKind}` for exactly that.
   */
  useSimulatedContext: (
    specification: CatalogSpecification,
    entityKey: string,
  ) => {
    context: TContext;
    sampleData: Record<string, unknown>;
    setFieldSampleValue: (key: string, value: unknown) => void;
  };

  /** Runtime dispatcher shared by canvas, preview and the real page. */
  renderPlacementContent: (placement: PagePlacement, context: TContext) => ReactNode;

  paletteGroups: (entityKey: string, specification: CatalogSpecification) => PaletteGroupSpec[];

  /**
   * Metamodel 1.4 mirror written alongside the page on every commit, or `null`
   * where there is nothing to mirror (`detail`).
   *
   * This is NOT dead weight kept for old readers: tickets_service refuses to
   * publish a definition whose `bindsTo` field has no placement in
   * `layouts.create` (validar_placement_layouts.go). Deriving the mirror from
   * the page on every commit keeps that rule satisfied AND truthful — a frozen
   * copy would drift and let a definition publish while the real form no
   * longer collects the field, which fails much later with ErrRecursoIDVacio.
   */
  projectToLegacy: ((page: PageLayout) => LayoutDocument) | null;
}

// The designer is generic over surfaces; the context type only has to line up
// between a surface's own hook and its own dispatcher, which it does by
// construction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPageSurface = PageSurface<any>;
