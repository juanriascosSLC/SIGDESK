import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, Play, RotateCcw, Wrench } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { formatDateTime } from '@/i18n/format';
import type { IncidentWorkItem, IncidentWorkTransitionInput, TicketAttachment } from '../types';

interface Props {
	items: IncidentWorkItem[];
	attachments: TicketAttachment[];
	loading: boolean;
	error?: string;
	canManage: boolean;
	pending: boolean;
	onRetry: () => void;
	onTransition: (workItemId: number, input: IncidentWorkTransitionInput) => void;
}

type DialogAction = 'resolve' | 'require_service' | 'cancel' | 'reopen';

const labels: Record<IncidentWorkItem['status'], string> = {
	pending: 'Pending', in_progress: 'In progress', resolved: 'Resolved',
	service_required: 'Service required', canceled: 'Canceled',
};

function statusTone(status: IncidentWorkItem['status']) {
	if (status === 'resolved') return 'border-status-success-border bg-status-success-bg text-status-success-fg';
	if (status === 'service_required') return 'border-status-warning-border bg-status-warning-bg text-status-warning-fg';
	if (status === 'canceled') return 'border-border bg-surface-container text-on-surface-variant';
	return 'border-primary/30 bg-primary/10 text-primary';
}

export function IncidentWorkPanel({ items, attachments, loading, error, canManage, pending, onRetry, onTransition }: Props) {
	const [selected, setSelected] = useState<IncidentWorkItem>();
	const [action, setAction] = useState<DialogAction>();
	const [notes, setNotes] = useState('');
	const [evidenceText, setEvidenceText] = useState('');
	const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
	const [now, setNow] = useState(0);
	useEffect(() => {
		const update = () => setNow(Date.now());
		update();
		const timer = window.setInterval(update, 60_000);
		return () => window.clearInterval(timer);
	}, []);

	const evidence = useMemo(() => [
		...attachmentIds.map((id) => `attachment:${id}`),
		...evidenceText.split('\n').map((value) => value.trim()).filter(Boolean),
	], [attachmentIds, evidenceText]);

	function open(item: IncidentWorkItem, nextAction: DialogAction) {
		setSelected(item); setAction(nextAction); setNotes(''); setEvidenceText(''); setAttachmentIds([]);
	}

	function close() {
		if (pending) return;
		setSelected(undefined); setAction(undefined);
	}

	function submit() {
		if (!selected || !action) return;
		onTransition(selected.id, {
			transition: action,
			...(action === 'reopen' ? { reopenReason: notes.trim() } : { notes: notes.trim() }),
			...((action === 'resolve' || action === 'require_service') ? { evidence } : {}),
		});
		close();
	}

	if (loading) return <section className="mb-6 rounded-2xl border border-border/40 bg-surface-container-low p-5 text-sm text-on-surface-variant">Loading incident work…</section>;
	if (error) return <section className="mb-6 rounded-2xl border border-status-danger-border bg-status-danger-bg p-5"><p className="font-bold text-status-danger-fg">Incident work is unavailable</p><p className="mt-1 text-sm text-on-surface-variant">{error}</p><button type="button" className="secondary-button mt-3" onClick={onRetry}>Retry</button></section>;
	if (items.length === 0) return null;

	return (
		<section className="mb-6 rounded-2xl border border-border/50 bg-surface-container-low p-5" data-testid="incident-work-panel">
			<div className="flex items-start gap-3">
				<div className="rounded-xl bg-primary/10 p-2 text-primary"><ClipboardList className="h-5 w-5" /></div>
				<div><h2 className="font-black text-on-surface">Incident work</h2><p className="mt-1 text-xs text-on-surface-variant">Operational troubleshooting owned by this incident's current assignment.</p></div>
			</div>
			<div className="mt-4 space-y-3">
				{items.map((item) => {
					const overdue = Boolean(now && item.dueAt && !item.completedAt && new Date(item.dueAt).getTime() < now);
					return <article key={item.id} className="rounded-xl border border-border/40 bg-surface-container p-4" data-testid={`incident-work-${item.id}`}>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-on-surface">{item.title}</h3>{item.required && <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary">Required</span>}</div><p className="mt-1 text-sm text-on-surface-variant">{item.instructions}</p></div>
							<span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusTone(item.status)}`}>{labels[item.status]}</span>
						</div>
						{item.dueAt && <p className={`mt-3 flex items-center gap-1.5 text-xs ${overdue ? 'font-bold text-status-danger-fg' : 'text-on-surface-variant'}`}>{overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{overdue ? 'Overdue since ' : 'Due '}{formatDateTime(item.dueAt, 'en-US')}</p>}
						{item.outcomeNotes && <div className="mt-3 rounded-lg border border-border/30 bg-surface-container-low p-3 text-sm"><p className="font-bold text-on-surface">Outcome</p><p className="mt-1 text-on-surface-variant">{item.outcomeNotes}</p>{item.evidence.length > 0 && <ul className="mt-2 list-inside list-disc text-xs text-on-surface-variant">{item.evidence.map((value) => <li key={value}>{value}</li>)}</ul>}</div>}
						{canManage && <div className="mt-4 flex flex-wrap gap-2">
							{item.status === 'pending' && <button type="button" disabled={pending} className="primary-button" onClick={() => onTransition(item.id, { transition: 'start' })}><Play className="h-4 w-4" /> Start troubleshooting</button>}
							{item.status === 'in_progress' && <><button type="button" disabled={pending} className="primary-button" onClick={() => open(item, 'resolve')}><CheckCircle2 className="h-4 w-4" /> Resolved by IT</button><button type="button" disabled={pending} className="secondary-button" onClick={() => open(item, 'require_service')}><Wrench className="h-4 w-4" /> Service required</button>{!item.required && <button type="button" disabled={pending} className="secondary-button" onClick={() => open(item, 'cancel')}>Cancel</button>}</>}
							{['resolved', 'service_required', 'canceled'].includes(item.status) && <button type="button" disabled={pending} className="secondary-button" onClick={() => open(item, 'reopen')}><RotateCcw className="h-4 w-4" /> Reopen work</button>}
						</div>}
					</article>;
				})}
			</div>
			<Dialog open={Boolean(selected && action)} onClose={close} preventDismiss={pending} title={action === 'require_service' ? 'Request Services follow-up' : action === 'resolve' ? 'Resolve troubleshooting' : action === 'reopen' ? 'Reopen incident work' : 'Cancel incident work'} description={action === 'require_service' ? 'Document why IT could not resolve the incident. This becomes the handoff evidence for approval and field work.' : undefined} footer={<><button type="button" className="secondary-button" disabled={pending} onClick={close}>Cancel</button><button type="button" className="primary-button" disabled={pending || !notes.trim() || ((action === 'resolve' || action === 'require_service') && evidence.length === 0)} onClick={submit}>Confirm</button></>}>
				<label className="block text-xs font-bold text-on-surface">{action === 'reopen' ? 'Reason' : 'Notes'}<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} className="input-field mt-2 w-full resize-y" required /></label>
				{(action === 'resolve' || action === 'require_service') && <div className="mt-4"><p className="text-xs font-bold text-on-surface">Evidence (required)</p>{attachments.length > 0 && <div className="mt-2 space-y-2">{attachments.map((attachment) => <label key={attachment.id} className="flex items-center gap-2 text-sm text-on-surface-variant"><input type="checkbox" checked={attachmentIds.includes(attachment.id)} onChange={(event) => setAttachmentIds((current) => event.target.checked ? [...current, attachment.id] : current.filter((id) => id !== attachment.id))} /> {attachment.fileName}</label>)}</div>}<textarea rows={3} value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} className="input-field mt-2 w-full resize-y" placeholder="One evidence reference per line: test output, monitoring link, log reference…" /><p className="mt-1 text-[11px] text-on-surface-variant">Select an uploaded attachment or add at least one verifiable reference.</p></div>}
			</Dialog>
		</section>
	);
}
