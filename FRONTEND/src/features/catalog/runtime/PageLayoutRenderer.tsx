import type { ReactNode } from 'react';
import {
  evaluateCondition,
  type LayoutRegion,
  type PageAppearance,
  type PageLayout,
  type PagePlacement,
  type RegionName,
} from '../metamodel';
import { regionPresentationClasses, resolveRegionStyle } from './region-style';

const DEFAULT_APPEARANCE: PageAppearance = {
  density: 'comfortable',
  contentWidth: 'wide',
  surfaceStyle: 'soft',
};

// Generic, business-agnostic rendering for a `content` placement
// (section/text/divider/spacer) — structural sugar owned by no module.
// Exported so the designer canvas can render the exact same look for these
// elements while editing.
export function ContentPlacementView({ placement }: { placement: PagePlacement }) {
  const tone = placement.contentTone ?? (placement.contentKind === 'callout' ? 'info' : 'neutral');
  const toneClass = {
    neutral: 'border-border/50 bg-surface-container text-on-surface',
    info: 'border-primary/30 bg-primary/10 text-primary',
    success: 'border-status-success-border bg-status-success-bg text-status-success-fg',
    warning: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    danger: 'border-status-danger-border bg-status-danger-bg text-status-danger-fg',
  }[tone];
  switch (placement.contentKind) {
    case 'section':
      return (
        <div className="border-t border-border/40 pt-3">
          {placement.title && <h3 className="text-sm font-black text-on-surface">{placement.title}</h3>}
        </div>
      );
    case 'text':
      return <p className="text-sm text-on-surface-variant">{placement.content}</p>;
    case 'card':
      return (
        <section data-content-tone={tone} className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
          {placement.title && <h3 className="text-sm font-black">{placement.title}</h3>}
          {placement.content && (
            <p className={`${placement.title ? 'mt-1.5' : ''} text-sm leading-6 opacity-85`}>
              {placement.content}
            </p>
          )}
        </section>
      );
    case 'callout':
      return (
        <aside data-content-tone={tone} className={`rounded-2xl border p-4 text-sm ${toneClass}`}>
          {placement.title && <h3 className="font-black">{placement.title}</h3>}
          {placement.content && (
            <p className={`${placement.title ? 'mt-1.5' : ''} leading-6 opacity-85`}>
              {placement.content}
            </p>
          )}
        </aside>
      );
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
  const style = resolveRegionStyle(region.style);

  return (
    <div
      data-testid={`page-layout-region-${regionName}`}
      className={`grid ${regionPresentationClasses(style)}`}
      data-region-surface={style.surface}
      data-region-padding={style.padding}
      data-region-gap={style.gap}
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
  appearance,
  stacked = false,
  header,
  actions,
  main,
  sidebar,
  footer,
}: {
  sidebarColumns: number;
  appearance?: PageAppearance;
  /** Designer-only viewport simulation. Runtime pages remain responsive to the real viewport. */
  stacked?: boolean;
  header: ReactNode;
  actions: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
  footer: ReactNode;
}) {
  const resolvedSidebarColumns = sidebarColumns || 4;
  const mainColumns = 12 - resolvedSidebarColumns;
  const visual = { ...DEFAULT_APPEARANCE, ...appearance };
  const spacing = visual.density === 'compact' ? 'space-y-3' : visual.density === 'spacious' ? 'space-y-8' : 'space-y-6';
  const splitGap = visual.density === 'compact' ? 'gap-3' : visual.density === 'spacious' ? 'gap-8' : 'gap-6';
  const width = visual.contentWidth === 'contained' ? 'max-w-5xl' : visual.contentWidth === 'wide' ? 'max-w-7xl' : 'max-w-none';
  const surface = visual.surfaceStyle === 'flat'
    ? ''
    : visual.surfaceStyle === 'cards'
      ? 'rounded-3xl border border-border/50 bg-surface-container p-4 shadow-sm sm:p-6'
      : 'rounded-3xl bg-surface-container-low/45 p-3 sm:p-5';
  return (
    <div
      className={`mx-auto w-full ${width} ${spacing} ${surface}`}
      data-page-density={visual.density}
      data-page-width={visual.contentWidth}
      data-page-surface={visual.surfaceStyle}
    >
      {header}
      {actions}
      <div className={`flex flex-col ${splitGap} ${stacked ? '' : 'lg:flex-row lg:items-start'}`}>
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
// internally. Used by the real ticket page and the Entity Builder preview —
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
      appearance={page.appearance}
      header={<RegionGrid region={page.header} regionName="header" {...regionProps} />}
      actions={<RegionGrid region={page.actions} regionName="actions" {...regionProps} />}
      main={<RegionGrid region={page.main} regionName="main" {...regionProps} />}
      sidebar={<RegionGrid region={page.sidebar} regionName="sidebar" {...regionProps} />}
      footer={<RegionGrid region={page.footer} regionName="footer" {...regionProps} />}
    />
  );
}
