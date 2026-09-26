import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, GitPullRequest, History, MapPin, SearchCode, Server, Ticket } from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { Badge, Card, CardHeader, CardTitle, EmptyState, ErrorState, LoadingState, PageHeader, SearchInput, StaleDataState } from '@/components/ui';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { formatDateTime } from '@/i18n/format';
import { formatOperationalIssue } from '@/features/assets/operational-history-presentation';
import { getServiceSite, getServiceSiteHistory, listServiceSiteAssets, listServiceWorkOrders } from './api';
import { workOrderSiteId } from './presentation';
import { WorkOrderCard } from './WorkOrderCard';

export default function ServiceSiteDetail() {
  const { siteId } = useParams<{ siteId: string }>();
  const { can } = useAuth();
  const [assetSearch, setAssetSearch] = useState('');
  const siteQuery = useQuery({ queryKey: ['services', 'site', siteId], queryFn: () => getServiceSite(siteId!), enabled: Boolean(siteId) });
  const assetsQuery = useQuery({ queryKey: ['services', 'site', siteId, 'assets'], queryFn: () => listServiceSiteAssets(siteId!), enabled: Boolean(siteId) });
  const historyQuery = useQuery({ queryKey: ['services', 'site', siteId, 'history'], queryFn: () => getServiceSiteHistory(siteId!), enabled: Boolean(siteId) });
  const workOrdersQuery = useQuery({ queryKey: ['services', 'work-orders', 'scope'], queryFn: () => listServiceWorkOrders('scope'), enabled: can(PERMISSIONS.changeTasksView) });

  const assets = useMemo(() => {
    const normalized = assetSearch.trim().toLowerCase();
    const items = assetsQuery.data?.items ?? [];
    return normalized ? items.filter((asset) => [asset.displayName, asset.assetType, asset.serial, asset.model, asset.ipAddress].some((value) => value?.toLowerCase().includes(normalized))) : items;
  }, [assetSearch, assetsQuery.data]);
  const workOrders = (workOrdersQuery.data ?? []).filter(({ task }) => workOrderSiteId(task) === siteId);

  if (siteQuery.isLoading) return <Shell><LoadingState label="Loading service site…" /></Shell>;
  if (siteQuery.isError || !siteQuery.data) return <Shell><ErrorState error={siteQuery.error} onRetry={() => void siteQuery.refetch()} /></Shell>;
  const site = siteQuery.data;

  return (
    <Shell>
      <PageHeader
        eyebrow={<Link to="/app/services" className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-services-accent hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to Services</Link>}
        title={site.displayName}
        description={`Service site · ${site.externalKey || site.externalId}`}
        actions={<Badge tone={site.lifecycle === 'active' ? 'success' : 'neutral'}>{site.lifecycle}</Badge>}
      />
      {(assetsQuery.data?.stale || site.lifecycle === 'unavailable') && <StaleDataState description="Inventory synchronization is stale or unavailable. Equipment shown here may not be current." onRefresh={() => { void siteQuery.refetch(); void assetsQuery.refetch(); }} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Installed equipment</CardTitle><p className="mt-1 text-sm text-services-on-surface-variant">Live CMDB projection for this site.</p></div><Badge tone="neutral">{assetsQuery.data?.items.length ?? 0} assets</Badge></CardHeader>
            <SearchInput aria-label="Search installed equipment" placeholder="Search by name, type, serial, model, or IP" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} onClear={() => setAssetSearch('')} />
            <div className="mt-4">
              {assetsQuery.isLoading ? <LoadingState compact label="Loading installed equipment…" /> : assetsQuery.isError ? <ErrorState compact error={assetsQuery.error} onRetry={() => void assetsQuery.refetch()} /> : assets.length === 0 ? <EmptyState compact icon={assetSearch ? 'search' : 'inbox'} title={assetSearch ? 'No equipment matches this search' : 'No equipment is projected for this site'} description={assetSearch ? 'Clear the search to see all equipment.' : 'Check Inventory synchronization and the device-to-site mapping.'} /> : (
                <div className="grid gap-3 sm:grid-cols-2">{assets.map((asset) => <article key={asset.id} className="rounded-xl border border-services-border bg-services-surface-container p-3"><div className="flex items-start justify-between gap-2"><Server className="h-4 w-4 shrink-0 text-services-accent" /><Badge tone={asset.lifecycle === 'active' ? 'success' : asset.lifecycle === 'unavailable' ? 'warning' : 'neutral'} size="sm">{asset.lifecycle}</Badge></div><h3 className="mt-2 truncate text-sm font-bold">{asset.displayName}</h3><div className="mt-1 text-xs text-services-on-surface-variant">{asset.assetType}{asset.model ? ` · ${asset.model}` : ''}</div>{asset.serial && <div className="mt-2 font-mono text-[10px] text-services-on-surface-variant">S/N {asset.serial}</div>}{asset.ipAddress && <div className="mt-1 font-mono text-[10px] text-services-on-surface-variant">{asset.ipAddress}</div>}</article>)}</div>
              )}
            </div>
          </Card>

          {can(PERMISSIONS.changeTasksView) && <Card><CardHeader><div><CardTitle>Service work orders at this site</CardTitle><p className="mt-1 text-sm text-services-on-surface-variant">RFC tasks whose immutable asset context points to this site.</p></div></CardHeader>{workOrdersQuery.isLoading ? <LoadingState compact label="Loading work orders…" /> : workOrdersQuery.isError ? <ErrorState compact error={workOrdersQuery.error} onRetry={() => void workOrdersQuery.refetch()} /> : workOrders.length === 0 ? <EmptyState compact icon="inbox" title="No service work orders for this site" /> : <div className="grid gap-3 xl:grid-cols-2">{workOrders.map((item) => <WorkOrderCard key={item.task.id} item={item} />)}</div>}</Card>}
        </div>

        <aside className="space-y-5">
          <Card><CardHeader><CardTitle>Site context</CardTitle></CardHeader><dl className="space-y-3 text-sm"><Info label="Source" value={site.sourceSystem} /><Info label="Type" value={site.assetType || site.kind} /><Info label="Last synchronized" value={formatDateTime(site.lastSyncedAt)} />{scalarAttribute(site.attributes.address) && <Info label="Address" value={scalarAttribute(site.attributes.address)!} />}{scalarAttribute(site.attributes.city) && <Info label="City" value={scalarAttribute(site.attributes.city)!} />}</dl></Card>
          <Card><CardHeader><div><CardTitle>Operational history</CardTitle><p className="mt-1 text-sm text-services-on-surface-variant">INC, PRB, and RFC records related to this site.</p></div><History className="h-5 w-5 text-services-accent" /></CardHeader>{historyQuery.isLoading ? <LoadingState compact label="Loading history…" /> : historyQuery.isError ? <ErrorState compact error={historyQuery.error} onRetry={() => void historyQuery.refetch()} /> : historyQuery.data ? <OperationalHistory history={historyQuery.data} /> : null}</Card>
        </aside>
      </div>
    </Shell>
  );
}

