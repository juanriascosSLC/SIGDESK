import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PackageCheck, Search, ShoppingCart } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/i18n/format';
import { listServiceRequests, type ServiceRequestStatus } from './api';

const labels: Record<ServiceRequestStatus, string> = {
  pending_manager_approval: 'Pending manager approval',
  approved: 'Approved',
  ordered: 'Ordered',
  shipped: 'Shipped',
  delivered: 'Delivered',
  rejected: 'Rejected',
  canceled: 'Canceled',
};

export default function ServiceRequests() {
  const [status, setStatus] = useState<ServiceRequestStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['service-requests', status],
    queryFn: ({ pageParam }) => listServiceRequests(status === 'all' ? undefined : status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((item) => [item.humanId, item.title, item.incidentHumanId, item.changeHumanId, item.requesterName]
      .some((value) => value?.toLocaleLowerCase().includes(term)));
  }, [items, search]);
  const waiting = items.filter((item) => item.status === 'pending_manager_approval').length;
  const inFlight = items.filter((item) => ['approved', 'ordered', 'shipped'].includes(item.status)).length;
  const completed = items.filter((item) => item.status === 'delivered').length;

  return <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <PageHeader title="Purchasing" description="Governed purchase requests created by Services when an approved field-service cycle requires parts." />
    {!query.isLoading && !query.isError && <>
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary label="Awaiting approval" value={waiting} />
        <Summary label="In fulfillment" value={inFlight} />
        <Summary label="Delivered" value={completed} />
      </dl>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border/40 bg-surface-container p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input className="input-field w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search RQS, incident, RFC, requester or title…" />
        </div>
        <select className="input-field min-w-56" value={status} onChange={(event) => setStatus(event.target.value as ServiceRequestStatus | 'all')} aria-label="Purchase request status">
          <option value="all">All statuses</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </>}

    {query.isLoading ? <LoadingState label="Loading purchase requests…" />
      : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        : items.length === 0 ? <EmptyState icon="inbox" title="No purchase requests" description="A request appears here only after Inventory records that parts are required." />
          : visible.length === 0 ? <EmptyState icon="search" title="No matching purchase requests" description="Try another search term or status." />
            : <>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => <Link key={item.id} to={`/app/purchasing/${item.id}`} className="rounded-2xl border border-border/50 bg-surface-container p-5 transition hover:border-primary/50 hover:bg-surface-container-high">
                <div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><ShoppingCart className="h-5 w-5" /></span><span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-black uppercase text-on-surface-variant">{labels[item.status]}</span></div>
                <p className="mt-4 font-mono text-xs font-bold text-primary">{item.humanId}</p><h2 className="mt-1 font-bold text-on-surface">{item.title}</h2><p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{item.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-on-surface-variant">Incident</dt><dd className="font-bold">{item.incidentHumanId}</dd></div><div><dt className="text-on-surface-variant">RFC</dt><dd className="font-bold">{item.changeHumanId}</dd></div><div className="col-span-2"><dt className="text-on-surface-variant">Requested for</dt><dd className="font-bold">{item.requesterName || 'User unavailable'}</dd></div></dl>
                <p className="mt-4 flex items-center gap-1.5 text-xs text-on-surface-variant"><PackageCheck className="h-3.5 w-3.5" />{item.lines.length} line{item.lines.length === 1 ? '' : 's'} · Updated {formatDateTime(item.updatedAt, 'en-US')}</p>
              </Link>)}</div>
              {query.hasNextPage && <div className="mt-6 flex justify-center"><Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more</Button></div>}
            </>}
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-border/40 bg-surface-container px-4 py-3"><dt className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{label}</dt><dd className="mt-1 text-2xl font-black text-on-surface">{value}</dd></div>;
}
