import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Ticket, TicketStatus } from './types';
import { KNOWN_TICKET_STATUSES } from './types';
import { AlertCircle, Clock, CheckCircle2, CircleDashed, LayoutGrid, List as ListIcon, Filter, MoreHorizontal, Link2, User, CircleDot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TicketsList from './TicketsList';
import { useTickets, useUpdateTicketStatus } from './hooks';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/useAuth';

type StatusStyle = { icon: LucideIcon; color: string; bgColor: string };

const knownStatusConfig: Record<string, StatusStyle> = {
  'Open': { icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-400/10' },
  'In Progress': { icon: CircleDashed, color: 'text-cyan-400', bgColor: 'bg-cyan-400/10' },
  'Pending Review': { icon: Clock, color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
  'Resolved': { icon: CheckCircle2, color: 'text-emerald-400', bgColor: 'bg-emerald-400/10' },
};

// A state defined in the catalog Definition that we have no explicit design
// for still needs to render, so it falls back to a neutral style.
function statusStyle(status: TicketStatus): StatusStyle {
  return (
    knownStatusConfig[status] ?? {
      icon: CircleDot,
      color: 'text-on-surface-variant',
      bgColor: 'bg-surface-container-high',
    }
  );
}

// Columns are the known states first (in designed order), then any extra
// state actually present on a ticket, so nothing silently disappears from
// the board when an admin adds a state in the Catalog Builder.
function boardColumns(tickets: Ticket[]): TicketStatus[] {
  const known: TicketStatus[] = [...KNOWN_TICKET_STATUSES];
  const extras = Array.from(new Set(tickets.map((t) => t.status)))
    .filter((status) => !known.includes(status))
    .sort();
  return [...known, ...extras];
}

function KanbanColumn({
  title,
  status,
  tickets,
  onDropTicket,
  isDragOver,
  onDragOverColumn,
  onDragLeaveColumn,
}: {
  title: string;
  status: TicketStatus;
  tickets: Ticket[];
  onDropTicket: (ticketId: string, status: TicketStatus) => void;
  isDragOver: boolean;
  onDragOverColumn: () => void;
  onDragLeaveColumn: () => void;
}) {
  const navigate = useNavigate();
  const config = statusStyle(status);
  const Icon = config.icon;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOverColumn(); }}
      onDragLeave={onDragLeaveColumn}
      onDrop={(e) => {
        e.preventDefault();
        onDragLeaveColumn();
        const ticketId = e.dataTransfer.getData('text/ticket-id');
        if (ticketId) onDropTicket(ticketId, status);
      }}
      className={`flex flex-col w-full min-w-[320px] max-w-[350px] bg-surface-container-low/90 backdrop-blur-md border rounded-3xl overflow-hidden h-[calc(100vh-180px)] transition-all shadow-md ${
        isDragOver ? 'border-primary/70 shadow-[0_0_25px_rgba(34,211,238,0.2)] bg-surface-container-low' : 'border-border/40'
      }`}
    >
      <div className="p-4 border-b border-border/40 flex items-center justify-between bg-surface-container/70 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-xl ${config.bgColor}`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
          </div>
          <h3 className="font-bold text-sm text-on-surface tracking-wide">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider ${config.bgColor} ${config.color} border border-current/20`}>
            {tickets.length}
          </div>
          <button className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {tickets.map(ticket => (
          <div
            key={ticket.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/ticket-id', ticket.id)}
            onClick={() => navigate(`/app/tickets/${ticket.id}`)}
            className="bg-surface-container/90 border border-border/50 rounded-2xl p-4 cursor-pointer hover:border-primary/50 hover:shadow-[0_4px_20px_rgba(34,211,238,0.12)] hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <div className="flex justify-between items-start mb-2.5">
              <span className="text-xs font-mono font-bold text-on-surface-variant group-hover:text-primary transition-colors flex items-center gap-2">
                {ticket.id}
                {ticket.mergedCount && ticket.mergedCount > 0 && (
                   <span className="flex items-center gap-1 text-[10px] text-primary bg-primary/15 border border-primary/30 px-1.5 py-0.5 rounded-md font-bold">
                     <Link2 className="w-3 h-3" /> {ticket.mergedCount}
                   </span>
                )}
              </span>
              {ticket.priority === 'Critical' && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.15)]">
                  Critical
                </span>
              )}
            </div>
            <h4 className="text-sm font-bold text-on-surface mb-3 leading-snug line-clamp-2">{ticket.title}</h4>
            
            <div className="flex flex-col gap-1.5 mb-3 text-[11px] text-on-surface-variant">
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant/70">Sitio:</span>
                <span className="font-semibold text-on-surface">{ticket.site || '-'}</span>
              </div>
              {ticket.assetId && (
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant/70">Activo:</span>
                  <span className="font-mono text-on-surface font-semibold">{ticket.assetId}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/30">
              <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-border/40 flex items-center justify-center text-[10px] font-black text-on-surface shadow-sm" title={`Asignado: ${ticket.assignee || 'Sin asignar'}`}>
                    {ticket.assignee ? ticket.assignee.charAt(0).toUpperCase() : <User className="w-3 h-3 opacity-50" />}
                 </div>
                 <span className="text-[11px] font-medium text-on-surface-variant truncate max-w-[90px]">
                   {ticket.assignee || 'Sin asignar'}
                 </span>
              </div>
              <span className="text-[10px] font-medium text-on-surface-variant/70">
                {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <div className="h-40 flex flex-col items-center justify-center text-xs text-on-surface-variant/60 italic border-2 border-dashed border-border/30 rounded-2xl">
            Sin tickets en este estado
          </div>
        )}
      </div>
    </div>
  );
}

export default function TicketsKanban() {
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [site, setSite] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);
  const { displayName: currentUserName } = useAuth();
  const updateStatus = useUpdateTicketStatus();
  const filters = useMemo(
    () => ({ site: site || undefined, assignee: assignee || undefined, limit: 200 }),
    [site, assignee],
  );
  const {
    data: ticketPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useTickets(filters);
  const tickets = useMemo(() => ticketPage?.items ?? [], [ticketPage?.items]);
  const siteOptions = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.site).filter(Boolean) as string[])).sort(),
    [tickets],
  );
  const assigneeOptions = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.assignee).filter(Boolean) as string[])).sort(),
    [tickets],
  );

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingSkeleton type="list" />
      </div>
    );
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

  const hasActiveFilters = Boolean(site || assignee);

  if (tickets.length === 0 && !hasActiveFilters) {
    return (
      <EmptyState
        type="inbox"
        title="No tickets yet"
        description="Create the first request from the service catalog."
      />
    );
  }

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-wide mb-1">Ticket Board</h1>
          <p className="text-sm text-on-surface-variant">
            {viewMode === 'kanban' ? 'Drag and drop tickets to update their status.' : 'View all tickets in a detailed list.'}
          </p>
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center bg-surface-container-low border border-border/50 rounded-xl p-1 shadow-inner">
          <button 
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              viewMode === 'kanban' 
                ? 'bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Kanban
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              viewMode === 'list' 
                ? 'bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <ListIcon className="w-4 h-4" />
            List
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 items-center mb-6 bg-surface-container-low border border-border/40 p-4 rounded-2xl">
        <div className="flex-1 flex items-center gap-2">
          <Filter className="w-4 h-4 text-on-surface-variant" />
          <span className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mr-2">Filters:</span>
          <select
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-2 text-on-surface outline-none"
          >
            <option value="">All Sites</option>
            {siteOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="bg-surface-container border border-border/50 text-sm rounded-lg px-3 py-2 text-on-surface outline-none"
          >
            <option value="">All Assignees</option>
            {assigneeOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {hasActiveFilters && (
            <button
              onClick={() => { setSite(''); setAssignee(''); }}
              className="bg-surface-container border border-border/50 text-sm rounded-lg px-4 py-2 text-on-surface-variant hover:text-on-surface hover:border-border transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {tickets.length === 0 && hasActiveFilters ? (
        <EmptyState
          title="No tickets match these filters"
          description="Try a different site or assignee, or clear the filters."
          action={
            <button
              onClick={() => { setSite(''); setAssignee(''); }}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold"
            >
              Clear filters
            </button>
          }
        />
      ) : viewMode === 'kanban' ? (
        <div className="flex-1 flex gap-6 overflow-x-auto pb-4">
          {boardColumns(tickets).map((columnStatus) => (
            <KanbanColumn
              key={columnStatus}
              title={columnStatus}
              status={columnStatus}
              tickets={tickets.filter((t) => t.status === columnStatus)}
              isDragOver={dragOverStatus === columnStatus}
              onDragOverColumn={() => setDragOverStatus(columnStatus)}
              onDragLeaveColumn={() => setDragOverStatus((current) => (current === columnStatus ? null : current))}
              onDropTicket={(ticketId, newStatus) => {
                const ticket = tickets.find((t) => t.id === ticketId);
                if (!ticket || ticket.status === newStatus) return;
                updateStatus.mutate(
                  { id: ticketId, status: newStatus, actorName: currentUserName },
                  { onError: (err) => window.alert(err.message) },
                );
              }}
            />
          ))}
        </div>
      ) : (
        <TicketsList />
      )}
    </div>
  );
}
