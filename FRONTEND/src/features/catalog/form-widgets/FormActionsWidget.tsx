import type { FormPageContext } from './context';

// The submit bar. It carries the server rejection and the local validation
// notice with it, because a message about why the form cannot be sent belongs
// next to the button that sends it — before this the two lived in different
// parts of CatalogForm and one of them was easy to miss.
//
// The submit button is a real `type="submit"` inside the page's own `<form>`,
// so native HTML validation (required, minLength on DynamicField) and
// Enter-to-submit keep working without a `form=` attribute or a ref.
export function FormActionsWidget({ context }: { context: FormPageContext }) {
  const { submit } = context;
  return (
    <div className="border-t border-border/40 pt-4" data-testid="form-actions-widget">
      {(submit.errorMessage || submit.warningMessage) && (
        <div
          role="alert"
          className={`mb-4 rounded-2xl border p-4 text-sm font-medium ${
            submit.errorMessage
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
        >
          {submit.errorMessage ?? submit.warningMessage}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={submit.onCancel}
          className="rounded-xl border border-border/50 px-6 py-3 font-bold text-on-surface"
        >
          {submit.cancelLabel}
        </button>
        <button
          type="submit"
          disabled={submit.pending || submit.disabled}
          data-testid="catalog-form-submit"
          className="rounded-xl bg-primary px-8 py-3 font-black text-primary-foreground disabled:opacity-50"
        >
          {submit.pending ? 'Guardando…' : submit.submitLabel}
        </button>
      </div>
    </div>
  );
}
