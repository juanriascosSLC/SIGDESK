/**
 * SIG-DESK's permission keys. Both sides must agree: the frontend uses them to decide what
 * to render, the backend to decide what to allow. The UI never gets to be the
 * only check.
 *
 * They follow the shared registry's "<module>.<resource>.<action>" convention,
 * the same shape as installations.projects.create and inventory.view in the
 * other two apps, and must exist in the SIGTools permissions table with
 * app = "sigdesk" before a role can be granted them.
 */
export const PERMISSIONS = {
  ticketsView: 'sigdesk.tickets.view',
  ticketsCreate: 'sigdesk.tickets.create',
  ticketsEdit: 'sigdesk.tickets.edit',
  ticketsAssign: 'sigdesk.tickets.assign',
  ticketsResolve: 'sigdesk.tickets.resolve',
  ticketsMerge: 'sigdesk.tickets.merge',
  ticketsComment: 'sigdesk.tickets.comment',
  ticketsAttach: 'sigdesk.tickets.attach',
  catalogView: 'sigdesk.catalog.view',
  catalogAuthor: 'sigdesk.catalog.author',
  catalogPublish: 'sigdesk.catalog.publish',
  slaView: 'sigdesk.sla.view',
  slaManage: 'sigdesk.sla.manage',
  changesView: 'sigdesk.changes.view',
  changesCreate: 'sigdesk.changes.create',
  changesEdit: 'sigdesk.changes.edit',
  changesApprove: 'sigdesk.changes.approve',
  changesImplement: 'sigdesk.changes.implement',
  problemsView: 'sigdesk.problems.view',
  problemsCreate: 'sigdesk.problems.create',
  problemsEdit: 'sigdesk.problems.edit',
  problemsResolve: 'sigdesk.problems.resolve',
} as const;

/** The app prefix used to tell SIG-DESK's permissions apart from the other
 *  apps' in the shared registry. */
export const SIGDESK_APP = 'sigdesk';

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
