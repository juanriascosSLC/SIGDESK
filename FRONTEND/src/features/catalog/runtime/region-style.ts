import type { RegionStyle } from '../metamodel';

export const DEFAULT_REGION_STYLE: RegionStyle = {
  surface: 'transparent',
  padding: 'none',
  gap: 'comfortable',
};

export function resolveRegionStyle(style?: Partial<RegionStyle>): RegionStyle {
  return { ...DEFAULT_REGION_STYLE, ...style };
}

export function regionPresentationClasses(style?: Partial<RegionStyle>): string {
  const resolved = resolveRegionStyle(style);
  const surface = resolved.surface === 'card'
    ? 'rounded-2xl border border-border/50 bg-surface-container shadow-sm'
    : resolved.surface === 'subtle'
      ? 'rounded-2xl bg-surface-container-low/70'
      : '';
  const padding = resolved.padding === 'md' ? 'p-4' : resolved.padding === 'sm' ? 'p-2.5' : '';
  const gap = resolved.gap === 'compact' ? 'gap-2' : resolved.gap === 'spacious' ? 'gap-6' : 'gap-4';
  return `${surface} ${padding} ${gap}`.trim();
}
