import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Ticket as TicketIcon,
  BarChart3,
  Network,
  ListChecks,
  SearchCode,
  Server,
  FilePlus2,
  Boxes,
  BookOpen,
  Workflow,
  Timer,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { PERMISSIONS } from '../auth/permissions';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/ui/states';

interface ModuleLink {
  to: string;
  label: string;
  icon: LucideIcon;
  visible: boolean;
}

/**
 * Home used to carry a "Ticket status snapshot" card here — one
 * `useTickets({status, limit: 50})` call per status (4 parallel list
 * requests on every load, just to render 4 numbers). That was real data,
 * not invented, but it was also exactly the kind of cost this screen
 * shouldn't pay: the backend has no aggregate/summary endpoint (a single
 * "counts by status" response), so getting real numbers meant fetching and
 * counting whole pages of tickets — and even then `hasMore` only proves a
 * lower bound, never an exact total. Per "if there's no efficient summary
 * endpoint, show quick access without computing costly figures, and
 * document the need for the endpoint": the counts are gone, the quick
 * links below cost nothing (they're permission checks, not queries), and
 * this comment is that documentation — add a real ticket-summary endpoint
 * (e.g. `GET /entities/INC/summary` returning counts per status, scoped
 * the same way list already is) before reintroducing any number here.
 */
function ModuleLinksCard({ links }: { links: ModuleLink[] }) {
  const visible = links.filter((link) => link.visible);
  if (visible.length === 0) {
    return (
      <Card>
        <ErrorState
          title="No modules available"
          description="Your account doesn't have permission to view any module yet. Ask an administrator to grant you access."
          compact
        />
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {visible.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to}>
          <Card interactive className="flex h-full flex-col items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-bold text-on-surface">{label}</span>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function Dashboard() {
  const {
    displayName,
    canViewTickets,
    canManageUsersAndRoles,
    can,
  } = useAuth();

  const canViewChanges = can(PERMISSIONS.changesView);
  const canViewChangeTasks = can(PERMISSIONS.changeTasksView);
  const canViewProblems = can(PERMISSIONS.problemsView);
  const canViewAssets = can(PERMISSIONS.assetsView);
  const canViewReports = can(PERMISSIONS.reportsView);
  const canViewCatalog = can(PERMISSIONS.catalogView);
  const canViewKnowledge = can(PERMISSIONS.knowledgeView);
  const canAuthorCatalog = can(PERMISSIONS.catalogAuthor);
  const canViewAutomations = can(PERMISSIONS.automationsView);
  const canViewSla = can(PERMISSIONS.slaView);

  const moduleLinks: ModuleLink[] = [
    // Same labels and icons as config/navigation.ts — these tiles are a
    // second door to the very same destinations, so a rename that lands
    // in only one of the two lists is the drift this comment exists to
    // prevent.
    { to: '/app/tickets', label: 'Incidents', icon: TicketIcon, visible: canViewTickets },
    { to: '/app/reports', label: 'Reports', icon: BarChart3, visible: canViewReports },
    { to: '/app/changes', label: 'Changes', icon: Network, visible: canViewChanges },
    { to: '/app/changes/my-tasks', label: 'My Tasks', icon: ListChecks, visible: canViewChangeTasks },
    { to: '/app/problems', label: 'Problems', icon: SearchCode, visible: canViewProblems },
    { to: '/app/assets', label: 'Assets / CMDB', icon: Server, visible: canViewAssets },
    { to: '/app/catalog', label: 'New Case', icon: FilePlus2, visible: canViewCatalog },
    { to: '/app/knowledge', label: 'Knowledge Base', icon: BookOpen, visible: canViewKnowledge },
    { to: '/app/admin/users', label: 'Users & Roles', icon: Users, visible: canManageUsersAndRoles },
    { to: '/app/admin/catalog-builder', label: 'Entity Builder', icon: Boxes, visible: canAuthorCatalog },
    { to: '/app/automations', label: 'Automations', icon: Workflow, visible: canViewAutomations },
    { to: '/app/settings/sla', label: 'SLA Policies', icon: Timer, visible: canViewSla },
  ];

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <PageHeader
        title={displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
        description="Jump into a module below."
      />

      <ModuleLinksCard links={moduleLinks} />
    </div>
  );
}