function OperationalHistory({ history }: { history: Awaited<ReturnType<typeof getServiceSiteHistory>> }) {
  const sections = [
    {
      key: 'inc',
      label: 'Incidents',
      icon: Ticket,
      completeness: history.incidents.completeness,
      issues: history.incidents.issues,
      items: history.incidents.items.map((record) => ({ id: record.id, href: `/app/tickets/${record.id}`, title: `${record.humanId ?? record.id} · ${record.title}` })),
    },
    {
      key: 'prb',
      label: 'Problems',
      icon: SearchCode,
      completeness: history.problems.completeness,
      issues: history.problems.issues,
      items: history.problems.items.map((record) => ({ id: record.id, href: `/app/problems/${record.humanId}`, title: `${record.humanId} · ${String(record.data.title ?? 'Problem')}` })),
    },
    {
      key: 'rfc',
      label: 'Changes',
      icon: GitPullRequest,
      completeness: history.changes.completeness,
      issues: history.changes.issues,
      items: history.changes.items.map((record) => ({ id: record.id, href: `/app/changes/${record.humanId}`, title: `${record.humanId} · ${String(record.data.title ?? 'Change')}` })),
    },
  ];
  return <div className="space-y-4">{sections.map(({ key, label, icon: Icon, completeness, issues, items }) => <section key={key}><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 text-xs font-bold"><Icon className="h-3.5 w-3.5 text-services-accent" />{label}</h3><div className="flex items-center gap-1"><Badge tone="neutral" size="sm">{items.length}</Badge>{completeness === 'partial' && <Badge tone="warning" size="sm">Partial</Badge>}</div></div>{issues.length > 0 && <p className="mt-2 text-[11px] text-status-warning-fg">{issues.map(formatOperationalIssue).join(' ')}</p>}<div className="mt-2 space-y-1">{items.slice(0, 5).map((record) => <Link key={record.id} to={record.href} className="block truncate rounded-lg bg-services-surface-container px-2.5 py-2 text-xs font-semibold hover:bg-services-accent/10">{record.title}</Link>)}{items.length === 0 && completeness === 'complete' && <p className="text-xs text-services-on-surface-variant">No related records.</p>}</div></section>)}</div>;
}

function scalarAttribute(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-services-on-surface-variant">{label}</dt><dd className="mt-1 flex items-center gap-1.5 font-bold">{label === 'Address' ? <MapPin className="h-3.5 w-3.5" /> : label === 'Source' ? <Building2 className="h-3.5 w-3.5" /> : null}{value}</dd></div>; }
function Shell({ children }: { children: React.ReactNode }) { return <DepartmentScope department="services" className="min-h-full space-y-6 bg-services-background p-4 text-services-on-surface sm:p-6 lg:p-8">{children}</DepartmentScope>; }
