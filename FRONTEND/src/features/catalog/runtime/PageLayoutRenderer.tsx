import type { ReactNode } from 'react';
import { evaluateCondition, type LayoutRegion, type PageLayout, type PagePlacement, type RegionName } from '../metamodel';

// Generic, business-agnostic rendering for a `content` placement
// (section/text/divider/spacer) — structural sugar owned by no module.
// Exported so the designer canvas can render the exact same look for these
// elements while editing.
export function ContentPlacementView({ placement }: { placement: PagePlacement }) {
  switch (placement.contentKind) {
    case 'section':
      return (
        <div className="border-t border-border/40 pt-3">
          {placement.title && <h3 className="text-sm font-black text-on-surface">{placement.title}</h3>}
        </div>
      );
    case 'text':
      return <p className="text-sm text-on-surface-variant">{placement.content}</p>;
    case 'divider':
      return <hr className="border-border/40" />;
    case 'spacer':
      return <div aria-hidden style={{ height: '1.5rem' }} />;
    default:
      return null;
  }
}

function RegionGrid({
  region,
  regionName,
  data,
  renderPlacement,
}: {
  region: LayoutRegion;
  regionName: RegionName;
  data: Record<string, unknown>;
  renderPlacement: (placement: PagePlacement, region: RegionName) => ReactNode;
}) {
  const visiblePlacements = region.placements.filter(
    (placement) => !placement.visibleWhen || evaluateCondition(placement.visibleWhen, data),
  );
  if (visiblePlacements.length === 0) return null;

  return (
    <div
      data-testid={`page-layout-region-${regionName}`}
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${region.columns}, minmax(0, 1fr))` }}
    >
      {visiblePlacements.map((placement) => {
        const rendered = renderPlacement(placement, regionName);
        const content = rendered ?? (placement.kind === 'content' ? <ContentPlacementView placement={placement} /> : null);
        if (content === null || content === undefined) return null;
        const rowSpan = placement.rowSpan && placement.rowSpan > 0 ? placement.rowSpan : 1;
        return (
          <div
            key={placement.id}
            style={{
              gridColumn: `${placement.column + 1} / span ${placement.columnSpan}`,
              gridRow: `${placement.row + 1} / span ${rowSpan}`,
            }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

// The fixed page skeleton — header → actions → main+sidebar side by side →
// footer — shared by the real page/preview renderer below AND the designer
// canvas (which renders its own editable rows/cells per region instead of
// RegionGrid, but must arrange the 5 regions identically so what you design
// is what you get).
export function PageRegionsSkeleton({
  sidebarColumns,
  header,
  actions,
  main,
  sidebar,
  footer,
}: {
  sidebarColumns: number;
  header: ReactNode;
  actions: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
  footer: ReactNode;
}) {
  const resolvedSidebarColumns = sidebarColumns || 4;
  const mainColumns = 12 - resolvedSidebarColumns;
  return (
    <div className="space-y-6">
      {header}
      {actions}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:flex-1" style={{ flexGrow: mainColumns, flexBasis: 0 }}>
          {main}
        </div>
        <div className="min-w-0 lg:flex-1" style={{ flexGrow: resolvedSidebarColumns, flexBasis: 0 }}>
          {sidebar}
        </div>
      </div>
      {footer}
    </div>
  );
}

// Structural renderer for the real page/preview: fixed region order, each
// region its own 12-column grid. Field/widget placements are delegated to
// the caller via `renderPlacement`; `content` placements are rendered
// internally. Used by the real ticket page and the Catalog Builder preview —
// the only thing that differs between them is what `renderPlacement` returns.
export function PageLayoutRenderer({
  page,
  data,
  renderPlacement,
}: {
  page: PageLayout;
  data: Record<string, unknown>;
  renderPlacement: (placement: PagePlacement, region: RegionName) => ReactNode;
}) {
  const regionProps = { data, renderPlacement };
  return (
    <PageRegionsSkeleton
      sidebarColumns={page.sidebarColumns}
      header={<RegionGrid region={page.header} regionName="header" {...regionProps} />}
      actions={<RegionGrid region={page.actions} regionName="actions" {...regionProps} />}
      main={<RegionGrid region={page.main} regionName="main" {...regionProps} />}
      sidebar={<RegionGrid region={page.sidebar} regionName="sidebar" {...regionProps} />}
      footer={<RegionGrid region={page.footer} regionName="footer" {...regionProps} />}
    />
  );
}
