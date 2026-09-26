import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Clock3, Play, Search, Users, Wrench, X } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { getWorkflowAssignmentDirectory } from '@/features/automations/api';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { formatDateTime } from '@/i18n/format';
import {
  claimIncidentIT1,
  completeIncidentClientAction,
  createIncidentClientAction,
  decideIncidentDuplicate,
  listTickets,
} from '../api';
import type { IncidentOperationalCycle, IncidentWorkItem, IncidentWorkTransitionInput, Ticket, TicketAttachment } from '../types';

interface Props {
  ticketId: string;
  cycle?: IncidentOperationalCycle;
  attachments: TicketAttachment[];
  loading: boolean;
  error?: string;
  canManage: boolean;
  pending: boolean;
  onRetry: () => void;
  onTransition: (workItemId: number, input: IncidentWorkTransitionInput) => void;
}

type WorkOutcome = NonNullable<IncidentWorkItem['outcomeCode']>;
type DialogState =
  | { kind: 'duplicate' }
  | { kind: 'complete-work'; item: IncidentWorkItem; outcome: WorkOutcome }
  | { kind: 'client-action'; item: IncidentWorkItem }
  | { kind: 'complete-client'; actionId: number; outcome: 'resolved' | 'unresolved' };

const statusLabels: Record<IncidentWorkItem['status'], string> = {
  pending: 'Pending', in_progress: 'In progress', resolved: 'Completed',
  service_required: 'Service required', canceled: 'Canceled',
};

const outcomeLabels: Record<WorkOutcome, string> = {
  resolved: 'Resolved',
  escalate_to_it2: 'Escalate to IT 2',
  client_action_required: 'Client / site action required',
  service_required: 'Field service required',
};

