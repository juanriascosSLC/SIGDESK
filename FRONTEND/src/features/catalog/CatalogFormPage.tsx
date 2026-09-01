import type { FormEvent } from 'react';
import type { PageLayout } from './metamodel';
import { PageLayoutRenderer } from './runtime/PageLayoutRenderer';
import { findPagePlacementsByWidgetKey } from './runtime/page-layout-normalizer';
import type { FormPageContext } from './form-widgets/context';
import { FormActionsWidget } from './form-widgets/FormActionsWidget';
import { renderFormPlacementContent } from './form-widgets/render-placement';

// The create/edit form, rendered by the SAME PageLayoutRenderer the ticket
// detail page uses. That is the whole point of metamodel 1.6: the form an
// admin composes and the ticket it produces are laid out by one engine, on one
// grid, through one dispatcher — so a two-column form in the designer is a
// two-column form in production, and lines up with the record it creates.
//
// The `<form>` stays OUTSIDE the renderer on purpose. The submit button lives
// inside the `formActions` widget as a real `type="submit"`, so native HTML
// validation (required/minLength on DynamicField) and Enter-to-submit keep
// working with no `form=` attribute and no ref plumbing.
export function CatalogFormPage({
  page,
  context,
  onSubmit,
  className,
}: {
  page: PageLayout;
  context: FormPageContext;
  onSubmit: (event: FormEvent) => void;
  className?: string;
}) {
  const hasActions = findPagePlacementsByWidgetKey(page, 'formActions').length > 0;
  return (
    <form onSubmit={onSubmit} data-testid="catalog-form-page" className={className}>
      <PageLayoutRenderer
        page={page}
        data={context.data}
        renderPlacement={(placement) => renderFormPlacementContent(placement, context)}
      />
      {/* Safety net, not decoration: a page hand-edited in the Advanced JSON
          editor can legally lack the actions bar, and a form with no way to
          submit is a dead end for whoever opens it. */}
      {!hasActions && (
        <div className="mt-6">
          <FormActionsWidget context={context} />
        </div>
      )}
    </form>
  );
}
