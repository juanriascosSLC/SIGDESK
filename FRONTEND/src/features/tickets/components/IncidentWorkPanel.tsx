import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Plus, Play, Search, Trash2, Users, Wrench, X } from 'lucide-react';
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
import type { IncidentDiagnosticCheck, IncidentOperationalCycle, IncidentTroubleshootingReport, IncidentWorkItem, IncidentWorkTransitionInput, Ticket, TicketAttachment } from '../types';
import { defaultIncidentWorkExperience, type IncidentWorkExperience, type IncidentWorkExperienceField } from '@/features/catalog/metamodel';

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

const emptyDiagnosticCheck = (): IncidentDiagnosticCheck => ({ category: 'connectivity', action: '', result: '', status: 'passed' });

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
  const [formData, setFormData] = useState<Record<string, unknown>>({ diagnostic_checks: [emptyDiagnosticCheck()] });
  const [formStep, setFormStep] = useState(0);
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
  const activeExperience = dialog?.kind === 'complete-work' ? (dialog.item.experienceSnapshot?.contractVersion === 1 ? dialog.item.experienceSnapshot : defaultIncidentWorkExperience(dialog.item.workType === 'it1_remote_troubleshooting' ? 'it1_remote_troubleshooting' : 'it2_troubleshooting')) : undefined;
  const troubleshootingReport = useMemo<IncidentTroubleshootingReport>(() => ({
    contractVersion: 1,
    symptomSummary: String(formData.symptom_summary ?? '').trim(), impactAssessment: String(formData.impact_assessment ?? '').trim(), affectedServices: asStringArray(formData.affected_services),
    checks: asDiagnosticChecks(formData.diagnostic_checks), suspectedCause: String(formData.suspected_cause ?? '').trim(), resolutionSummary: String(formData.resolution_summary ?? '').trim(), escalationReason: String(formData.escalation_reason ?? '').trim(), nextAction: String(formData.next_action ?? '').trim(),
  }), [formData]);
  const diagnosticValid = Boolean(dialog?.kind === 'complete-work' && activeExperience && experienceIsValid(activeExperience, dialog.outcome, formData));
  const selectedClaimTeam = actorTeams.find((team) => team.id === claimTeamId) ?? (actorTeams.length === 1 ? actorTeams[0] : undefined);
  const selectedClaimDepartment = directory.data?.departments.find((department) => department.id === selectedClaimTeam?.department_id);

  function resetForm() {
    setNotes(''); setEvidenceText(''); setDuplicateQuery(''); setPrimaryTicket(undefined); setContactedPerson(''); setInstructions('');
    setFormData({ diagnostic_checks: [emptyDiagnosticCheck()] }); setFormStep(0);
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
      const summary = dialog.outcome === 'resolved' ? troubleshootingReport.resolutionSummary : troubleshootingReport.escalationReason || firstFormSummary(formData);
      const standardKeys = ['symptom_summary','impact_assessment','affected_services','diagnostic_checks','suspected_cause'];
      const legacyReport = standardKeys.every((key) => Object.hasOwn(formData, key)) ? troubleshootingReport : undefined;
      onTransition(dialog.item.id, { transition: 'complete', outcomeCode: dialog.outcome, notesArray: [summary || 'Completed'], evidence, troubleshootingReport: legacyReport, formData });
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
  const confirmDisabled = busy || (dialog?.kind === 'duplicate'
    ? !primaryTicket
    : dialog?.kind === 'client-action'
      ? !contactedPerson.trim() || !instructions.trim() || evidence.length === 0
      : dialog?.kind === 'complete-work'
        ? !diagnosticValid || evidence.length === 0
        : !notes.trim());
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
            {item.troubleshootingReport?.contractVersion === 1 && <TroubleshootingSummary report={item.troubleshootingReport as IncidentTroubleshootingReport} />}
            {canManage && item.status === 'pending' && canStartTeamWork && <button type="button" className="primary-button mt-4" disabled={busy || directory.isLoading} onClick={() => onTransition(item.id, { transition: 'start' })}><Play className="h-4 w-4" />Start</button>}
            {canManage && item.status === 'pending' && directory.isSuccess && !canStartTeamWork && <p role="note" className="mt-4 rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">Assigned to {teamName ?? 'another Organization team'}. Only an active member of that team can start this work.</p>}
            {canManage && item.status === 'in_progress' && <div className="mt-4 flex flex-wrap gap-2">{outcomes.map((outcome) => <button key={outcome} type="button" className={outcome === 'resolved' ? 'primary-button' : 'secondary-button'} disabled={busy} onClick={() => open({ kind: 'complete-work', item, outcome })}>{outcome === 'service_required' ? <Wrench className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{outcomeLabels[outcome]}</button>)}</div>}
            {canManageClientActions && item.outcomeCode === 'client_action_required' && !cycle.clientActions.some((action) => action.it2WorkItemId === item.id) && <button type="button" className="secondary-button mt-4" onClick={() => open({ kind: 'client-action', item })}>Record client / site action</button>}
          </article>
        );
      })}</div>}

      {cycle.clientActions.length > 0 && <div className="mt-5"><h3 className="text-sm font-black text-on-surface">Client / site actions</h3><div className="mt-2 space-y-2">{cycle.clientActions.map((action) => <article key={action.id} className="rounded-xl border border-border/40 bg-surface-container p-4"><p className="font-bold">Contact: {action.contactedPerson}</p><ul className="mt-2 list-inside list-disc text-sm text-on-surface-variant">{action.instructions.map((value, index) => <li key={index}>{value}</li>)}</ul>{action.outcomeCode ? <p className="mt-2 text-sm font-bold">Outcome: {action.outcomeCode}</p> : canManageClientActions && <div className="mt-3 flex gap-2"><button className="primary-button" onClick={() => open({ kind: 'complete-client', actionId: action.id, outcome: 'resolved' })}>Resolved</button><button className="secondary-button" onClick={() => open({ kind: 'complete-client', actionId: action.id, outcome: 'unresolved' })}>Still unresolved</button></div>}</article>)}</div></div>}

      {cycle.serviceCycles.length > 0 && <div className="mt-5"><h3 className="text-sm font-black">Governed Services cycles</h3><div className="mt-2 grid gap-2 md:grid-cols-2">{cycle.serviceCycles.map((serviceCycle) => <div key={serviceCycle.changeId} className="rounded-xl border border-border/40 bg-surface-container p-3 text-xs"><p className="font-mono font-bold">RFC #{serviceCycle.changeId}</p><p className="mt-2 text-on-surface-variant">Parts {serviceCycle.parts} · Purchasing {serviceCycle.purchasing} · Field work {serviceCycle.fieldWork} · Restoration {serviceCycle.restoration} · Finance {serviceCycle.financial} · Closeout {serviceCycle.closeout}</p>{serviceCycle.additionalCycleOpen && <p className="mt-2 font-bold text-status-warning-fg">A follow-up service cycle is being created.</p>}</div>)}</div></div>}

      <Dialog size={dialog?.kind === 'complete-work' ? 'xl' : 'md'} open={Boolean(dialog)} onClose={() => !busy && setDialog(undefined)} preventDismiss={busy} title={dialog?.kind === 'duplicate' ? 'Mark duplicate incident' : dialog?.kind === 'client-action' ? 'Record client / site action' : dialog?.kind === 'complete-client' ? 'Complete client / site action' : dialog?.kind === 'complete-work' ? `${outcomeLabels[dialog.outcome]} · ${activeExperience?.title ?? 'Diagnostic report'}` : 'Incident action'} description={dialog?.kind === 'complete-work' ? activeExperience?.summary : undefined} footer={dialog?.kind === 'complete-work' && activeExperience ? <><button className="secondary-button" onClick={() => setDialog(undefined)} disabled={busy}>Cancel</button><span className="mx-auto text-xs font-bold text-on-surface-variant">Step {formStep + 1} of {activeExperience.sections.length}</span>{formStep > 0 && <button className="secondary-button" onClick={() => setFormStep((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Back</button>}{formStep < activeExperience.sections.length - 1 ? <button className="primary-button" onClick={() => setFormStep((value) => value + 1)}>Next<ChevronRight className="h-4 w-4" /></button> : <button className="primary-button" onClick={submitDialog} disabled={confirmDisabled}>Save outcome</button>}</> : <><button className="secondary-button" onClick={() => setDialog(undefined)} disabled={busy}>Cancel</button><button className="primary-button" onClick={submitDialog} disabled={confirmDisabled}>Save</button></>}>
        {dialog?.kind === 'duplicate' ? <div className="space-y-3">
          <label className="block text-sm font-bold" htmlFor="duplicate-incident-search">Primary incident</label>
          {primaryTicket ? <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3"><div className="min-w-0 flex-1"><p className="font-mono text-xs font-bold text-primary">{primaryTicket.humanId ?? primaryTicket.id}</p><p className="truncate text-sm text-on-surface">{primaryTicket.title}</p></div><button type="button" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label={`Clear ${primaryTicket.humanId ?? primaryTicket.id}`} onClick={() => setPrimaryTicket(undefined)}><X className="h-4 w-4" /></button></div> : <>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /><input id="duplicate-incident-search" className="input-field w-full pl-9" value={duplicateQuery} onChange={(event) => setDuplicateQuery(event.target.value)} placeholder="Search by INC number or title…" autoComplete="off" /></div>
            {duplicateQuery.trim().length >= 2 && <ul className="max-h-64 overflow-y-auto rounded-xl border border-border/50" aria-label="Matching incidents">{duplicateSearch.isLoading && <li className="p-3 text-sm text-on-surface-variant">Searching…</li>}{!duplicateSearch.isLoading && duplicateCandidates.length === 0 && <li className="p-3 text-sm text-on-surface-variant">No matching incidents found.</li>}{duplicateCandidates.map((candidate) => <li key={candidate.id}><button type="button" className="flex w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-container-high" onClick={() => setPrimaryTicket(candidate)}><span className="font-mono text-xs font-bold text-primary">{candidate.humanId ?? candidate.id}</span><span className="truncate">{candidate.title}</span></button></li>)}</ul>}
          </>}
          <p className="text-xs text-on-surface-variant">The current incident will be linked to the selected primary incident and closed.</p>
        </div> : dialog?.kind === 'client-action' ? <div className="space-y-3"><label className="block text-sm font-bold">Person contacted<input className="input-field mt-2 w-full" value={contactedPerson} onChange={(event) => setContactedPerson(event.target.value)} /></label><label className="block text-sm font-bold">Instructions (one per line)<textarea className="input-field mt-2 w-full" rows={4} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><EvidenceField value={evidenceText} onChange={setEvidenceText} attachments={attachments} /></div> : dialog?.kind === 'complete-work' && activeExperience ? <DynamicTroubleshootingForm experience={activeExperience} outcome={dialog.outcome} step={formStep} data={formData} onChange={setFormData} attachments={attachments} onEvidenceChange={setEvidenceText} /> : <div className="space-y-3"><label className="block text-sm font-bold">Documented notes<textarea className="input-field mt-2 w-full" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>}
      </Dialog>
    </section>
  );
}

function EvidenceField({ value, onChange, attachments }: { value: string; onChange: (value: string) => void; attachments: TicketAttachment[] }) {
  return <label className="block text-sm font-bold">Evidence references (one per line)<textarea className="input-field mt-2 w-full" rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={attachments.length ? `Available ticket attachment: ${attachments[0].fileName}` : 'Attachment ID, log, photo, monitoring link…'} /></label>;
}

interface TroubleshootingFormProps {
  outcome: WorkOutcome;
  symptomSummary: string; setSymptomSummary: (value: string) => void;
  impactAssessment: string; setImpactAssessment: (value: string) => void;
  affectedServicesText: string; setAffectedServicesText: (value: string) => void;
  checks: IncidentDiagnosticCheck[]; setChecks: (checks: IncidentDiagnosticCheck[]) => void;
  suspectedCause: string; setSuspectedCause: (value: string) => void;
  resolutionSummary: string; setResolutionSummary: (value: string) => void;
  escalationReason: string; setEscalationReason: (value: string) => void;
  nextAction: string; setNextAction: (value: string) => void;
  evidenceText: string; setEvidenceText: (value: string) => void; attachments: TicketAttachment[];
}

export function TroubleshootingForm(props: TroubleshootingFormProps) {
  const updateCheck = (index: number, patch: Partial<IncidentDiagnosticCheck>) => props.setChecks(props.checks.map((check, current) => current === index ? { ...check, ...patch } : check));
  return <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1" data-testid="troubleshooting-diagnostic-form">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-center gap-2 font-black text-on-surface"><Activity className="h-4 w-4 text-primary" />Observed condition</div><p className="mt-1 text-xs text-on-surface-variant">Capture what is failing and the operational impact before recording tests.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-bold">Symptom summary<textarea className="input-field mt-1 w-full" rows={3} value={props.symptomSummary} onChange={(event) => props.setSymptomSummary(event.target.value)} placeholder="What is the user or monitoring system observing?" /></label><label className="text-sm font-bold">Impact assessment<textarea className="input-field mt-1 w-full" rows={3} value={props.impactAssessment} onChange={(event) => props.setImpactAssessment(event.target.value)} placeholder="Users, locations, duration and business impact" /></label></div><label className="mt-3 block text-sm font-bold">Affected services or components (one per line)<textarea className="input-field mt-1 w-full" rows={2} value={props.affectedServicesText} onChange={(event) => props.setAffectedServicesText(event.target.value)} placeholder="Internet connectivity&#10;CAM 01 Building Exterior" /></label></div>

    <div className="rounded-xl border border-border/50 bg-surface-container p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-on-surface">Diagnostic checks</p><p className="text-xs text-on-surface-variant">Record the action and its observed result; avoid generic “checked” notes.</p></div><button type="button" className="secondary-button" onClick={() => props.setChecks([...props.checks, emptyDiagnosticCheck()])}><Plus className="h-4 w-4" />Add check</button></div><div className="mt-3 space-y-3">{props.checks.map((check, index) => <div key={index} className="rounded-xl border border-border/40 bg-surface-container-low p-3"><div className="grid gap-2 md:grid-cols-[10rem_1fr_8rem_auto]"><label className="text-xs font-bold">Category<select className="input-field mt-1 w-full" value={check.category} onChange={(event) => updateCheck(index, { category: event.target.value })}><option value="power">Power</option><option value="connectivity">Connectivity</option><option value="network">Network</option><option value="application">Application</option><option value="hardware">Hardware</option><option value="configuration">Configuration</option><option value="monitoring">Monitoring</option><option value="other">Other</option></select></label><label className="text-xs font-bold">Check performed<input className="input-field mt-1 w-full" value={check.action} onChange={(event) => updateCheck(index, { action: event.target.value })} placeholder="Ping gateway, inspect link LEDs…" /></label><label className="text-xs font-bold">Status<select className="input-field mt-1 w-full" value={check.status} onChange={(event) => updateCheck(index, { status: event.target.value as IncidentDiagnosticCheck['status'] })}><option value="passed">Passed</option><option value="failed">Failed</option><option value="not_applicable">N/A</option></select></label><button type="button" className="mt-5 rounded-lg p-2 text-status-danger-fg hover:bg-status-danger-bg" aria-label={`Remove diagnostic check ${index + 1}`} disabled={props.checks.length === 1} onClick={() => props.setChecks(props.checks.filter((_, current) => current !== index))}><Trash2 className="h-4 w-4" /></button></div><label className="mt-2 block text-xs font-bold">Observed result<textarea className="input-field mt-1 w-full" rows={2} value={check.result} onChange={(event) => updateCheck(index, { result: event.target.value })} placeholder="Include values, error codes and relevant measurements" /></label></div>)}</div></div>

    <div className="rounded-xl border border-border/50 bg-surface-container p-4"><div className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4 text-status-warning-fg" />Analysis and handoff</div><label className="mt-3 block text-sm font-bold">Suspected root cause<textarea className="input-field mt-1 w-full" rows={2} value={props.suspectedCause} onChange={(event) => props.setSuspectedCause(event.target.value)} placeholder="Most likely cause based on the recorded checks" /></label>{props.outcome === 'resolved' ? <label className="mt-3 block text-sm font-bold">Resolution applied<textarea className="input-field mt-1 w-full" rows={3} value={props.resolutionSummary} onChange={(event) => props.setResolutionSummary(event.target.value)} placeholder="Exact remediation and verification performed" /></label> : <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-bold">Why this must continue<textarea className="input-field mt-1 w-full" rows={3} value={props.escalationReason} onChange={(event) => props.setEscalationReason(event.target.value)} placeholder="Technical reason this level cannot resolve it" /></label><label className="text-sm font-bold">Recommended next action<textarea className="input-field mt-1 w-full" rows={3} value={props.nextAction} onChange={(event) => props.setNextAction(event.target.value)} placeholder="What IT 2, the client or Services should do next" /></label></div>}</div>
    <div className="rounded-xl border border-border/50 bg-surface-container p-4"><EvidenceField value={props.evidenceText} onChange={props.setEvidenceText} attachments={props.attachments} /><p className="mt-2 text-xs text-on-surface-variant">Attach logs, screenshots, monitoring links or ticket attachment references that support the diagnosis.</p></div>
  </div>;
}

function DynamicTroubleshootingForm({ experience, outcome, step, data, onChange, attachments, onEvidenceChange }: { experience: IncidentWorkExperience; outcome: WorkOutcome; step: number; data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void; attachments: TicketAttachment[]; onEvidenceChange: (value: string) => void }) {
  const section = experience.sections[Math.min(step, experience.sections.length - 1)];
  const required = new Set([...experience.fields.filter((field) => field.required).map((field) => field.key), ...(experience.outcomes.find((item) => item.code === outcome)?.requiredFields ?? [])]);
  const outcomeOnly = new Set(experience.outcomes.flatMap((item) => item.requiredFields));
  const fields = section.fieldKeys.map((key) => experience.fields.find((field) => field.key === key)).filter((field): field is IncidentWorkExperienceField => Boolean(field)).filter((field) => !outcomeOnly.has(field.key) || required.has(field.key));
  return <div className="grid min-h-[32rem] gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]" data-testid="troubleshooting-diagnostic-form">
    <nav className="space-y-2 border-r border-border/40 pr-4" aria-label="Diagnostic form sections">{experience.sections.map((candidate, index) => <div key={candidate.id} className={`rounded-xl border px-3 py-3 ${index === step ? 'border-primary/50 bg-primary/10' : index < step ? 'border-status-success-border bg-status-success-bg' : 'border-transparent bg-surface-container'}`}><div className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-black ${index === step ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>{index + 1}</span><span className="text-xs font-black">{candidate.title}</span></div></div>)}</nav>
    <section className="min-w-0"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-black uppercase tracking-wider text-primary">Step {step + 1}</p><h3 className="mt-1 text-xl font-black">{section.title}</h3>{section.description && <p className="mt-1 text-sm text-on-surface-variant">{section.description}</p>}</div><div className="mt-4 grid gap-4 md:grid-cols-2">{fields.map((field) => <DynamicField key={field.key} field={field} required={required.has(field.key)} value={data[field.key]} onChange={(value) => { const next = { ...data, [field.key]: value }; onChange(next); if (field.evidence) onEvidenceChange(asStringArray(value).join('\n')); }} attachments={attachments} />)}</div></section>
  </div>;
}

function DynamicField({ field, required, value, onChange, attachments }: { field: IncidentWorkExperienceField; required: boolean; value: unknown; onChange: (value: unknown) => void; attachments: TicketAttachment[] }) {
  const label = <span>{field.label}{required ? ' *' : ''}</span>;
  if (field.type === 'diagnostic_checks') {
    const checks = asDiagnosticChecks(value); const rows = checks.length ? checks : [emptyDiagnosticCheck()];
    return <fieldset className="md:col-span-2 rounded-2xl border border-border/50 bg-surface-container p-4"><div className="flex items-center justify-between"><legend className="font-black">{label}</legend><button type="button" className="secondary-button" onClick={() => onChange([...rows, emptyDiagnosticCheck()])}><Plus className="h-4 w-4" />Add check</button></div><div className="mt-3 space-y-3">{rows.map((check, index) => <div key={index} className="rounded-xl border border-border/40 bg-surface-container-low p-3"><div className="grid gap-2 lg:grid-cols-[10rem_1fr_8rem_auto]"><select aria-label={`Check ${index + 1} category`} className="input-field" value={check.category} onChange={(event) => onChange(rows.map((item, current) => current === index ? { ...item, category: event.target.value } : item))}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select><input aria-label={`Check ${index + 1} performed`} className="input-field" value={check.action} placeholder="Check performed" onChange={(event) => onChange(rows.map((item, current) => current === index ? { ...item, action: event.target.value } : item))} /><select aria-label={`Check ${index + 1} status`} className="input-field" value={check.status} onChange={(event) => onChange(rows.map((item, current) => current === index ? { ...item, status: event.target.value as IncidentDiagnosticCheck['status'] } : item))}><option value="passed">Passed</option><option value="failed">Failed</option><option value="not_applicable">N/A</option></select><button type="button" className="rounded-lg p-2 text-status-danger-fg" aria-label={`Remove diagnostic check ${index + 1}`} disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, current) => current !== index))}><Trash2 className="h-4 w-4" /></button></div><textarea aria-label={`Check ${index + 1} observed result`} className="input-field mt-2 w-full" rows={2} value={check.result} placeholder="Observed result, values and error codes" onChange={(event) => onChange(rows.map((item, current) => current === index ? { ...item, result: event.target.value } : item))} /></div>)}</div></fieldset>;
  }
  if (field.type === 'boolean') return <fieldset className="rounded-xl border border-border/50 p-3"><legend className="text-sm font-bold">{label}</legend><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" className={value === true ? 'primary-button' : 'secondary-button'} onClick={() => onChange(true)}>Yes</button><button type="button" className={value === false ? 'primary-button' : 'secondary-button'} onClick={() => onChange(false)}>No</button></div></fieldset>;
  if (field.type === 'select') return <label className="text-sm font-bold">{label}<select className="input-field mt-2 w-full" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>{field.helpText && <small className="mt-1 block text-on-surface-variant">{field.helpText}</small>}</label>;
  if (field.type === 'multiselect') return <fieldset className="rounded-xl border border-border/50 p-3"><legend className="text-sm font-bold">{label}</legend><div className="mt-2 flex flex-wrap gap-2">{field.options.map((option) => { const selected = asStringArray(value).includes(option); return <button type="button" key={option} className={selected ? 'primary-button' : 'secondary-button'} onClick={() => onChange(selected ? asStringArray(value).filter((item) => item !== option) : [...asStringArray(value), option])}>{option}</button>; })}</div></fieldset>;
  if (field.type === 'list') return <label className="text-sm font-bold md:col-span-2">{label}<textarea className="input-field mt-2 w-full" rows={3} value={asStringArray(value).join('\n')} placeholder={field.placeholder ?? (field.evidence && attachments[0] ? `Available attachment: ${attachments[0].fileName}` : '')} onChange={(event) => onChange(event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} />{field.helpText && <small className="mt-1 block text-on-surface-variant">{field.helpText}</small>}</label>;
  if (field.type === 'textarea') return <label className="text-sm font-bold">{label}<textarea className="input-field mt-2 w-full" rows={4} value={String(value ?? '')} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />{field.helpText && <small className="mt-1 block text-on-surface-variant">{field.helpText}</small>}</label>;
  return <label className="text-sm font-bold">{label}<input className="input-field mt-2 w-full" type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type} value={String(value ?? '')} placeholder={field.placeholder} onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)} />{field.helpText && <small className="mt-1 block text-on-surface-variant">{field.helpText}</small>}</label>;
}

function asStringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []; }
function firstFormSummary(data: Record<string, unknown>): string { for (const value of Object.values(data)) { if (typeof value === 'string' && value.trim()) return value.trim(); if (Array.isArray(value)) { const text = value.find((item) => typeof item === 'string' && item.trim()); if (typeof text === 'string') return text.trim(); } } return 'Completed'; }
function asDiagnosticChecks(value: unknown): IncidentDiagnosticCheck[] { return Array.isArray(value) ? value.filter((item): item is IncidentDiagnosticCheck => Boolean(item) && typeof item === 'object').map((item) => ({ category: String(item.category ?? ''), action: String(item.action ?? ''), result: String(item.result ?? ''), status: ['passed','failed','not_applicable'].includes(String(item.status)) ? item.status : 'passed' })) : []; }
function experienceIsValid(experience: IncidentWorkExperience, outcome: WorkOutcome, data: Record<string, unknown>): boolean { const required = new Set([...experience.fields.filter((field) => field.required).map((field) => field.key), ...(experience.outcomes.find((item) => item.code === outcome)?.requiredFields ?? [])]); return [...required].every((key) => { const field = experience.fields.find((item) => item.key === key); const value = data[key]; if (!field) return false; if (field.type === 'diagnostic_checks') return asDiagnosticChecks(value).length > 0 && asDiagnosticChecks(value).every((check) => check.category && check.action.trim() && check.result.trim()); if (field.type === 'list' || field.type === 'multiselect') return asStringArray(value).length > 0; if (field.type === 'boolean') return typeof value === 'boolean'; return String(value ?? '').trim().length > 0; }); }