export function IncidentWorkPanel({ ticketId, cycle, attachments, loading, error, canManage, pending, onRetry, onTransition }: Props) {
  const { deskUserId, can } = useAuth();
  const canTriage = can(PERMISSIONS.incidentTriageManage);
  const canManageClientActions = can(PERMISSIONS.incidentClientActionsManage);
  const [dialog, setDialog] = useState<DialogState>();
  const [notes, setNotes] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [duplicateQuery, setDuplicateQuery] = useState('');
  const [primaryTicket, setPrimaryTicket] = useState<Ticket>();
  const [contactedPerson, setContactedPerson] = useState('');
  const [instructions, setInstructions] = useState('');
  const workItems = cycle?.workItems ?? [];
  const hasTeamDirectedWork = workItems.some((item) => item.status === 'pending' && Boolean(item.teamId));
  const directory = useQuery({
    queryKey: ['organization', 'assignment-directory', 'tickets'],
    queryFn: getWorkflowAssignmentDirectory,
    enabled: Boolean(deskUserId) && (hasTeamDirectedWork || (canTriage && !cycle?.triage.claimedByUserId)),
  });
  const duplicateSearch = useQuery({
    queryKey: ['incident-duplicate-primary-search', duplicateQuery],
    queryFn: ({ signal }) => listTickets({ q: duplicateQuery, limit: 10 }, signal),
    enabled: dialog?.kind === 'duplicate' && duplicateQuery.trim().length >= 2,
  });
  const duplicateCandidates = (duplicateSearch.data?.items ?? []).filter(
    (candidate) => candidate.id !== ticketId && candidate.id !== primaryTicket?.id,
  );
  const actorTeams = useMemo(() => {
    const teamIds = new Set((directory.data?.assignees ?? []).filter((person) => person.id === deskUserId).map((person) => person.team_id));
    return (directory.data?.teams ?? []).filter((team) => teamIds.has(team.id));
  }, [deskUserId, directory.data]);
  const actorTeamIds = useMemo(() => new Set(actorTeams.map((team) => team.id)), [actorTeams]);
  const [claimTeamId, setClaimTeamId] = useState('');
  const command = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: () => { setDialog(undefined); resetForm(); onRetry(); },
  });

  const evidence = useMemo(() => evidenceText.split('\n').map((value) => value.trim()).filter(Boolean), [evidenceText]);
  const selectedClaimTeam = actorTeams.find((team) => team.id === claimTeamId) ?? (actorTeams.length === 1 ? actorTeams[0] : undefined);
  const selectedClaimDepartment = directory.data?.departments.find((department) => department.id === selectedClaimTeam?.department_id);

  function resetForm() {
    setNotes(''); setEvidenceText(''); setDuplicateQuery(''); setPrimaryTicket(undefined); setContactedPerson(''); setInstructions('');
  }
  function open(next: DialogState) { resetForm(); setDialog(next); }
  function submitDialog() {
    if (!dialog) return;
    if (dialog.kind === 'duplicate') {
      const primary = Number(primaryTicket?.id);
      command.mutate(() => decideIncidentDuplicate(ticketId, 'duplicate', primary));
      return;
    }
    if (dialog.kind === 'complete-work') {
      onTransition(dialog.item.id, { transition: 'complete', outcomeCode: dialog.outcome, notesArray: [notes.trim()], evidence });
      setDialog(undefined); resetForm();
      return;
    }
    if (dialog.kind === 'client-action') {
      command.mutate(() => createIncidentClientAction(ticketId, {
        it2WorkItemId: dialog.item.id,
        contactedPerson: contactedPerson.trim(),
        instructions: instructions.split('\n').map((value) => value.trim()).filter(Boolean),
        performedAt: new Date().toISOString(), evidence,
      }));
      return;
    }
    command.mutate(() => completeIncidentClientAction(ticketId, dialog.actionId, dialog.outcome, [notes.trim()]));
  }

  if (loading) return <section className="mb-6 rounded-2xl border border-border/40 bg-surface-container-low p-5 text-sm text-on-surface-variant">Loading incident lifecycle…</section>;
  if (error || !cycle) return <section className="mb-6 rounded-2xl border border-status-danger-border bg-status-danger-bg p-5"><p className="font-bold text-status-danger-fg">Incident lifecycle is unavailable</p><p className="mt-1 text-sm text-on-surface-variant">{error}</p><button type="button" className="secondary-button mt-3" onClick={onRetry}>Retry</button></section>;

  const triaged = Boolean(cycle.triage.duplicateDecision);
  const busy = pending || command.isPending;
  return (
    <section className="mb-6 rounded-2xl border border-border/50 bg-surface-container-low p-5" data-testid="incident-operational-cycle">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><ClipboardList className="h-5 w-5" /></div><div><h2 className="font-black text-on-surface">Canonical incident lifecycle</h2><p className="mt-1 text-xs text-on-surface-variant">IT 1 triage → IT 2 escalation → client action or governed Services cycle.</p></div></div>
        {cycle.triage.duplicateDecision && <span className="rounded-full border border-border px-3 py-1 text-xs font-bold">{cycle.triage.duplicateDecision === 'duplicate' ? 'Duplicate closed' : 'Not a duplicate'}</span>}
      </div>

      {!cycle.triage.claimedByUserId && canTriage && <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4"><div className="flex items-center gap-2 font-bold"><Users className="h-4 w-4" />IT 1 claim required</div><p className="mt-1 text-sm text-on-surface-variant">The incident remains unassigned until an authorized IT 1 member claims it.</p>{actorTeams.length > 1 && <select className="input-field mt-3 w-full max-w-sm" value={claimTeamId} onChange={(event) => setClaimTeamId(event.target.value)}><option value="">Select your IT 1 team…</option>{actorTeams.map((team) => <option key={team.id} value={team.id}>{team.nombre}</option>)}</select>}<button type="button" className="primary-button mt-3" disabled={busy || !selectedClaimTeam || !selectedClaimDepartment} onClick={() => command.mutate(() => claimIncidentIT1(ticketId, selectedClaimDepartment!.id, selectedClaimTeam!.id))}>Claim as IT 1</button>{directory.isSuccess && actorTeams.length === 0 && <p className="mt-2 text-xs text-status-warning-fg">Your Organization identity is not an active member of an IT 1 team.</p>}</div>}

      {cycle.triage.claimedByUserId && !triaged && canTriage && <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="primary-button" disabled={busy} onClick={() => command.mutate(() => decideIncidentDuplicate(ticketId, 'not_duplicate'))}>Not a duplicate</button><button type="button" className="secondary-button" disabled={busy} onClick={() => open({ kind: 'duplicate' })}>Duplicate of another incident</button></div>}

      {command.isError && <p role="alert" className="mt-3 text-sm text-status-danger-fg">{command.error.message}</p>}

      {workItems.length > 0 && <div className="mt-5 space-y-3">{workItems.map((item) => {
        const outcomes: WorkOutcome[] = item.workType === 'it1_remote_troubleshooting'
          ? ['resolved', 'escalate_to_it2']
          : item.workType === 'it2_troubleshooting'
            ? ['resolved', 'client_action_required', 'service_required']
            : ['resolved', 'service_required'];
        const canStartTeamWork = !item.teamId || actorTeamIds.has(item.teamId);
        const teamName = directory.data?.teams.find((team) => team.id === item.teamId)?.nombre;
        return (
          <article key={item.id} className="rounded-xl border border-border/40 bg-surface-container p-4" data-testid={`incident-work-${item.id}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-primary">{item.workType === 'it1_remote_troubleshooting' ? 'IT 1 remote troubleshooting' : item.workType === 'it2_troubleshooting' ? 'IT 2 troubleshooting' : 'Legacy troubleshooting'}</p>
                <h3 className="mt-1 font-bold text-on-surface">{item.title}</h3>
                <p className="mt-1 text-sm text-on-surface-variant">{item.instructions}</p>
              </div>
              <span className="h-fit rounded-full border border-border px-2.5 py-1 text-[10px] font-black uppercase">{statusLabels[item.status]}</span>
            </div>
            {item.dueAt && <p className="mt-3 flex items-center gap-1.5 text-xs text-on-surface-variant"><Clock3 className="h-3.5 w-3.5" />Due {formatDateTime(item.dueAt, 'en-US')}</p>}
            {item.outcomeCode && <p className="mt-3 text-sm font-bold text-on-surface">Outcome: {outcomeLabels[item.outcomeCode]}</p>}
            {item.notes.length > 0 && <ul className="mt-2 list-inside list-disc text-sm text-on-surface-variant">{item.notes.map((value, index) => <li key={index}>{value}</li>)}</ul>}
            {canManage && item.status === 'pending' && canStartTeamWork && <button type="button" className="primary-button mt-4" disabled={busy || directory.isLoading} onClick={() => onTransition(item.id, { transition: 'start' })}><Play className="h-4 w-4" />Start</button>}
            {canManage && item.status === 'pending' && directory.isSuccess && !canStartTeamWork && <p role="note" className="mt-4 rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">Assigned to {teamName ?? 'another Organization team'}. Only an active member of that team can start this work.</p>}
            {canManage && item.status === 'in_progress' && <div className="mt-4 flex flex-wrap gap-2">{outcomes.map((outcome) => <button key={outcome} type="button" className={outcome === 'resolved' ? 'primary-button' : 'secondary-button'} disabled={busy} onClick={() => open({ kind: 'complete-work', item, outcome })}>{outcome === 'service_required' ? <Wrench className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{outcomeLabels[outcome]}</button>)}</div>}
            {canManageClientActions && item.outcomeCode === 'client_action_required' && !cycle.clientActions.some((action) => action.it2WorkItemId === item.id) && <button type="button" className="secondary-button mt-4" onClick={() => open({ kind: 'client-action', item })}>Record client / site action</button>}
          </article>
        );
      })}</div>}

      {cycle.clientActions.length > 0 && <div className="mt-5"><h3 className="text-sm font-black text-on-surface">Client / site actions</h3><div className="mt-2 space-y-2">{cycle.clientActions.map((action) => <article key={action.id} className="rounded-xl border border-border/40 bg-surface-container p-4"><p className="font-bold">Contact: {action.contactedPerson}</p><ul className="mt-2 list-inside list-disc text-sm text-on-surface-variant">{action.instructions.map((value, index) => <li key={index}>{value}</li>)}</ul>{action.outcomeCode ? <p className="mt-2 text-sm font-bold">Outcome: {action.outcomeCode}</p> : canManageClientActions && <div className="mt-3 flex gap-2"><button className="primary-button" onClick={() => open({ kind: 'complete-client', actionId: action.id, outcome: 'resolved' })}>Resolved</button><button className="secondary-button" onClick={() => open({ kind: 'complete-client', actionId: action.id, outcome: 'unresolved' })}>Still unresolved</button></div>}</article>)}</div></div>}

      {cycle.serviceCycles.length > 0 && <div className="mt-5"><h3 className="text-sm font-black">Governed Services cycles</h3><div className="mt-2 grid gap-2 md:grid-cols-2">{cycle.serviceCycles.map((serviceCycle) => <div key={serviceCycle.changeId} className="rounded-xl border border-border/40 bg-surface-container p-3 text-xs"><p className="font-mono font-bold">RFC #{serviceCycle.changeId}</p><p className="mt-2 text-on-surface-variant">Parts {serviceCycle.parts} · Purchasing {serviceCycle.purchasing} · Field work {serviceCycle.fieldWork} · Restoration {serviceCycle.restoration} · Finance {serviceCycle.financial} · Closeout {serviceCycle.closeout}</p>{serviceCycle.additionalCycleOpen && <p className="mt-2 font-bold text-status-warning-fg">A follow-up service cycle is being created.</p>}</div>)}</div></div>}

      <Dialog open={Boolean(dialog)} onClose={() => !busy && setDialog(undefined)} preventDismiss={busy} title={dialog?.kind === 'duplicate' ? 'Mark duplicate incident' : dialog?.kind === 'client-action' ? 'Record client / site action' : dialog?.kind === 'complete-client' ? 'Complete client / site action' : dialog?.kind === 'complete-work' ? outcomeLabels[dialog.outcome] : 'Incident action'} footer={<><button className="secondary-button" onClick={() => setDialog(undefined)} disabled={busy}>Cancel</button><button className="primary-button" onClick={submitDialog} disabled={busy || (dialog?.kind === 'duplicate' ? !primaryTicket : dialog?.kind === 'client-action' ? !contactedPerson.trim() || !instructions.trim() || evidence.length === 0 : !notes.trim() || (dialog?.kind === 'complete-work' && evidence.length === 0))}>Confirm</button></>}>
        {dialog?.kind === 'duplicate' ? <div className="space-y-3">
          <label className="block text-sm font-bold" htmlFor="duplicate-incident-search">Primary incident</label>
          {primaryTicket ? <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3"><div className="min-w-0 flex-1"><p className="font-mono text-xs font-bold text-primary">{primaryTicket.humanId ?? primaryTicket.id}</p><p className="truncate text-sm text-on-surface">{primaryTicket.title}</p></div><button type="button" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label={`Clear ${primaryTicket.humanId ?? primaryTicket.id}`} onClick={() => setPrimaryTicket(undefined)}><X className="h-4 w-4" /></button></div> : <>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /><input id="duplicate-incident-search" className="input-field w-full pl-9" value={duplicateQuery} onChange={(event) => setDuplicateQuery(event.target.value)} placeholder="Search by INC number or titleâ€¦" autoComplete="off" /></div>
            {duplicateQuery.trim().length >= 2 && <ul className="max-h-64 overflow-y-auto rounded-xl border border-border/50" aria-label="Matching incidents">{duplicateSearch.isLoading && <li className="p-3 text-sm text-on-surface-variant">Searchingâ€¦</li>}{!duplicateSearch.isLoading && duplicateCandidates.length === 0 && <li className="p-3 text-sm text-on-surface-variant">No matching incidents found.</li>}{duplicateCandidates.map((candidate) => <li key={candidate.id}><button type="button" className="flex w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-container-high" onClick={() => setPrimaryTicket(candidate)}><span className="font-mono text-xs font-bold text-primary">{candidate.humanId ?? candidate.id}</span><span className="truncate">{candidate.title}</span></button></li>)}</ul>}
          </>}
          <p className="text-xs text-on-surface-variant">The current incident will be linked to the selected primary incident and closed.</p>
        </div> : dialog?.kind === 'client-action' ? <div className="space-y-3"><label className="block text-sm font-bold">Person contacted<input className="input-field mt-2 w-full" value={contactedPerson} onChange={(event) => setContactedPerson(event.target.value)} /></label><label className="block text-sm font-bold">Instructions (one per line)<textarea className="input-field mt-2 w-full" rows={4} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><EvidenceField value={evidenceText} onChange={setEvidenceText} attachments={attachments} /></div> : <div className="space-y-3"><label className="block text-sm font-bold">Documented notes<textarea className="input-field mt-2 w-full" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{dialog?.kind === 'complete-work' && <EvidenceField value={evidenceText} onChange={setEvidenceText} attachments={attachments} />}</div>}
      </Dialog>
    </section>
  );
}

function EvidenceField({ value, onChange, attachments }: { value: string; onChange: (value: string) => void; attachments: TicketAttachment[] }) {
  return <label className="block text-sm font-bold">Evidence references (one per line)<textarea className="input-field mt-2 w-full" rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={attachments.length ? `Available ticket attachment: ${attachments[0].fileName}` : 'Attachment ID, log, photo, monitoring link…'} /></label>;
}
