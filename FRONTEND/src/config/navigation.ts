import {
  LayoutDashboard,
  Ticket as TicketIcon,
  ListChecks,
  FolderKanban,
  ShieldCheck,
  BarChart3,
  Network,
  SearchCode,
  Server,
  Users,
  Workflow,
  Timer,
  MessageSquare,
  Settings,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS } from '@/features/auth/permissions';

/**
 * The single source of truth for the agent workspace's navigation — one
 * list, consumed by the desktop sidebar, the tablet drawer, the mobile
 * bottom nav, and the mobile "More" sheet. Each surface renders a
 * different CONTAINER around the same items (see the `select*` helpers
 * below); none of them keeps its own copy of labels or permission checks.
 * Before this, three drifting lists were exactly the failure mode this
 * file exists to prevent — a permission or a label fixed in one place and
 * silently stale in the other two.
 */

export type NavSection = 'workspace' | 'itsm' | 'administration';
export type NavSurface = 'sidebar' | 'drawer' | 'bottomnav';

/** Section headers as actually displayed — sentence case, never forced
 *  through CSS `uppercase` (a past pass on this codebase deliberately
 *  walked that back everywhere else; the nav is no exception). */
export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  workspace: 'Workspace',
  itsm: 'ITSM',
  administration: 'Administration',
};

/**
 * What a permission check needs from `useAuth()`. A plain object instead
 * of importing `AuthContextValue` directly: this file must never depend on
 * a specific role name (per the standing "no hardcoded role strings"
 * rule) — only on the same real capability booleans/`can()` calls every
 * other protected route already uses.
 */
export interface NavPermissionContext {
  can: (permissionKey: string) => boolean;
  canViewTickets: boolean;
  canManageUsersAndRoles: boolean;
}

export interface NavItem {
  key: string;
  label: string;
  route: string;
  icon: LucideIcon;
  section: NavSection;
  /** Real capability check — never `true` unconditionally except for
   *  Dashboard, which every authenticated agent-workspace user may see by
   *  virtue of already having passed the outer /app/* gate. */
  permission: (ctx: NavPermissionContext) => boolean;
  /** Which nav surfaces this item can render on. Every item that appears
   *  anywhere append-only reachable also appears in `drawer` — drawer
   *  (tablet) and the mobile "More" sheet both render the FULL permitted
   *  list, just via a different trigger, so nothing becomes unreachable
   *  just because the viewport is narrow. `bottomnav` is a small,
   *  deliberately curated subset (see below), not "whatever fits". */
  surfaces: NavSurface[];
  /** Exact-path match only, instead of the default prefix match. Needed
   *  for Dashboard's `/app` (which would otherwise prefix-match every
   *  /app/* route) — findActiveNavItem's "longest match wins" tie-break
   *  handles every other case safely without this flag. */
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    route: '/app',
    icon: LayoutDashboard,
    section: 'workspace',
    permission: () => true,
    surfaces: ['sidebar', 'drawer', 'bottomnav'],
    exact: true,
  },
  {
    key: 'tickets',
    label: 'Tickets & Issues',
    route: '/app/tickets',
    icon: TicketIcon,
    section: 'workspace',
    permission: (ctx) => ctx.canViewTickets,
    surfaces: ['sidebar', 'drawer', 'bottomnav'],
  },
  {
    key: 'my-tasks',
    label: 'My Tasks',
    route: '/app/changes/my-tasks',
    icon: ListChecks,
    section: 'workspace',
    // The real inbox (features/changes/MyChangeTasks.tsx) — a distinct
    // grant from `changesView`: a task-only operator can be handed a Task
    // from an RFC they have no permission to browse at all.
    permission: (ctx) => ctx.can(PERMISSIONS.changeTasksView),
    surfaces: ['sidebar', 'drawer', 'bottomnav'],
    exact: true,
  },
  {
    key: 'catalog',
    label: 'Service Catalog',
    route: '/app/catalog',
    icon: FolderKanban,
    section: 'workspace',
    permission: (ctx) => ctx.can(PERMISSIONS.catalogView),
    surfaces: ['sidebar', 'drawer', 'bottomnav'],
  },
  {
    key: 'knowledge',
    label: 'Knowledge Base',
    route: '/app/knowledge',
    icon: ShieldCheck,
    section: 'workspace',
    permission: (ctx) => ctx.can(PERMISSIONS.knowledgeView),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'reports',
    label: 'Reports',
    route: '/app/reports',
    icon: BarChart3,
    section: 'workspace',
    permission: (ctx) => ctx.can(PERMISSIONS.reportsView),
    surfaces: ['sidebar', 'drawer'],
  },
  // "Change Mgmt"/"Problem Mgmt"/"Assets" are ITSM's coordination
  // surfaces (cross-team process work) — deliberately its own section,
  // never merged with Service Catalog (self-service intake) above, which
  // is a different concern that only looks adjacent.
  {
    key: 'changes',
    label: 'Change Mgmt',
    route: '/app/changes',
    icon: Network,
    section: 'itsm',
    permission: (ctx) => ctx.can(PERMISSIONS.changesView),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'problems',
    label: 'Problem Mgmt',
    route: '/app/problems',
    icon: SearchCode,
    section: 'itsm',
    permission: (ctx) => ctx.can(PERMISSIONS.problemsView),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'assets',
    label: 'Assets / CMDB',
    route: '/app/assets',
    icon: Server,
    section: 'itsm',
    permission: (ctx) => ctx.can(PERMISSIONS.assetsView),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'services',
    label: 'Services',
    route: '/app/services',
    icon: Wrench,
    section: 'itsm',
    permission: (ctx) => ctx.can(PERMISSIONS.changesView),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'admin-users',
    label: 'Users & Roles',
    route: '/app/admin/users',
    icon: Users,
    section: 'administration',
    permission: (ctx) => ctx.canManageUsersAndRoles,
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'catalog-builder',
    label: 'Catalog Builder',
    route: '/app/admin/catalog-builder',
    icon: FolderKanban,
    section: 'administration',
    permission: (ctx) => ctx.can(PERMISSIONS.catalogAuthor),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'automations',
    label: 'Automations',
    route: '/app/automations',
    icon: Workflow,
    section: 'administration',
    permission: (ctx) => ctx.can(PERMISSIONS.automationsView),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'sla',
    label: 'SLA Policies',
    route: '/app/settings/sla',
    icon: Timer,
    section: 'administration',
    permission: (ctx) => ctx.can(PERMISSIONS.slaView),
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'chatops',
    label: 'ChatOps',
    route: '/app/settings/chatops',
    icon: MessageSquare,
    // No canonical chatops:* permission exists on the backend yet (same
    // documented gap as the route guard in App.tsx) — gated on the same
    // real capability the guard uses, not a role name.
    section: 'administration',
    permission: (ctx) => ctx.canManageUsersAndRoles,
    surfaces: ['sidebar', 'drawer'],
  },
  {
    key: 'api-keys',
    label: 'API Keys',
    route: '/app/settings/api-keys',
    icon: Settings,
    section: 'administration',
    permission: (ctx) => ctx.canManageUsersAndRoles,
    surfaces: ['sidebar', 'drawer'],
  },
];

