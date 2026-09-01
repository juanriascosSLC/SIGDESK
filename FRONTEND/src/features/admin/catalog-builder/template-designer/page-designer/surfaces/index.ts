import type { LayoutKind } from '@/features/catalog/metamodel';
import type { AnyPageSurface } from '../surface';
import { DETAIL_SURFACE } from './detail-surface';
import { CREATE_SURFACE, EDIT_SURFACE } from './form-surface';

// The three designable pages of a catalog definition. PageDesigner is
// remounted when the active kind changes (TemplateDesigner passes
// `key={activeKind}`), because each surface brings its own simulated-context
// hook and swapping hooks under a mounted component is not allowed.
export const SURFACE_BY_KIND: Record<LayoutKind, AnyPageSurface> = {
  create: CREATE_SURFACE,
  edit: EDIT_SURFACE,
  detail: DETAIL_SURFACE,
};
