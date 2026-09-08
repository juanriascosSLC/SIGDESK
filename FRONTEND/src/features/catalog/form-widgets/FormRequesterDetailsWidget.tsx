import { UserRound } from 'lucide-react';
import type { FormPageContext } from './context';

// Who is filling the form in, read from the authenticated session. Read-only
// on purpose: the requester of a record created here is the signed-in user,
// and offering a picker would suggest otherwise.
//
// Deliberately NOT the ticket page's `requesterDetails` under a shared key:
// that one reads `context.ticket.requesterDisplayName` from a record that
// exists. Sharing the key would make the two registries look interchangeable
// when their runtime components read different data.
export function FormRequesterDetailsWidget({ context }: { context: FormPageContext }) {
  return (
    <div
      className="rounded-3xl border border-border/40 bg-surface-container-low p-6"
      data-testid="form-requester-widget"
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <UserRound className="h-4 w-4 text-primary" />
        Requester
      </h3>
      <p className="text-sm font-medium text-on-surface">{context.requester.displayName}</p>
      {context.requester.email && (
        <p className="mt-1 text-xs text-on-surface-variant">{context.requester.email}</p>
      )}
    </div>
  );
}
