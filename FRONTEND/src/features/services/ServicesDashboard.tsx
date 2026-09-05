import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
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

/** One panel's ticket list — Loading/Error/Empty/Success, shared by all
 *  three scope tabs so each keeps its own content (see the "hidden, not
 *  unmounted" note below on why all three exist in the DOM at once). */
function ScopeTicketList({
  query,
  tickets,
  onOpenTicket,
}: {
  query: UseQueryResult<SrvTicket[]>;
  tickets: SrvTicket[];
  onOpenTicket: (id: string) => void;
}) {
  if (query.isLoading) return <LoadingState label="Loading Services tickets…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (tickets.length === 0) {
    return <EmptyState icon="inbox" title="No tickets in this view" description="Try a different scope or clear the KPI filter." />;
  }
  return (
    <ul className="space-y-2">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <button
            type="button"
            data-testid={`services-ticket-row-${ticket.id}`}
            onClick={() => onOpenTicket(ticket.id)}
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
  );
}

export default function ServicesDashboard() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('mine');
  const [kpiFilter, setKpiFilter] = useState<KpiKey | null>(null);
  const query = useQuery({ queryKey: ['services', 'srv-tickets'], queryFn: listSrvTickets });
  const tickets = useMemo(() => query.data ?? [], [query.data]);

  function applyKpiFilter(list: SrvTicket[]): SrvTicket[] {
    if (!kpiFilter) return list;
    const tile = KPI_TILES.find((t) => t.key === kpiFilter)!;
    return list.filter((ticket) => tile.statuses.includes(ticket.status));
  }

  // Computed once per scope tab (the mock dataset is a handful of rows, so
  // there's no cost to keeping all three current) — each tab's own panel
  // stays mounted (see the aria note below), so each needs its own list.
  const byScope: Record<Scope, SrvTicket[]> = {
    mine: tickets.filter((ticket) => ticketVisibleInScope(ticket, 'mine')),
    team: tickets.filter((ticket) => ticketVisibleInScope(ticket, 'team')),
    all: tickets,
  };
  const scoped = byScope[scope];

  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full space-y-6 p-6 lg:p-8"
    >
      <PageHeader title="Services" description="Dispatch, equipment and recurring problems by dealership." />

      {/* 4 KPI tiles are deliberately kept (Design Review Pass 4, Decision
          2) — they're actionable filters, not decoration, straight from
          the reference mockup. Below `sm`, this is a real horizontal
          scroller (flex + overflow-x-auto + a shrink-0 width per tile) —
          `grid-cols-2` alone (the first pass) just wrapped into a static
          2×2 grid with nothing to scroll (Codex structured review finding). */}
      <div className="flex gap-3 overflow-x-auto sm:grid sm:grid-cols-4 sm:gap-4">
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
              aria-pressed={active}
              data-testid={`services-kpi-${tile.key}`}
              onClick={() => setKpiFilter(active ? null : tile.key)}
              className={`min-h-[44px] w-[45%] shrink-0 rounded-2xl border p-4 text-left transition-colors sm:w-auto ${
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

      {/* All three scope panels exist in the DOM (empty when inactive)
          rather than only the active one — Tabs.tsx wires
          aria-controls={`panel-${key}`} on EVERY tab, including the two
          currently inactive ones, so each needs a real element to reference
          or their ARIA relationship is broken even while a screen reader
          user is on a different tab (Codex structured review finding — the
          single-panel version only fixed the active tab's own reference).
          Only the active panel renders real ticket rows — an inactive one
          rendering the same data-testids as the active one would make every
          "services-ticket-row-*" locator in this test suite ambiguous. */}
      {SCOPE_TABS.map((tab) => (
        <div
          key={tab.key}
          id={`panel-${tab.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.key}`}
          hidden={scope !== tab.key}
        >
          {scope === tab.key && (
            <ScopeTicketList
              query={query}
              tickets={applyKpiFilter(byScope[tab.key])}
              onOpenTicket={(id) => navigate(`/app/services/tickets/${id}`)}
            />
          )}
        </div>
      ))}
    </DepartmentScope>
  );
}
