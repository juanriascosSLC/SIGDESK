import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Sun, type LucideIcon } from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { listSrvTickets } from './api';
import { SRV_STATUS_LABELS, SRV_STATUS_TONES } from './presentation';
import type { SrvStatus, SrvTicket } from './types';

type KpiKey = 'requires-action' | 'ready' | 'waiting' | 'today';
type Scope = 'mine' | 'team' | 'all';

const KPI_TILES: Array<{ key: KpiKey; label: string; icon: LucideIcon; statuses: SrvStatus[] }> = [
  { key: 'requires-action', label: 'Requires Action', icon: AlertTriangle, statuses: ['requires_action'] },
  { key: 'ready', label: 'Ready', icon: CheckCircle2, statuses: ['ready', 'equipment_delivered'] },
  { key: 'waiting', label: 'Waiting', icon: Clock, statuses: ['waiting', 'awaiting_info'] },
  { key: 'today', label: 'Today', icon: Sun, statuses: ['today', 'service_completed'] },
];

const SCOPE_TABS: Array<{ key: Scope; label: string }> = [
  { key: 'mine', label: 'My Work' },
  { key: 'team', label: 'Team' },
  { key: 'all', label: 'All' },
];

function ticketVisibleInScope(ticket: SrvTicket, scope: Scope): boolean {
  if (scope === 'all') return true;
  if (scope === 'team') return ticket.assignedScope === 'mine' || ticket.assignedScope === 'team';
  return ticket.assignedScope === 'mine';
}

export default function ServicesDashboard() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('mine');
  const [kpiFilter, setKpiFilter] = useState<KpiKey | null>(null);
  const query = useQuery({ queryKey: ['services', 'srv-tickets'], queryFn: listSrvTickets });
  const tickets = useMemo(() => query.data ?? [], [query.data]);

  const scoped = useMemo(
    () => tickets.filter((ticket) => ticketVisibleInScope(ticket, scope)),
    [tickets, scope],
  );
  const visible = useMemo(() => {
    if (!kpiFilter) return scoped;
    const tile = KPI_TILES.find((t) => t.key === kpiFilter)!;
    return scoped.filter((ticket) => tile.statuses.includes(ticket.status));
  }, [scoped, kpiFilter]);

  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full space-y-6 p-6 lg:p-8"
    >
      <PageHeader title="Services" description="Dispatch, equipment and recurring problems by dealership." />

      {/* 4 KPI tiles are deliberately kept (Design Review Pass 4, Decision
          2) — they're actionable filters, not decoration, straight from
          the reference mockup. Mobile collapses to a 2-visible horizontal
          scroll (Design Review Pass 6) via `overflow-x-auto` + `grid-cols-2`. */}
      <div className="grid grid-cols-2 gap-3 overflow-x-auto sm:grid-cols-4 sm:gap-4">
        {KPI_TILES.map((tile) => {
          const Icon = tile.icon;
          const count = query.isError
            ? null
            : scoped.filter((ticket) => tile.statuses.includes(ticket.status)).length;
          const active = kpiFilter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              data-testid={`services-kpi-${tile.key}`}
              onClick={() => setKpiFilter(active ? null : tile.key)}
              className={`min-h-[44px] rounded-2xl border p-4 text-left transition-colors ${
                active
                  ? 'border-services-accent bg-services-accent/10'
                  : 'border-services-border bg-services-surface-container hover:bg-services-surface-container-low'
              }`}
            >
              <Icon className="h-5 w-5 text-services-accent" aria-hidden="true" />
              <div className="mt-2 text-2xl font-black">
                {query.isLoading ? (
                  <span className="inline-block h-6 w-8 animate-pulse rounded bg-services-surface-container-low" />
                ) : count === null ? (
                  <span title="No se pudo cargar este conteo">—</span>
                ) : (
                  count
                )}
              </div>
              <div className="text-xs font-semibold text-services-on-surface-variant">{tile.label}</div>
            </button>
          );
        })}
      </div>

      <Tabs
        items={SCOPE_TABS}
        value={scope}
        onChange={(key) => setScope(key as Scope)}
        aria-label="Ticket scope"
      />

      {query.isLoading ? (
        <LoadingState label="Loading Services tickets…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState icon="inbox" title="No tickets in this view" description="Try a different scope or clear the KPI filter." />
      ) : (
        <ul className="space-y-2">
          {visible.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                data-testid={`services-ticket-row-${ticket.id}`}
                onClick={() => navigate(`/app/services/tickets/${ticket.id}`)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-services-border bg-services-surface-container px-4 py-3 text-left hover:bg-services-surface-container-low"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-bold text-services-accent">{ticket.humanId}</div>
                  <div className="truncate text-sm font-semibold">{ticket.title}</div>
                </div>
                <StatusBadge label={SRV_STATUS_LABELS[ticket.status]} tone={SRV_STATUS_TONES[ticket.status]} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </DepartmentScope>
  );
}
