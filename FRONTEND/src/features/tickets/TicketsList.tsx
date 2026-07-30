import { useEffect, useMemo, useState } from 'react';
import type { Ticket } from './types';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  CircleDashed,
  Timer,
  ArrowDown,
  ChevronsUpDown,
  Link2,
  Filter,
  Search,
  CircleDot,
} from 'lucide-react';
import { BulkActionBar } from './components/BulkActionBar';
import { MergeTicketsModal } from './components/MergeTicketsModal';
import { useAssignTicket, useUpdateTicketStatus, useTickets } from './hooks';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/useAuth';
import {
  listSlaAssessments,
  type SlaAssessment,
} from '@/features/sla/api';

type QuickView = 'all' | 'unassigned' | 'sla' | 'resolved';

interface SlaChip {
  label: string;
  title: string;
  icon: typeof Timer;
  className: string;
  isBreaching: boolean;
}

function formatRemaining(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m left`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${totalHours}h ${minutes}m left` : `${totalHours}h left`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`;
}

function getSlaChip(
  ticket: Ticket,
  assessment: SlaAssessment | undefined,
  now: number,
  isLoading: boolean,
  isError: boolean,
): SlaChip {
  if (!ticket.entityId) {
    return {
      label: 'No SLA',
      title: 'This ticket is not linked to a Catalog entity.',
      icon: Clock,
      className: 'bg-surface-container-high text-on-surface-variant border-border/50',
      isBreaching: false,
    };
  }
  if (isLoading && !assessment) {
    return {
      label: 'Loading',
      title: 'Loading the SLA assessment.',
      icon: Clock,
      className: 'bg-surface-container-high text-on-surface-variant border-border/50',
      isBreaching: false,
    };
  }
  if (isError && !assessment) {
    return {
      label: 'Unavailable',
      title: 'The SLA module could not provide an assessment.',
      icon: AlertCircle,
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      isBreaching: false,
    };
  }
  if (!assessment) {
    return {
      label: 'No SLA',
      title: 'The entity definition did not produce an SLA assessment.',
      icon: Clock,
      className: 'bg-surface-container-high text-on-surface-variant border-border/50',
      isBreaching: false,
    };
  }

  if (assessment.resolvedAt || ticket.status === 'Resolved') {
    if (assessment.resolutionBreached) {
      return {
        label: 'Breached',
        title: 'The resolution objective was breached.',
        icon: AlertCircle,
        className: 'bg-red-500/10 text-red-400 border-red-500/20',
        isBreaching: true,
      };
    }
    return {
      label: 'Met',
      title: 'The ticket was resolved within its SLA objective.',
      icon: CheckCircle2,
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      isBreaching: false,
    };
  }

  if (assessment.pausedAt) {
    return {
      label: 'Paused',
      title: 'SLA measurement is paused by the current lifecycle state.',
      icon: Clock,
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      isBreaching: false,
    };
  }

  const awaitingResponse = !assessment.respondedAt;
  const dueAt = Date.parse(
    awaitingResponse ? assessment.responseDueAt : assessment.resolutionDueAt,
  );
  const startedAt = Date.parse(assessment.startedAt);
  const breached =
    (awaitingResponse ? assessment.responseBreached : assessment.resolutionBreached) ||
    (Number.isFinite(dueAt) && now > dueAt);

  if (breached) {
    return {
      label: 'Breached',
      title: `${awaitingResponse ? 'Response' : 'Resolution'} objective breached.`,
      icon: AlertCircle,
      className: 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse',
      isBreaching: true,
    };
  }

  if (!Number.isFinite(dueAt) || !Number.isFinite(startedAt)) {
    return {
      label: 'Unavailable',
      title: 'The SLA assessment contains an invalid deadline.',
      icon: AlertCircle,
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      isBreaching: false,
    };
  }

  const remaining = dueAt - now;
  const totalWindow = Math.max(1, dueAt - startedAt);
  const isAtRisk = remaining / totalWindow <= 0.25;
  return {
    label: formatRemaining(remaining),
    title: `${awaitingResponse ? 'Response' : 'Resolution'} deadline: ${new Date(dueAt).toLocaleString()}.`,
    icon: Timer,
    className: isAtRisk
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-surface-container-high text-on-surface-variant border-border/50',
    isBreaching: isAtRisk,
  };
}

export default function TicketsList() {
  const navigate = useNavigate();
  const { displayName: currentUserName } = useAuth();
  const [activeView, setActiveView] = useState<QuickView>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [site, setSite] = useState('');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [slaNow, setSlaNow] = useState(() => Date.now());

  const filters = useMemo(
    () => ({
      site: site || undefined,
      assignee: assignee || undefined,
      q: search || undefined,
      cursor: cursorStack[cursorStack.length - 1],
    }),
    [site, assignee, search, cursorStack],
  );

  const {
    data: ticketPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useTickets(filters);
  const tickets = useMemo(() => ticketPage?.items ?? [], [ticketPage?.items]);
  const slaAssessments = useQuery({
    queryKey: ['sla-assessments'],
    queryFn: listSlaAssessments,
    enabled: tickets.some((ticket) => Boolean(ticket.entityId)),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const assessmentsByEntityID = useMemo(
    () => new Map(
      (slaAssessments.data ?? []).map((assessment) => [assessment.entityId, assessment]),
    ),
    [slaAssessments.data],
  );
  const slaByTicketID = useMemo(
    () => new Map(
      tickets.map((ticket) => [
        ticket.id,
        getSlaChip(
          ticket,
          ticket.entityId ? assessmentsByEntityID.get(ticket.entityId) : undefined,
          slaNow,
          slaAssessments.isLoading,
          slaAssessments.isError,
        ),
      ]),
    ),
    [
      assessmentsByEntityID,
      slaAssessments.isError,
      slaAssessments.isLoading,
      slaNow,
      tickets,
    ],
  );
  const assignTicket = useAssignTicket();
  const updateStatus = useUpdateTicketStatus();

  useEffect(() => {
    const interval = window.setInterval(() => setSlaNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const siteOptions = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.site).filter(Boolean) as string[])).sort(),
    [tickets],
  );
  const assigneeOptions = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.assignee).filter(Boolean) as string[])).sort(),
    [tickets],
  );

  function goToNextPage() {
    if (ticketPage?.nextCursor) {
      setCursorStack((prev) => [...prev, ticketPage.nextCursor]);
    }
  }
  function goToPrevPage() {
    setCursorStack((prev) => prev.slice(0, -1));
  }
  function resetPage() {
    setCursorStack([]);
  }

  async function handleBulkAssign() {
    const name = window.prompt('Assign selected tickets to:', currentUserName);
    if (!name) return;
    await Promise.all(
      Array.from(selected).map((id) =>
        assignTicket.mutateAsync({ id, assigneeName: name, actorName: currentUserName }),
      ),
    );
    setSelected(new Set());
  }

  async function handleBulkResolve() {
    await Promise.all(
      Array.from(selected).map((id) =>
        updateStatus.mutateAsync({ id, status: 'Resolved', actorName: currentUserName }),
      ),
    );
    setSelected(new Set());
  }

  if (isLoading) {
    return <LoadingSkeleton type="list" />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Could not load tickets"
        description={error.message}
        action={
          <button
            onClick={() => void refetch()}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold"
          >
            Try again
          </button>
        }
      />
    );
  }

  const views: { id: QuickView; label: string; count: number; accent?: string }[] = [
    { id: 'all', label: 'All Tickets', count: tickets.length },
    { id: 'unassigned', label: 'Unassigned', count: tickets.filter(t => !t.assignee).length },
    { id: 'sla', label: 'Breaching SLA', count: tickets.filter(t => slaByTicketID.get(t.id)?.isBreaching).length, accent: 'red' },
    { id: 'resolved', label: 'Resolved', count: tickets.filter(t => t.status === 'Resolved').length },
  ];

  const visibleTickets = tickets.filter(t => {
    switch (activeView) {
      case 'unassigned': return !t.assignee;
      case 'sla': return slaByTicketID.get(t.id)?.isBreaching;
      case 'resolved': return t.status === 'Resolved';
      default: return true;
    }
  });

  const allSelected = visibleTickets.length > 0 && visibleTickets.every(t => selected.has(t.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(visibleTickets.map(t => t.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // States come from the published catalog Definition, so anything without
  // an explicit design still gets a neutral icon rather than nothing.
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Open': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'In Progress': return <CircleDashed className="w-4 h-4 text-cyan-400" />;
      case 'Pending Review': return <Clock className="w-4 h-4 text-amber-400" />;
      case 'Resolved': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      default: return <CircleDot className="w-4 h-4 text-on-surface-variant" />;
    }
  };

  return (
    <div data-testid="tickets-list" className="flex flex-col flex-1 min-h-0 relative">
      <MergeTicketsModal 
        isOpen={isMergeModalOpen} 
        onClose={() => { setIsMergeModalOpen(false); setSelected(new Set()); }} 
        selectedTickets={Array.from(selected)} 
      />
      <BulkActionBar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        onAssign={() => void handleBulkAssign()}
        onMerge={() => setIsMergeModalOpen(true)}
        onResolve={() => void handleBulkResolve()}
      />
      {/* Filters Bar */}
      <div className="flex flex-wrap gap-3 items-center mb-4 bg-surface-container-low/90 backdrop-blur-md border border-border/40 p-3.5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant shrink-0 px-1">
          <Filter className="w-4 h-4 text-primary" />
          Filtros
        </div>
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/70 pointer-events-none" />
          <input
            data-testid="ticket-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Buscar por título, descripción o ID…"
            className="w-full bg-surface-container/80 border border-border/50 text-sm rounded-xl pl-9 pr-3.5 py-2 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
          />
        </div>
        <select
          value={site}
          onChange={(e) => { setSite(e.target.value); resetPage(); }}
          className="bg-surface-container/80 border border-border/50 text-sm rounded-xl px-3.5 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all cursor-pointer"
          style={{ colorScheme: 'dark' }}
        >
          <option value="" className="bg-[#191c22] text-[#e1e2eb]">Todos los Sitios</option>
          {siteOptions.map((s) => <option key={s} value={s} className="bg-[#191c22] text-[#e1e2eb]">{s}</option>)}
        </select>
        <select
          value={assignee}
          onChange={(e) => { setAssignee(e.target.value); resetPage(); }}
          className="bg-surface-container/80 border border-border/50 text-sm rounded-xl px-3.5 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all cursor-pointer"
          style={{ colorScheme: 'dark' }}
        >
          <option value="" className="bg-[#191c22] text-[#e1e2eb]">Todos los Asignados</option>
          {assigneeOptions.map((a) => <option key={a} value={a} className="bg-[#191c22] text-[#e1e2eb]">{a}</option>)}
        </select>
        {(site || assignee || search) && (
          <button
            onClick={() => { setSite(''); setAssignee(''); setSearch(''); resetPage(); }}
            className="bg-surface-container border border-border/60 text-xs font-semibold rounded-xl px-3.5 py-2 text-on-surface-variant hover:text-on-surface hover:border-border hover:bg-surface-container-high transition-all"
          >
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* Quick views */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {views.map(v => {
          const isActive = activeView === v.id;
          const isRed = v.accent === 'red';
          return (
            <button
              key={v.id}
              data-testid={`quick-view-${v.id}`}
              onClick={() => { setActiveView(v.id); setSelected(new Set()); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                isActive
                  ? isRed
                    ? 'bg-red-500/15 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                    : 'bg-primary/15 border-primary/40 text-primary shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                  : 'bg-surface-container-low/80 border-border/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-border/60'
              }`}
            >
              {v.label}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                isActive
                  ? isRed ? 'bg-red-500/25 text-red-300' : 'bg-primary/25 text-primary'
                  : 'bg-surface-container-high text-on-surface-variant'
              }`}>
                {v.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-lg">
        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-container/80 backdrop-blur-md border-b border-border/40 text-on-surface-variant font-bold text-xs uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3.5 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded bg-surface-container border-border/60 text-primary focus:ring-primary/50 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3.5">
                  <span className="inline-flex items-center gap-1.5 cursor-pointer hover:text-on-surface transition-colors">
                    ID <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
                  </span>
                </th>
                <th className="px-4 py-3.5 min-w-[300px]">
                  <span className="inline-flex items-center gap-1.5 cursor-pointer hover:text-on-surface transition-colors">
                    Asunto <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
                  </span>
                </th>
                <th className="px-4 py-3.5 text-center">Fusionado</th>
                <th className="px-4 py-3.5">Solicitante</th>
                <th className="px-4 py-3.5">Asignado</th>
                <th className="px-4 py-3.5">Estado</th>
                <th className="px-4 py-3.5">SLA</th>
                <th className="px-4 py-3.5">
                  <span className="inline-flex items-center gap-1.5 cursor-pointer text-primary transition-colors">
                    Fecha Creación <ArrowDown className="w-3.5 h-3.5" />
                  </span>
                </th>
                <th className="px-4 py-3.5">Sitio</th>
                <th className="px-4 py-3.5">Activo</th>
                <th className="px-4 py-3.5">
                  <span className="inline-flex items-center gap-1.5 cursor-pointer hover:text-on-surface transition-colors">
                    Prioridad <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {visibleTickets.map(ticket => {
                const isCritical = ticket.priority === 'Critical';
                const isResolved = ticket.status === 'Resolved';
                const isSelected = selected.has(ticket.id);
                const sla = slaByTicketID.get(ticket.id) ?? getSlaChip(
                  ticket,
                  undefined,
                  slaNow,
                  slaAssessments.isLoading,
                  slaAssessments.isError,
                );

                const rowBg = isSelected
                  ? 'bg-primary/10 hover:bg-primary/15 border-l-4 border-l-primary'
                  : isResolved
                    ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border-l-4 border-l-emerald-500'
                    : isCritical
                      ? 'bg-red-500/10 hover:bg-red-500/20 border-l-4 border-l-red-500'
                      : 'bg-surface-container/30 hover:bg-surface-container-highest/60 border-l-4 border-l-transparent';

                return (
                  <tr
                    key={ticket.id}
                    data-testid={`ticket-row-${ticket.id}`}
                    onClick={() => navigate(`../tickets/${ticket.id}`)}
                    className={`${rowBg} transition-all duration-150 cursor-pointer text-on-surface`}
                  >
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(ticket.id)}
                        className="rounded bg-surface-container border-border/60 text-primary focus:ring-primary/50 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{ticket.id}</td>
                    <td className="px-4 py-3 font-medium truncate max-w-[400px]" title={ticket.title}>{ticket.title}</td>
                    <td className="px-4 py-3 text-center">
                      {ticket.mergedCount && ticket.mergedCount > 0 ? (
                        <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-bold">
                          <Link2 className="w-3 h-3" />
                          {ticket.mergedCount}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant/40">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant font-medium text-xs">{ticket.requester}</td>
                    <td className="px-4 py-3 text-xs">
                      {ticket.assignee ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-container-high border border-border/50 font-medium text-on-surface">
                          <span className="w-2 h-2 rounded-full bg-primary/70"></span>
                          {ticket.assignee}
                        </span>
                      ) : (
                        <span className="italic text-on-surface-variant/60">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(ticket.status)}
                        <span className="text-xs font-semibold">{ticket.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        data-testid={`sla-chip-${ticket.id}`}
                        title={sla.title}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-extrabold tracking-wide uppercase shadow-sm ${sla.className}`}
                      >
                        <sla.icon className="w-3 h-3 shrink-0" />
                        {sla.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs font-medium">
                      {new Date(ticket.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-xs">{ticket.site || '-'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-on-surface-variant">{ticket.assetId || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${
                        isCritical ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.15)]' :
                        ticket.priority === 'High' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                        'bg-surface-container-high text-on-surface-variant border border-border/50'
                      }`}>
                        {ticket.priority}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {visibleTickets.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-on-surface-variant italic font-medium">
                    No se encontraron tickets con los criterios seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="mt-auto p-4 border-t border-border/40 bg-surface-container/80 backdrop-blur-md flex items-center justify-between text-xs text-on-surface-variant font-medium">
          <div>Mostrando <span className="font-bold text-on-surface">{visibleTickets.length}</span> tickets{ticketPage?.hasMore ? ' · más disponibles' : ''}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevPage}
              disabled={cursorStack.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-surface-container border border-border/50 hover:text-on-surface hover:border-border hover:bg-surface-container-high transition-all disabled:opacity-40 disabled:pointer-events-none font-bold"
            >
              Anterior
            </button>
            <button
              onClick={goToNextPage}
              disabled={!ticketPage?.hasMore}
              className="px-3.5 py-1.5 rounded-xl bg-surface-container border border-border/50 hover:text-on-surface hover:border-border hover:bg-surface-container-high transition-all disabled:opacity-40 disabled:pointer-events-none font-bold"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
