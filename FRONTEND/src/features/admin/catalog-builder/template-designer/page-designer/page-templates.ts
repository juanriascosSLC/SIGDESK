import type {
  PageAppearance,
  PageLayout,
  PagePlacement,
  RegionName,
  RegionStyle,
} from '@/features/catalog/metamodel';
import { placementAllowedInRegion } from './designer-actions';
import type { AnyPageSurface } from './surface';

export type PageTemplateKey = 'operations' | 'guided' | 'investigation';

export interface PageExperienceTemplate {
  key: PageTemplateKey;
  name: string;
  description: string;
  bestFor: string;
  sidebarColumns: number;
  appearance: PageAppearance;
  regionStyles: Record<RegionName, RegionStyle>;
}

const transparent: RegionStyle = { surface: 'transparent', padding: 'none', gap: 'comfortable' };

export const PAGE_EXPERIENCE_TEMPLATES: PageExperienceTemplate[] = [
  {
    key: 'operations',
    name: 'Operations desk',
    description: 'Dense two-column workspace with context kept beside the active work.',
    bestFor: 'Agent triage and high-volume handling',
    sidebarColumns: 3,
    appearance: { density: 'compact', contentWidth: 'full', surfaceStyle: 'flat' },
    regionStyles: {
      header: transparent,
      actions: { surface: 'subtle', padding: 'sm', gap: 'compact' },
      main: { surface: 'transparent', padding: 'none', gap: 'compact' },
      sidebar: { surface: 'subtle', padding: 'sm', gap: 'compact' },
      footer: transparent,
    },
  },
  {
    key: 'guided',
    name: 'Guided request',
    description: 'A calm, linear page that gives every field and instruction room to breathe.',
    bestFor: 'Requester forms and structured reviews',
    sidebarColumns: 4,
    appearance: { density: 'spacious', contentWidth: 'contained', surfaceStyle: 'cards' },
    regionStyles: {
      header: transparent,
      actions: transparent,
      main: { surface: 'card', padding: 'md', gap: 'spacious' },
      sidebar: { surface: 'subtle', padding: 'md', gap: 'comfortable' },
      footer: { surface: 'transparent', padding: 'sm', gap: 'comfortable' },
    },
  },
  {
    key: 'investigation',
    name: 'Investigation workspace',
    description: 'Evidence, relationships and activity take priority; reference context stays visible.',
    bestFor: 'Problems, changes and service execution',
    sidebarColumns: 4,
    appearance: { density: 'comfortable', contentWidth: 'wide', surfaceStyle: 'soft' },
    regionStyles: {
      header: transparent,
      actions: { surface: 'subtle', padding: 'sm', gap: 'comfortable' },
      main: { surface: 'card', padding: 'md', gap: 'comfortable' },
      sidebar: { surface: 'card', padding: 'sm', gap: 'comfortable' },
      footer: { surface: 'subtle', padding: 'sm', gap: 'compact' },
    },
  },
];

const CONTEXT_WIDGETS = new Set([
  'requesterDetails', 'assetDetails', 'stakeholders', 'formRequesterDetails',
  'formAssetSummary', 'formStakeholders', 'formRecordSummary', 'formSlaPreview', 'sla',
]);
const HISTORY_WIDGETS = new Set(['activity', 'statusHistory', 'mergedTickets']);

function targetRegion(
  template: PageTemplateKey,
  placement: PagePlacement,
  current: RegionName,
  surface: AnyPageSurface,
): RegionName {
  const widget = placement.widgetKey ?? '';
  let preferred: RegionName = 'main';
  if (CONTEXT_WIDGETS.has(widget)) preferred = 'sidebar';
  if (template !== 'operations' && HISTORY_WIDGETS.has(widget)) preferred = 'footer';
  if (template === 'investigation' && ['itsmRelations', 'changeTasks', 'attachments'].includes(widget)) preferred = 'main';
  if (template === 'guided' && placement.kind === 'field') preferred = 'main';
  if (placementAllowedInRegion(surface, placement, preferred)) return preferred;
  if (placementAllowedInRegion(surface, placement, current)) return current;
  return (['main', 'sidebar', 'footer'] as RegionName[]).find((region) =>
    placementAllowedInRegion(surface, placement, region),
  ) ?? current;
}

function relayout(placements: PagePlacement[], region: RegionName, template: PageTemplateKey): PagePlacement[] {
  let row = 0;
  let column = 0;
  return placements.map((placement) => {
    const requestedSpan = region === 'sidebar'
      ? 12
      : placement.kind === 'field' && template !== 'guided'
        ? 6
        : 12;
    const span = Math.min(12, Math.max(1, requestedSpan));
    if (column + span > 12) {
      row += 1;
      column = 0;
    }
    const next = { ...placement, row, column, columnSpan: span };
    column += span;
    if (column >= 12) {
      row += 1;
      column = 0;
    }
    return next;
  });
}

/** Reflows every movable placement exactly once; fixed structural regions remain immutable. */
export function applyPageExperienceTemplate(
  page: PageLayout,
  template: PageExperienceTemplate,
  surface: AnyPageSurface,
): PageLayout {
  const buckets: Record<'main' | 'sidebar' | 'footer', PagePlacement[]> = { main: [], sidebar: [], footer: [] };
  for (const current of ['main', 'sidebar', 'footer'] as const) {
    for (const placement of page[current].placements) {
      const target = targetRegion(template.key, placement, current, surface);
      const safeTarget = target === 'main' || target === 'sidebar' || target === 'footer' ? target : current;
      buckets[safeTarget].push(placement);
    }
  }
  return {
    ...page,
    sidebarColumns: template.sidebarColumns,
    appearance: template.appearance,
    header: { ...page.header, style: template.regionStyles.header },
    actions: { ...page.actions, style: template.regionStyles.actions },
    main: { ...page.main, style: template.regionStyles.main, placements: relayout(buckets.main, 'main', template.key) },
    sidebar: { ...page.sidebar, style: template.regionStyles.sidebar, placements: relayout(buckets.sidebar, 'sidebar', template.key) },
    footer: { ...page.footer, style: template.regionStyles.footer, placements: relayout(buckets.footer, 'footer', template.key) },
  };
}
