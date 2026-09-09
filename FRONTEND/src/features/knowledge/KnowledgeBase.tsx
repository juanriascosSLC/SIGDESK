import { BookOpen, Plus, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';
import { apiRequest } from '@/lib/apiClient';

/**
 * Shape returned by `GET /knowledge/articulos` — this is the published read
 * model exactly as `knowledge_service` emits it (`ArticuloPublicado` in
 * application/ports/repository_port.go). Nothing is added to it here: there
 * is deliberately no `categoria` and no `etiquetas`, because the service
 * does not return them.
 */
type PublishedArticle = {
  articulo_id: number;
  numero_visible: string;
  version: number;
  titulo: string;
  contenido: string;
  audiencia: string;
  publicado_en: string;
};

/**
 * MERGE NOTE (origin/Hector -> services/pr2-invoice-workflow-embed-stepper).
 *
 * Both sides of this merge shipped a REAL Knowledge Base screen — the
 * "no backend yet" empty state is dead on both, because `knowledge_service`
 * exists. The two implementations disagreed on the contract, so the conflict
 * was resolved against the service itself rather than by preferring a side:
 *
 *   `SIG-Desk-Backend/knowledge_service/adapters/in/http_controller.go`
 *   registers `GET /knowledge/articulos` and `GET /knowledge/articulos/{id}`
 *   (with `{id}` parsed via strconv.ParseInt, i.e. the numeric articulo_id).
 *
 * There is no `/knowledge/articles` route and no lookup by `numero_visible`.
 * This branch's previous version called `/knowledge/articles?q=`, navigated
 * by `numero_visible`, and rendered `categoria` / `etiquetas` — three things
 * the Gateway never serves. It passed only because this suite's own mocks
 * were written against that same wrong path. Per the project invariant we do
 * not change the Gateway contract assuming the backend will adapt, so the
 * verified `articulos` contract wins.
 *
 * What this branch contributed and is KEPT here: the derived counter badge
 * (computed from the response, never an invented total) and the authoring
 * entry point.
 *
 * Still open, and NOT decided here (needs a human call — carried forward
 * unchanged from the previous merge note):
 *  - App.tsx renders this component on BOTH `/app/knowledge` (agent) and
 *    `/portal/knowledge` (end user), but `/knowledge/new` only exists on the
 *    agent surface, and the navigation below is absolute `/app/knowledge/new`.
 *    On the portal this offers a destination the requester cannot reach.
 *    Left as shipped rather than guessing whether the portal should expose
 *    authoring at all.
 *  - `./api.ts` (listKnowledge/getKnowledge/createDraft/updateDraft/
 *    publishDraft) and KnowledgeEditor.tsx still target `/knowledge/articles`
 *    and a PATCH update route that `knowledge_service` does not expose.
 *    Out of scope for a conflict resolution; flagged, not silently rewritten.
 */
export default function KnowledgeBase() {
  const navigate = useNavigate();
  const health = useQuery({
    queryKey: ['knowledge-service-health'],
    queryFn: () => apiRequest<{ status: string; service: string }>('/knowledge/health'),
    retry: 1,
  });
  const [search, setSearch] = useState('');
  const articles = useQuery({
    queryKey: ['knowledge-articles', search],
    queryFn: () => apiRequest<{ items: PublishedArticle[] }>(`/knowledge/articulos${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`),
    enabled: health.isSuccess,
  });

  const items = articles.data?.items ?? [];

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <PageHeader
        eyebrow={
          <div className="mb-1 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Self Service</span>
          </div>
        }
        title="Knowledge Base"
        description="Find answers, guides and standard procedures before opening a ticket."
        actions={
          <div className="flex items-center gap-3">
            {/* Derived from the response, never an invented total. */}
            {articles.isSuccess && (
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">
                {items.length} manuals available
              </span>
            )}
            <button
              type="button"
              onClick={() => navigate('/app/knowledge/new')}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-black hover:bg-cyan-400"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />New manual
            </button>
          </div>
        }
      />
      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        {health.isLoading ? <EmptyState icon="general" title="Connecting to Knowledge Base" description="Checking the Knowledge Base service through the API gateway…" /> : health.isError ? <EmptyState icon="general" title="Knowledge Base is unavailable" description={health.error.message} /> : articles.isLoading ? <EmptyState icon="general" title="Loading articles" description="Loading published knowledge articles…" /> : articles.isError ? <EmptyState icon="general" title="Could not load articles" description="Could not load the authorized manuals." /> : <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-surface-container p-3">
            <Search className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles" className="w-full bg-transparent text-sm text-on-surface outline-none" aria-label="Search articles" />
          </div>
          {items.length ? <div className="grid gap-3">{items.map((article) => <Link key={article.articulo_id} to={`../knowledge/${article.articulo_id}`} className="rounded-2xl border border-border/40 bg-surface-container p-4 hover:border-primary/60 transition-colors"><div className="text-xs text-on-surface-variant">{article.numero_visible} · v{article.version} · {article.audiencia}</div><h2 className="mt-1 font-semibold text-on-surface">{article.titulo}</h2><p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{article.contenido}</p></Link>)}</div> : <EmptyState icon="general" title="No published articles" description={search ? 'No manuals match your search.' : 'There are no published knowledge articles yet.'} />}
        </div>}
      </div>
    </div>
  );
}
