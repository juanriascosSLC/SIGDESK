import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PackageCheck, ShoppingCart } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/i18n/format';
import { listServiceRequests, type ServiceRequestStatus } from './api';

const labels: Record<ServiceRequestStatus, string> = {
  pending_manager_approval: 'Pending manager approval', approved: 'Approved', ordered: 'Ordered',
  shipped: 'Shipped', delivered: 'Delivered', rejected: 'Rejected', canceled: 'Canceled',
};

export default function ServiceRequests() {
  const query = useInfiniteQuery({
    queryKey: ['service-requests'],
    queryFn: ({ pageParam }) => listServiceRequests(undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <PageHeader title="Purchasing" description="Governed purchase requests created by Services when an approved field-service cycle requires parts." />
    {query.isLoading ? <LoadingState label="Loading purchase requests…" /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : items.length === 0 ? <EmptyState icon="inbox" title="No purchase requests" description="A request appears here only after Inventory records that parts are required." /> : <>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Link key={item.id} to={`/app/purchasing/${item.id}`} className="rounded-2xl border border-border/50 bg-surface-container p-5 transition hover:border-primary/50 hover:bg-surface-container-high"><div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><ShoppingCart className="h-5 w-5" /></span><span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-black uppercase text-on-surface-variant">{labels[item.status]}</span></div><p className="mt-4 font-mono text-xs font-bold text-primary">{item.humanId}</p><h2 className="mt-1 font-bold text-on-surface">{item.title}</h2><p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{item.description}</p><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-on-surface-variant">Incident</dt><dd className="font-bold">{item.incidentHumanId}</dd></div><div><dt className="text-on-surface-variant">RFC</dt><dd className="font-bold">{item.changeHumanId}</dd></div><div className="col-span-2"><dt className="text-on-surface-variant">Requested for</dt><dd className="font-bold">{item.requesterName || 'User unavailable'}</dd></div></dl><p className="mt-4 flex items-center gap-1.5 text-xs text-on-surface-variant"><PackageCheck className="h-3.5 w-3.5" />{item.lines.length} line{item.lines.length === 1 ? '' : 's'} · Updated {formatDateTime(item.updatedAt, 'en-US')}</p></Link>)}</div>
      {query.hasNextPage ? <div className="mt-6 flex justify-center"><Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more</Button></div> : null}
    </>}
  </div>;
}
