import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Search } from 'lucide-react';
import { listKnowledge, type KnowledgeArticle } from './api';

/**
 * MERGE NOTE (origin/main -> services/pr2-invoice-workflow-embed-stepper).
 *
 * This branch had replaced this screen with an honest "no backend yet"
 * empty state, because at the time there was no service behind a knowledge
 * base and the previous screen was 100% fabricated data.
 *
 * That premise is now stale: `knowledge_service` exists and main shipped a
 * real implementation against it (`./api` -> `/knowledge/articles` through
 * the Gateway). The real implementation is therefore what survives the
 * merge — keeping the empty state would have deleted a shipped feature and
 * kept a comment that is no longer true.
 *
 * Follow-up 1 is now DONE: `FRONTEND/e2e/beta-ux-honesty.spec.ts` asserted
 * that this screen and ArticleDetail were "honest about having no backend",
 * which contradicted reality after the merge. Those tests were rewritten
 * against the real list/detail (real data renders, the old fabricated
 * KB-1024 fixtures stay gone, the counter is derived from the response, and
 * a 500/404 says so) rather than deleted.
 *
 * Still open, and NOT decided here (needs a human call):
 *  2. App.tsx renders this component on BOTH `/app/knowledge` (agent) and
 *     `/portal/knowledge` (end user), but the navigation below is absolute
 *     `/app/knowledge*` as main wrote it, and `/knowledge/new` only exists
 *     on the agent surface. On the portal this offers a destination the
 *     requester cannot reach. Left as main shipped it rather than guessing
 *     whether the portal should expose authoring at all.
 */
export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      listKnowledge(query).then(setArticles).catch(() => setError('Could not load the authorized manuals.'));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <div className="p-6 lg:p-8 w-full space-y-8">
    <div className="text-center space-y-4">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em]">{articles.length} manuals available</div>
      <div className="flex items-center justify-center gap-4"><h1 className="text-4xl font-black text-on-surface">Knowledge Base</h1><button onClick={() => navigate('/app/knowledge/new')} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-black hover:bg-cyan-400"><Plus className="w-4 h-4" />New manual</button></div>
      <p className="text-on-surface-variant">Manuals and procedures authorized for your audience.</p>
      <div className="relative max-w-2xl mx-auto"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search manuals..." className="w-full bg-surface-container-low border border-cyan-500/30 text-on-surface rounded-2xl pl-12 pr-6 py-4 focus:outline-none" /></div>
    </div>
    {error && <p className="text-center text-red-400">{error}</p>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {articles.map(article => <button key={article.id} onClick={() => navigate(`/app/knowledge/${article.numero_visible}`)} className="text-left group flex gap-4 p-5 rounded-3xl bg-surface-container-low border border-border hover:border-cyan-500/30">
        <BookOpen className="w-5 h-5 text-cyan-400 mt-1" /><div className="min-w-0"><p className="font-bold text-on-surface group-hover:text-cyan-400">{article.titulo}</p><p className="text-sm text-on-surface-variant mt-1">{article.categoria} · {article.etiquetas.join(', ')}</p><p className="font-mono text-xs text-cyan-500/80 mt-3">{article.numero_visible} · v{article.version}</p></div>
      </button>)}
    </div>
    {!error && articles.length === 0 && <p className="text-center text-on-surface-variant">No manuals match your search.</p>}
  </div>;
}
