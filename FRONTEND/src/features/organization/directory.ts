import { apiRequest } from '@/lib/apiClient';

/**
 * The organizational assignment directory: department → team → assignee.
 * Independent of `features/automations` on purpose — Automations is paused
 * this round, and Tickets/Changes assignment dialogs shouldn't gain a
 * dependency into a paused module just because it happened to be the first
 * caller of this endpoint.
 */
export interface AssignmentDirectory {
  departments: Array<{ id: string; nombre: string }>;
  teams: Array<{ id: string; nombre: string; department_id: string }>;
  assignees: Array<{ id: string; nombre: string; email: string; team_id: string }>;
}

export type AssignmentCapability = 'tickets' | 'change_tasks';

/**
 * `capability` decides two things server-side: who counts as assignable
 * (a change-task assignee set can differ from a ticket assignee set), and
 * — since the organization_service permission fix that shipped alongside
 * this UI — which `<capability>:update` permission lets the caller read the
 * directory at all, in addition to `workflows:update`.
 */
export function getAssignmentDirectory(capability: AssignmentCapability = 'tickets'): Promise<AssignmentDirectory> {
  return apiRequest<AssignmentDirectory>(`/organization/assignment-directory?capability=${capability}`);
}
