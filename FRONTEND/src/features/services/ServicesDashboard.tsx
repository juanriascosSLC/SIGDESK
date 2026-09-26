import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CirclePlay,
  Clock3,
  ListChecks,
  MapPin,
  Network,
  RefreshCw,
  Server,
} from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  SearchInput,
  Select,
  StaleDataState,
  Tabs,
} from '@/components/ui';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { formatDateTime } from '@/i18n/format';
import type { ChangeTaskStatus } from '@/features/changes/api';
import {
  listServiceSites,
  listServiceWorkOrders,
} from './api';
import { WorkOrderCard } from './WorkOrderCard';
import { workOrderAttention } from './presentation';
import type { ServiceWorkOrderScope } from './types';

type WorkspaceView = 'work-orders' | 'sites';
type KpiKey = 'attention' | 'ready' | 'in-progress' | 'waiting';

const SCOPE_TABS: Array<{ key: ServiceWorkOrderScope; label: string }> = [
  { key: 'mine', label: 'Assigned to me' },
  { key: 'team', label: 'My team' },
  { key: 'scope', label: 'My full scope' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Awaiting dependencies' },
  { value: 'ready', label: 'Ready to start' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
];

export default function ServicesDashboard() {
  const { can } = useAuth();
  const canViewWorkOrders = can(PERMISSIONS.changeTasksView);
  const canViewSites = can(PERMISSIONS.assetsView);
  const availableViews: WorkspaceView[] = [
    ...(canViewWorkOrders ? ['work-orders' as const] : []),
    ...(canViewSites ? ['sites' as const] : []),
  ];
  const [view, setView] = useState<WorkspaceView>(availableViews[0] ?? 'work-orders');

  if (availableViews.length === 0) {
    return (
      <ServicesShell>
        <PermissionDeniedState description="You need access to RFC tasks or Assets / CMDB to use the Services workspace." />
      </ServicesShell>
    );
  }

  return (
    <ServicesShell>
      <PageHeader
        title="Services operations"
        description="Execute service work orders, coordinate field work, and inspect the sites and equipment involved."
        actions={can(PERMISSIONS.changesView) ? (
          <Link to="/app/changes" className="secondary-button">
            <Network className="h-4 w-4" />
            Open Change Management
          </Link>
        ) : undefined}
      />

      {availableViews.length > 1 && (
        <Tabs
          items={availableViews.map((key) => ({ key, label: key === 'work-orders' ? 'Work orders' : 'Sites' }))}
          value={view}
          onChange={(key) => setView(key as WorkspaceView)}
          aria-label="Services workspace"
        />
      )}

      {view === 'work-orders' && canViewWorkOrders ? <WorkOrdersPanel /> : canViewSites ? <SitesPanel /> : null}
    </ServicesShell>
  );
}

function ServicesShell({ children }: { children: React.ReactNode }) {
  return (
    <DepartmentScope department="services" className="min-h-full space-y-6 bg-services-background p-4 text-services-on-surface sm:p-6 lg:p-8">
      {children}
    </DepartmentScope>
  );
}

function WorkOrdersPanel() {
  // Automated RFC packs are intentionally addressed to teams first. Opening
  // Services on the personal filter would make every unclaimed Work Order
  // invisible to the people expected to claim it.
  const [scope, setScope] = useState<ServiceWorkOrderScope>('scope');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ChangeTaskStatus | 'all'>('all');
  const [kpi, setKpi] = useState<KpiKey | null>(null);
  const query = useQuery({
    queryKey: ['services', 'work-orders', scope],
    queryFn: () => listServiceWorkOrders(scope),
  });
  const workOrders = useMemo(() => query.data ?? [], [query.data]);
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = workOrders.filter(({ task, change }) => {
    if (status !== 'all' && task.status !== status) return false;
    if (kpi === 'attention' && !(task.status === 'blocked' || workOrderAttention(task) === 'overdue')) return false;
    if (kpi === 'ready' && task.status !== 'ready') return false;
    if (kpi === 'in-progress' && task.status !== 'in_progress') return false;
    if (kpi === 'waiting' && task.status !== 'pending') return false;
    if (!normalizedSearch) return true;
    return [task.humanId, task.title, task.description, change.humanId, change.title, task.organization?.teamName]
      .some((value) => value?.toLowerCase().includes(normalizedSearch));
  });

  const kpis: Array<{ key: KpiKey; label: string; icon: typeof AlertTriangle; count: number }> = [
    { key: 'attention', label: 'Needs attention', icon: AlertTriangle, count: workOrders.filter(({ task }) => task.status === 'blocked' || workOrderAttention(task) === 'overdue').length },
    { key: 'ready', label: 'Ready to start', icon: CheckCircle2, count: workOrders.filter(({ task }) => task.status === 'ready').length },
    { key: 'in-progress', label: 'In progress', icon: CirclePlay, count: workOrders.filter(({ task }) => task.status === 'in_progress').length },
    { key: 'waiting', label: 'Waiting', icon: Clock3, count: workOrders.filter(({ task }) => task.status === 'pending').length },
  ];

  return (
    <section id="panel-work-orders" role="tabpanel" aria-labelledby="tab-work-orders" className="space-y-5">
      <div className="rounded-2xl border border-services-border bg-services-surface-container-low p-4">
        <div className="flex items-start gap-3">
          <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-services-accent" />
          <div>
            <h2 className="font-bold">Service work orders are RFC tasks</h2>
            <p className="mt-1 text-xs leading-5 text-services-on-surface-variant">
              Create and approve the RFC in Change Management, then direct its implementation task to Services. This workspace executes that task and records its evidence without duplicating the change record.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          const active = kpi === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              data-testid={`services-kpi-${item.key}`}
              onClick={() => setKpi(active ? null : item.key)}
              className={`min-h-24 min-w-44 rounded-2xl border p-4 text-left transition ${active ? 'border-services-accent bg-services-accent/10' : 'border-services-border bg-services-surface-container-low hover:bg-services-surface-container'}`}
            >
              <div className="flex items-center justify-between gap-3"><Icon className="h-5 w-5 text-services-accent" /><span className="text-2xl font-black">{query.isLoading ? '—' : item.count}</span></div>
              <div className="mt-2 text-xs font-bold text-services-on-surface-variant">{item.label}</div>
            </button>
          );
        })}
      </div>

      <Tabs items={SCOPE_TABS} value={scope} onChange={(key) => setScope(key as ServiceWorkOrderScope)} aria-label="Work order scope" />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <SearchInput aria-label="Search work orders" placeholder="Search by work order, RFC, title, or team" value={search} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch('')} />
        <Select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as ChangeTaskStatus | 'all')} options={STATUS_OPTIONS} />
      </div>

      {query.isLoading ? <LoadingState label="Loading service work orders…" /> : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : workOrders.length === 0 ? (
        <EmptyState icon="inbox" title="No service work orders in this scope" description="Tasks appear here when an RFC implementation task is directed to the Services department." />
      ) : filtered.length === 0 ? (
        <EmptyState icon="search" title="No work orders match these filters" description="Clear the search, status, or KPI filter to see more work." action={<Button variant="secondary" onClick={() => { setSearch(''); setStatus('all'); setKpi(null); }}>Clear filters</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{filtered.map((item) => <WorkOrderCard key={item.task.id} item={item} />)}</div>
      )}
    </section>
  );
}

