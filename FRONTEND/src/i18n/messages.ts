/**
 * SIG-DESK's message catalog — the "small, maintainable i18n solution"
 * called for when no i18n library was already installed (none was: no
 * react-i18next/i18next/formatjs/lingui in package.json).
 *
 * This intentionally does NOT pull in a runtime-switching i18n framework.
 * The requirement this round is "English as the default and official
 * language", not a language switcher — building the full framework now
 * would be exactly the kind of not-yet-used abstraction the brief asks to
 * avoid. What it DOES give the app:
 *
 *   - ONE place to change a piece of shared UI copy instead of hunting
 *     across files for every "Cancel" button that was typed out by hand.
 *   - A typed `t()` so a call site can't reference a key that doesn't
 *     exist (`t('common.cancel')` is checked at compile time).
 *   - A seam: if real runtime i18n is ever needed, every `t('...')` call
 *     site is already isolated from its string literal and can be re-pointed
 *     at a real library without touching feature code.
 *
 * Scope: this catalog covers SHARED chrome — actions, dialog titles, the
 * seven data-states, and navigation — the copy that was genuinely
 * duplicated (typed fresh, slightly differently, in a dozen files) rather
 * than a wholesale relocation of every string in the app. Domain-specific
 * vocabulary (ticket/RFC/task/problem status labels) stays owned by its
 * domain's own presentation module (e.g. `features/changes/presentation.ts`),
 * translated to English there, for the same reason a shared catalog
 * shouldn't know what "Pending Review" means to a ticket vs. an RFC.
 *
 * IDs, enum values, and technical keys are never translated here — see
 * `features/tickets/api.ts`'s `statusFromApi`/`canonicalTicketState` for the
 * enum boundary; this file only holds copy meant for a screen.
 */

export const messages = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    saveDraft: 'Save draft',
    savingDraft: 'Saving…',
    publish: 'Publish',
    publishing: 'Publishing…',
    discard: 'Discard',
    discardDraft: 'Discard draft',
    delete: 'Delete',
    deleting: 'Deleting…',
    create: 'Create',
    creating: 'Creating…',
    edit: 'Edit',
    close: 'Close',
    confirm: 'Confirm',
    reopen: 'Reopen',
    reassign: 'Reassign',
    assign: 'Assign',
    unassign: 'Unassign',
    merge: 'Merge',
    watch: 'Watch',
    unwatch: 'Unwatch',
    complete: 'Complete',
    block: 'Block',
    unblock: 'Unblock',
    reject: 'Reject',
    approve: 'Approve',
    tryAgain: 'Try again',
    back: 'Back',
    next: 'Next',
    search: 'Search',
    clearSearch: 'Clear search',
    required: 'Required',
    optional: 'Optional',
    reason: 'Reason',
    justification: 'Justification',
    evidence: 'Evidence',
    yes: 'Yes',
    no: 'No',
    unassigned: 'Unassigned',
    none: 'None',
    loading: 'Loading…',
  },
  states: {
    loadingGeneric: 'Loading…',
    errorTitle: "We couldn't load this",
    errorDescription: 'Please try again.',
    offlineTitle: "We couldn't reach the server",
    offlineDescription: 'Check your connection and try again.',
    permissionDeniedTitle: "You don't have permission to view this",
    permissionDeniedDescription: 'Ask an administrator to grant you access if you need it.',
    staleDataDescription: 'This data may be out of date.',
    sessionExpiredTitle: 'Your session has expired',
    sessionExpiredDescription: 'Sign in again to continue.',
  },
  dialogs: {
    assignTicketTitle: 'Assign ticket',
    reassignTicketTitle: 'Reassign ticket',
    reopenTicketTitle: 'Reopen ticket',
    reopenTicketReasonLabel: 'Reason for reopening',
    mergeTicketsTitle: 'Merge tickets',
    bulkAssignTitle: 'Assign selected tickets',
    watchTicketTitle: 'Watch this ticket',
    unwatchTicketTitle: 'Stop watching this ticket',
    rejectRfcTitle: 'Reject RFC',
    rejectRfcReasonLabel: 'Justification for rejection',
    completeTaskTitle: 'Complete task',
    completeTaskEvidenceLabel: 'Evidence or result',
    blockTaskTitle: 'Block task',
    blockTaskReasonLabel: 'Reason for blocking',
    cancelTaskTitle: 'Cancel task',
    cancelTaskReasonLabel: 'Reason for cancellation',
    deleteRoleTitle: 'Delete role',
    discardDraftTitle: 'Discard draft',
    unsavedChangesTitle: 'You have unsaved changes',
    unsavedChangesDescription: 'Leaving now will discard them. Continue?',
  },
  nav: {
    home: 'Home',
    tickets: 'Tickets',
    myTasks: 'My Tasks',
    newCase: 'New Case',
    assets: 'Assets',
    knowledge: 'Knowledge',
    reports: 'Reports',
    problems: 'Problems',
    changes: 'Changes',
    workspace: 'Workspace',
    cases: 'Cases',
    reference: 'Reference',
    administration: 'Administration',
    usersRoles: 'Users & Roles',
    catalogBuilder: 'Entity Builder',
    automations: 'Automations',
    slaPolicies: 'SLA Policies',
    chatops: 'ChatOps',
    apiKeys: 'API Keys',
    more: 'More',
  },
} as const;

type Messages = typeof messages;
type DotPath<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : { [K in keyof T & string]: DotPath<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K}`> }[keyof T & string];

export type MessageKey = DotPath<Messages>;

function resolve(path: string): string {
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = messages;
  for (const part of parts) {
    node = node?.[part];
  }
  return typeof node === 'string' ? node : path;
}

/** `t('common.cancel')` → `'Cancel'`. Keys are type-checked against the
 *  catalog above, so a typo or a removed key fails at compile time. */
export function t(key: MessageKey): string {
  return resolve(key);
}
