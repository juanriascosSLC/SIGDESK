import type { Ticket } from './types';

/**
 * The exact five requester/assignee labels this pass (Ticket identity
 * presentation) is scoped to set — deliberately kept in English, and
 * deliberately not a broader translation pass (that is separate, assigned
 * work). Every surface that shows a requester/assignee imports these
 * instead of hardcoding its own copy, so a future wording change happens
 * in one place.
 */
export const REQUESTER_LABEL = 'Requester';
export const ASSIGNED_TO_LABEL = 'Assigned to';
export const UNASSIGNED_LABEL = 'Unassigned';
export const USER_UNAVAILABLE_LABEL = 'User unavailable';
export const TEAM_ASSIGNMENT_LABEL = 'Team assignment';

/**
 * Single ready-to-render string for a ticket's assignee: a person's name, a
 * team-only assignment (never disguised as "Unassigned" — there IS a
 * destination, just no individual yet), or "Unassigned" when there is
 * genuinely nothing. Never a raw id.
 */
export function assigneeText(
  ticket: Pick<Ticket, 'assigneeDisplayName' | 'assigneeTeamName'>,
): string {
  if (ticket.assigneeDisplayName) return ticket.assigneeDisplayName;
  if (ticket.assigneeTeamName) return `${TEAM_ASSIGNMENT_LABEL}: ${ticket.assigneeTeamName}`;
  return UNASSIGNED_LABEL;
}

/**
 * Whether a ticket has ANY assignment destination — an individual assignee,
 * a team-only organizational assignment, or a legacy first-responsible.
 * "Assigned" and "has an individual assignee" are NOT the same question: a
 * team-only assignment is a real destination and must count as assigned
 * everywhere a ticket is bucketed/filtered/counted as assigned vs.
 * unassigned (quick views, Kanban, filters, detail actions) — never just
 * `Boolean(ticket.assigneeId)`, which silently drops team-only tickets into
 * "unassigned".
 */
export function isTicketAssigned(
  ticket: Pick<Ticket, 'assigneeId' | 'assigneeTeamName'>,
): boolean {
  return Boolean(ticket.assigneeId || ticket.assigneeTeamName);
}
