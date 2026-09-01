import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PagePlacement, RegionName, WidgetKey } from '../metamodel';

// A widget that serves any catalog entity. The form widgets cannot enumerate
// entity keys that do not exist yet (an admin can define a new one at any
// time), while the ticket widgets deliberately do — `sla` really is an
// incident-only concept.
export const ANY_ENTITY = '*';

// The half of a widget registry entry that is NOT React: everything the
// designer's pure functions need to decide admission, default spans,
// duplication, labels and icons. Splitting it out is what lets
// designer-actions.ts and page-library.ts stay free of React imports while
// still being parameterized by whichever page surface is active.
export interface PageWidgetMeta {
  key: WidgetKey;
  label: string;
  icon: LucideIcon;
  ownerModule: string;
  allowedRegions: RegionName[];
  minColumnSpan: number;
  allowMultiple: boolean;
  required: boolean;
  supportedEntityKeys: string[];
}

export interface PageWidgetDefinition<TContext> extends PageWidgetMeta {
  RuntimeComponent: (props: { placement: PagePlacement; context: TContext }) => ReactNode;
}

// Partial on purpose: a surface's catalog holds only the widgets that surface
// admits. A `widgetKey` absent from it is not "unknown yet", it is "not
// allowed here" — see placementAllowedInRegion, which rejects it outright.
export type PageWidgetMetaCatalog = Partial<Record<WidgetKey, PageWidgetMeta>>;

export function widgetSupportsEntity(widget: PageWidgetMeta, entityKey: string): boolean {
  return (
    widget.supportedEntityKeys.includes(ANY_ENTITY) ||
    widget.supportedEntityKeys.includes(entityKey)
  );
}
