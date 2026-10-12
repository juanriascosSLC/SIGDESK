import type {
  LayoutRegion,
  PageAppearance,
  PageLayout,
  PagePlacement,
  RegionStyle,
  RegionName,
} from '@/features/catalog/metamodel';

export function getRegion(page: PageLayout, regionName: RegionName): LayoutRegion {
  return page[regionName];
}

export function setRegion(page: PageLayout, regionName: RegionName, region: LayoutRegion): PageLayout {
  return { ...page, [regionName]: region };
}

export function findPlacementRegion(page: PageLayout, placementId: string): RegionName | null {
  const regions: RegionName[] = ['header', 'actions', 'main', 'sidebar', 'footer'];
  for (const regionName of regions) {
    if (page[regionName].placements.some((placement) => placement.id === placementId)) {
      return regionName;
    }
  }
  return null;
}

// Non-positional edits only (label, content, rowSpan, mobileOrder, readOnly,
// visibleWhen) — position/width changes go through the row/cell designer
// model (designer-grid-model.ts + designer-actions.ts) so a row's cells
// never overlap; this function never touches row/column/columnSpan.
export function updatePlacement(
  page: PageLayout,
  placementId: string,
  updater: (placement: PagePlacement) => PagePlacement,
): PageLayout {
  const regionName = findPlacementRegion(page, placementId);
  if (!regionName) return page;
  const region = getRegion(page, regionName);
  return setRegion(page, regionName, {
    ...region,
    placements: region.placements.map((placement) => (placement.id === placementId ? updater(placement) : placement)),
  });
}

export function updateSidebarColumns(page: PageLayout, sidebarColumns: number): PageLayout {
  return { ...page, sidebarColumns };
}

export const DEFAULT_PAGE_APPEARANCE: PageAppearance = {
  density: 'comfortable',
  contentWidth: 'wide',
  surfaceStyle: 'soft',
};

export function resolvePageAppearance(page: PageLayout): PageAppearance {
  return { ...DEFAULT_PAGE_APPEARANCE, ...page.appearance };
}

export function updatePageAppearance(page: PageLayout, patch: Partial<PageAppearance>): PageLayout {
  return { ...page, appearance: { ...resolvePageAppearance(page), ...patch } };
}

export const DEFAULT_REGION_STYLE: RegionStyle = {
  surface: 'transparent',
  padding: 'none',
  gap: 'comfortable',
};

export function updateRegionStyle(
  page: PageLayout,
  regionName: RegionName,
  patch: Partial<RegionStyle>,
): PageLayout {
  const region = page[regionName];
  return setRegion(page, regionName, {
    ...region,
    style: { ...DEFAULT_REGION_STYLE, ...region.style, ...patch },
  });
}
