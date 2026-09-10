import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '@/lib/apiClient';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';

type Source = { type: string; id: string };
type Item = { id: string; rating: 'useful' | 'not_useful'; status: string; question: string; answer: string; sources: Source[]; comment?: string; created_at: string; classification?: string; expected_answer?: string; expected_sources?: Source[]; promote_to_evaluation?: boolean };
type Metrics = { useful: number; not_useful: number; open: number; promoted: number };
const classifications = ['knowledge_article', 'prompt_rule', 'ticket_data_gap', 'retrieval_tuning', 'no_action'];

function sourceText(sources: Source[] = []) { return sources.map((source) => `${source.type}/${source.id}`).join(', '); }
function parseSources(value: string): Source[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const slash = part.indexOf('/');
    return slash > 0 ? { type: part.slice(0, slash).trim(), id: part.slice(slash + 1).trim() } : { type: '', id: '' };
  });
}

export default function AssistantFeedback() {
  const { can } = useAuth();
  const [items, setItems] = useState<Item[]>([]); const [metrics, setMetrics] = useState<Metrics | null>(null); const [status, setStatus] = useState('open'); const [selected, setSelected] = useState<Item | null>(null); const [classification, setClassification] = useState('no_action'); const [note, setNote] = useState(''); const [expectedAnswer, setExpectedAnswer] = useState(''); const [expectedSources, setExpectedSources] = useState(''); const [promote, setPromote] = useState(false); const [error, setError] = useState('');
  const load = async () => { try { const [feedback, summary] = await Promise.all([apiRequest<{ items: Item[] }>(`/ia_advisor/admin/feedback?status=${status}`), apiRequest<Metrics>('/ia_advisor/admin/feedback/metrics')]); setItems(feedback.items); setMetrics(summary); setSelected(null); } catch { setError('No fue posible cargar la cola de feedback.'); } };
  useEffect(() => { void load(); }, [status]);
  const choose = (item: Item) => { setSelected(item); setClassification(item.classification ?? 'no_action'); setNote(''); setExpectedAnswer(item.expected_answer ?? ''); setExpectedSources(sourceText(item.expected_sources?.length ? item.expected_sources : item.sources)); setPromote(Boolean(item.promote_to_evaluation)); setError(''); };
  const resolve = async (next: 'reviewed' | 'resolved') => {
    if (!selected) return;
    const sources = parseSources(expectedSources);
    if (promote && (!expectedAnswer.trim() || !sources.length || sources.some((source) => !source.type || !source.id))) { setError('Para promover el caso, registra una respuesta y al menos una fuente esperada.'); return; }
    try { await apiRequest(`/ia_advisor/admin/feedback/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status: next, classification, resolution_note: note, expected_answer: expectedAnswer, expected_sources: sources, promote_to_evaluation: promote }) }); await load(); } catch { setError('No fue posible actualizar el reporte.'); }
  };
  return <main className="mx-auto max-w-6xl p-6 text-on-surface"><h1 className="text-2xl font-bold">Assistant feedback</h1><p className="mt-1 text-sm text-on-surface-variant">Review one turn with its evidence. Promotion creates an offline evaluation case; it never changes the model, prompt, or Knowledge Base automatically.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-4">{[{ label: 'Useful', value: metrics?.useful }, { label: 'Not useful', value: metrics?.not_useful }, { label: 'Open', value: metrics?.open }, { label: 'Evaluation cases', value: metrics?.promoted }].map((metric) => <div key={metric.label} className="rounded-xl border border-border bg-surface-container p-4"><p className="text-xs text-on-surface-variant">{metric.label}</p><p className="mt-1 text-2xl font-bold">{metric.value ?? '—'}</p></div>)}</div>
    <div className="mt-5 flex flex-wrap gap-3"><label className="text-sm">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="ml-2 rounded border border-border bg-surface-container p-2"><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></label>{error && <span role="alert" className="self-center text-sm text-red-400">{error}</span>}</div>
    <div className="mt-5 grid gap-5 md:grid-cols-2"><section className="space-y-3">{items.map((item) => <button type="button" key={item.id} onClick={() => choose(item)} className={`block w-full rounded-xl border bg-surface-container p-4 text-left transition-colors ${selected?.id === item.id ? 'border-cyan-400' : 'border-border hover:border-cyan-400/50'}`}><div className="text-xs text-cyan-300">{item.rating === 'useful' ? 'Useful' : 'Not useful'} · {item.status}{item.promote_to_evaluation ? ' · Evaluation case' : ''}</div><p className="mt-2 line-clamp-2">{item.question}</p><p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{item.comment || item.answer}</p></button>)}{!items.length && <p className="text-on-surface-variant">No feedback in this state.</p>}</section>
      {selected && <aside className="rounded-xl border border-border bg-surface-container p-5"><h2 className="font-bold">Review and improve</h2><p className="mt-3 text-sm"><b>Question:</b> {selected.question}</p><p className="mt-3 whitespace-pre-wrap text-sm"><b>Answer received:</b> {selected.answer}</p><p className="mt-3 text-xs text-on-surface-variant">Retrieved sources: {sourceText(selected.sources) || 'none'}</p><label className="mt-5 block text-sm">Classification<select value={classification} onChange={(event) => setClassification(event.target.value)} className="mt-1 block w-full rounded border border-border bg-surface-container-low p-2">{classifications.map((value) => <option key={value}>{value}</option>)}</select></label><label className="mt-3 block text-sm">Review note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should be changed?" className="mt-1 w-full rounded border border-border bg-surface-container-low p-2" rows={3} /></label>
        <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={promote} onChange={(event) => setPromote(event.target.checked)} className="mt-1" /> <span><b>Promote to offline evaluation</b><br /><span className="text-xs text-on-surface-variant">Requires reviewer-approved expected answer and sources. It is used to measure future changes, not to train automatically.</span></span></label>{promote && <><label className="mt-4 block text-sm">Expected answer<textarea value={expectedAnswer} onChange={(event) => setExpectedAnswer(event.target.value)} className="mt-1 w-full rounded border border-border bg-surface-container-low p-2" rows={4} /></label><label className="mt-3 block text-sm">Expected sources <span className="text-xs text-on-surface-variant">(type/id, separated by commas)</span><input value={expectedSources} onChange={(event) => setExpectedSources(event.target.value)} className="mt-1 w-full rounded border border-border bg-surface-container-low p-2" /></label></>}</div>
        <div className="mt-4 flex flex-wrap gap-2">{can(PERMISSIONS.assistantFeedbackManage) && <><button type="button" onClick={() => void resolve('reviewed')} className="rounded bg-surface-container-high px-3 py-2 text-sm">Mark reviewed</button><button type="button" onClick={() => void resolve('resolved')} className="rounded bg-cyan-400 px-3 py-2 text-sm text-slate-950">Resolve</button></>}<Link to="/app/knowledge/new" state={{ feedback: selected }} className="rounded border border-border px-3 py-2 text-sm">Create Knowledge Base draft</Link></div></aside>}</div>
  </main>;
}
