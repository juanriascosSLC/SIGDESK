import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Ticket as TicketIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTickets } from '../tickets/hooks';
import type { BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { formatDate } from '@/i18n/format';

/**
 * "My Tickets" for the end-user portal — GET /entities/INC?createdBy=me.
 * The backend resolves "me" from the authenticated session itself
 * (entidades_controller.go); this screen never passes a user id of its
 * own, and there is no client-side re-filtering of the result (see the
 * comment on `applyClientFilters` in features/tickets/api.ts) — what the
 * server returns is exactly "tickets I submitted", already scoped and
 * already paginated correctly.
 *
 * This is deliberately read-only from a requester's point of view: no
 * assign/merge/status-transition controls, which belong to the agent
 * workspace. Opening a ticket goes to /portal/tickets/:id, which renders
 * TicketDetail under the "requester" audience — same component as the
 * agent workspace, but with internal notes and admin actions withheld by
 * the backend itself (ConsultarTicketUseCase / ListComments'
 * includeInternal), not hidden only in this UI.
 */

const STATUS_TONES: Record<string, BadgeTone> = {
  Open: 'info',
  'In Progress': 'warning',
  'Pending Review': 'warning',
  Resolved: 'success',
  Closed: 'neutral',
};

const PRIORITY_TONES: Record<string, BadgeTone> = {
  Low: 'neutral',
  Medium: 'info',
  High: 'warning',
  Critical: 'danger',
};

export default function MyTickets() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const cursor = cursorStack[cursorStack.length - 1];
  const { data, isLoading, isError, error, refetch, isFetching } = useTickets({
    createdByMe: true,
    q: search || undefined,
    cursor,
    limit: 20,
  });

  function resetPage() {
    setCursorStack([]);
  }

  // `Ticket.site` is currently never populated by the mapper
  // (toTicketFromEntityRecord in features/tickets/api.ts always sets it to
  // `undefined`) — shown "if available" means literally that: the column
  // only appears once at least one row actually has a value, instead of
  // rendering a header that can never show real data.
  const showSiteColumn = Boolean(data?.items.some((ticket) => ticket.site));

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <PageHeader
        eyebrow={
          <div className="mb-1 flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        }
        title="My Tickets"
        description="Track the status of every request you've raised."
        actions={
          <Button onClick={() => navigate('/portal/catalog')}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Create request
          </Button>
        }
      />

      <SearchInput
        aria-label="Search my tickets"
        placeholder="Search by title, description or ID…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); resetPage(); }}
        onClear={() => { setSearch(''); resetPage(); }}
        className="max-w-md"
      />

      <Card noPadding className="overflow-hidden">
        {isLoading ? (
          <LoadingState label="Loading your tickets…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !data || data.items.length === 0 ? (
          search ? (
            <EmptyState
              icon="search"
              title="No tickets match this search"
              description="Try a different title, description or ID."
            />
          ) : (
            <EmptyState
              icon="inbox"
              title="You haven't submitted any tickets yet"
              description="Requests you raise from the service catalog will show up here."
              action={<Button onClick={() => navigate('/portal/catalog')}>Create request</Button>}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/40 bg-surface-container/50 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Title</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Priority</th>
                  {showSiteColumn && <th className="px-6 py-3">Site</th>}
                  <th className="px-6 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {data.items.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/portal/tickets/${ticket.id}`)}
                    className="cursor-pointer transition-colors hover:bg-surface-container/50"
                  >
                    <td className="px-6 py-3 font-mono text-primary">{ticket.humanId || ticket.id}</td>
                    <td className="px-6 py-3 font-medium text-on-surface">{ticket.title}</td>
                    <td className="px-6 py-3">
                      <StatusBadge label={ticket.status} tone={STATUS_TONES[ticket.status] ?? 'neutral'} />
                    </td>
                    <td className="px-6 py-3">
                      <Badge tone={PRIORITY_TONES[ticket.priority] ?? 'neutral'}>{ticket.priority}</Badge>
                    </td>
                    {showSiteColumn && <td className="px-6 py-3 text-on-surface-variant">{ticket.site || '—'}</td>}
                    <td className="px-6 py-3 text-on-surface-variant">{formatDate(ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && data.items.length > 0 && (
        <div className="flex items-center justify-between text-sm text-on-surface-variant">
          <span>
            {data.items.length} ticket{data.items.length === 1 ? '' : 's'}
            {data.hasMore ? ' · more available' : ''}
            {isFetching ? ' · refreshing…' : ''}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={cursorStack.length === 0}
              onClick={() => setCursorStack((prev) => prev.slice(0, -1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!data.hasMore}
              onClick={() => setCursorStack((prev) => [...prev, data.nextCursor])}
            >
              Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
