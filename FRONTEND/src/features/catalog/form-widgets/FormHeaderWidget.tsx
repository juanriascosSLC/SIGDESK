import { FileText } from 'lucide-react';
import type { FormPageContext } from './context';

// The create/edit form's counterpart of TicketHeaderWidget: it says what is
// being filled in and under which published version of the definition. Locked
// and required, like its ticket-page twin — a form whose header an admin could
// delete would render as an anonymous stack of inputs.
export function FormHeaderWidget({ context }: { context: FormPageContext }) {
  return (
    <div className="flex items-start gap-4" data-testid="form-header-widget">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/20">
        <FileText className="h-6 w-6 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black text-on-surface">{context.definitionName}</h1>
          <span className="font-mono text-xs text-primary">
            {context.humanId ?? context.entityKey}
            {context.definitionVersion !== undefined && ` · v${context.definitionVersion}`}
          </span>
        </div>
        {context.description && (
          <p className="text-sm text-on-surface-variant">{context.description}</p>
        )}
      </div>
    </div>
  );
}