function TroubleshootingSummary({ report }: { report: IncidentTroubleshootingReport }) {
  return <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4" data-testid="troubleshooting-report-summary"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-wider text-primary">Structured diagnostic report</p><span className="text-xs text-on-surface-variant">{report.checks.length} check{report.checks.length === 1 ? '' : 's'} · {report.affectedServices.length} affected item{report.affectedServices.length === 1 ? '' : 's'}</span></div><div className="mt-3 grid gap-3 md:grid-cols-2"><div><p className="text-[10px] font-black uppercase text-on-surface-variant">Observed symptom</p><p className="mt-1 text-sm text-on-surface">{report.symptomSummary}</p></div><div><p className="text-[10px] font-black uppercase text-on-surface-variant">Suspected cause</p><p className="mt-1 text-sm text-on-surface">{report.suspectedCause}</p></div></div><div className="mt-3 space-y-2">{report.checks.map((check, index) => <div key={index} className="grid gap-1 rounded-lg border border-border/30 bg-surface-container px-3 py-2 text-xs md:grid-cols-[8rem_1fr_1fr]"><span className={check.status === 'failed' ? 'font-black text-status-danger-fg' : check.status === 'passed' ? 'font-black text-status-success-fg' : 'font-black text-on-surface-variant'}>{check.category} · {check.status.replace('_', ' ')}</span><span>{check.action}</span><span className="text-on-surface-variant">{check.result}</span></div>)}</div><p className="mt-3 text-sm font-semibold text-on-surface">{report.resolutionSummary || report.escalationReason}</p>{report.nextAction && <p className="mt-1 text-xs text-on-surface-variant">Next: {report.nextAction}</p>}</div>;
}