function isVisible(item: NavItem, ctx: NavPermissionContext): boolean {
  return item.permission(ctx);
}

/** Items for the desktop persistent sidebar (>= lg), grouped by section
 *  order as declared above. */
export function selectSidebarItems(ctx: NavPermissionContext): NavItem[] {
  return NAV_ITEMS.filter((item) => item.surfaces.includes('sidebar') && isVisible(item, ctx));
}

/** Items for the tablet drawer and the mobile "More" sheet — the full
 *  permitted list. Kept as a separate selector (not just an alias for
 *  `selectSidebarItems`) so a future surface-specific exclusion doesn't
 *  have to touch call sites. */
export function selectDrawerItems(ctx: NavPermissionContext): NavItem[] {
  return NAV_ITEMS.filter((item) => item.surfaces.includes('drawer') && isVisible(item, ctx));
}

/** Up to `max` primary destinations for the mobile bottom bar — a
 *  deliberately curated subset (`surfaces.includes('bottomnav')`), not
 *  "the first N of everything": Change/Problem/Assets/Reports/Knowledge
 *  and all of Administration are one tap away in "More" instead, rather
 *  than crowding out day-to-day destinations on a phone. */
export function selectBottomNavItems(ctx: NavPermissionContext, max = 4): NavItem[] {
  return NAV_ITEMS.filter((item) => item.surfaces.includes('bottomnav') && isVisible(item, ctx)).slice(0, max);
}

/** Everything in the drawer list that ISN'T already pinned to the bottom
 *  bar — the mobile "More" sheet's content. */
export function selectMoreItems(ctx: NavPermissionContext, primary: NavItem[]): NavItem[] {
  const pinned = new Set(primary.map((item) => item.key));
  return selectDrawerItems(ctx).filter((item) => !pinned.has(item.key));
}

/** Which item (if any) should render as "active" for the current path.
 *  Both a plain equality/prefix match AND the "child routes count too"
 *  requirement are handled the same way everywhere nav is rendered: when
 *  more than one item's route matches (e.g. "/app/changes" and
 *  "/app/changes/my-tasks" both prefix-match "/app/changes/my-tasks/x"),
 *  the most specific (longest) route wins — no per-item exclusion list to
 *  keep in sync as routes are added. */
export function findActiveNavItem<T extends { route: string; exact?: boolean }>(
  items: T[],
  pathname: string,
): T | undefined {
  const matches = items.filter((item) =>
    item.exact ? pathname === item.route : pathname === item.route || pathname.startsWith(`${item.route}/`),
  );
  if (matches.length === 0) return undefined;
  return matches.reduce((best, item) => (item.route.length > best.route.length ? item : best));
}

/** Groups items by section, dropping empty sections — an "Administration"
 *  heading over zero links reads as a broken page, not an empty one. */
export function groupBySection(items: NavItem[]): Array<{ section: NavSection; items: NavItem[] }> {
  const order: NavSection[] = ['workspace', 'itsm', 'administration'];
  return order
    .map((section) => ({ section, items: items.filter((item) => item.section === section) }))
    .filter((group) => group.items.length > 0);
}
