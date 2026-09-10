import type { ReactNode } from 'react';
import type { FormWidgetKey, PagePlacement } from '../metamodel';
import type { FormPageContext } from './context';
import { FORM_WIDGETS } from './FormWidgetRegistry';

// Dispatches a `field`/`widget` placement to its real component — the exact
// same lookup used by the real create/edit form, the Entity Builder preview
// and the designer canvas, so what is designed is what ships. `content`
// placements are handled internally by PageLayoutRenderer.
export function renderFormPlacementContent(
  placement: PagePlacement,
  context: FormPageContext,
): ReactNode {
  if (placement.kind === 'field') {
    // There is no record yet on a create form and `source: 'ticket'` fields
    // are owned by the Tickets projection, not by this form — the form
    // surfaces do not offer them in the palette, so this only guards a
    // document hand-edited in the Advanced JSON editor.
    if (placement.source !== 'catalog') return null;
    return context.renderField(placement);
  }
  if (placement.kind === 'widget' && placement.widgetKey) {
    const widget = FORM_WIDGETS[placement.widgetKey as FormWidgetKey];
    if (!widget) return null;
    return <widget.RuntimeComponent placement={placement} context={context} />;
  }
  return null;
}
