import type { LayoutRegion, PageLayout, PagePlacement, RegionName } from '@/features/catalog/metamodel';

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