function SitesPanel() {
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['services', 'sites', search],
    queryFn: () => listServiceSites(search),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(draftSearch.trim());
  }

  return (
    <section id="panel-sites" role="tabpanel" aria-labelledby="tab-sites" className="space-y-5">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <SearchInput className="flex-1" aria-label="Search service sites" placeholder="Search sites by name or code" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} onClear={() => { setDraftSearch(''); setSearch(''); }} />
        <Button type="submit" variant="secondary" leadingIcon={<MapPin className="h-4 w-4" />}>Search sites</Button>
      </form>

      {query.data?.stale && <StaleDataState description="The CMDB projection is stale. Site or equipment changes from Inventory may not be visible yet." onRefresh={() => void query.refetch()} />}
      {query.isLoading ? <LoadingState label="Loading service sites…" /> : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data?.items.length === 0 ? (
        <EmptyState icon={search ? 'search' : 'inbox'} title={search ? 'No sites match this search' : 'No sites are available'} description="Services uses the site projection synchronized from Inventory." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data?.items.map((site) => (
            <Link key={site.id} to={`/app/services/sites/${encodeURIComponent(site.id)}`} data-testid={`service-site-${site.id}`} className="rounded-2xl border border-services-border bg-services-surface-container-low p-4 transition hover:border-services-accent/50 hover:bg-services-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-services-accent">
              <div className="flex items-start justify-between gap-3"><div className="rounded-xl bg-services-accent/10 p-2 text-services-accent"><Building2 className="h-5 w-5" /></div><Badge tone={site.lifecycle === 'active' ? 'success' : 'neutral'} size="sm">{site.lifecycle}</Badge></div>
              <h3 className="mt-3 font-bold">{site.displayName}</h3>
              <div className="mt-1 font-mono text-[10px] text-services-on-surface-variant">{site.externalKey || site.externalId}</div>
              <div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-services-on-surface-variant"><span className="flex items-center gap-1"><Server className="h-3.5 w-3.5" />Inventory-backed</span><span title={formatDateTime(site.lastSyncedAt)}>Synced {formatDateTime(site.lastSyncedAt)}</span></div>
            </Link>
          ))}
        </div>
      )}
      <div className="flex justify-end"><Button variant="ghost" leadingIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void query.refetch()}>Refresh</Button></div>
    </section>
  );
}
