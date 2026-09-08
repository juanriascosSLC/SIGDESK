import { BookOpen, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';
import { apiRequest } from '@/lib/apiClient';

type PublishedArticle = {
  articulo_id: number;
  numero_visible: string;
  titulo: string;
  contenido: string;
  audiencia: string;
  publicado_en: string;
};

/**
 * The Knowledge Base domain is owned by `knowledge_service`; `rag_service`
 * indexes published content for assistant retrieval and is not a substitute
 * for the owner service. The read contract for this screen is still pending.
 *
 * The previous version of this screen was 100% fabricated: hardcoded
 * categories with made-up article counts, a hardcoded "66 articles ·
 * Updated daily" banner, a list of invented articles with made-up
 * view/helpful counts and authors, and a search input with no `onChange` —
 * decorative, not functional. Per "no simulated data or non-functional
 * actions", this now says so honestly instead of pretending to work.
 *
 * Shown identically from both the agent workspace (/app/knowledge) and the
 * end-user portal (/portal/knowledge) — both routes render this same
 * component, so there's exactly one place to keep honest. The route is
 * kept (not removed) so existing links/nav entries don't 404. Replace this
 * with the real thing once a backend contract exists — do not reintroduce
 * local fake data here.
 */
export default function KnowledgeBase() {
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
      />
      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        {health.isLoading ? <EmptyState icon="general" title="Connecting to Knowledge Base" description="Checking the Knowledge Base service through the API gateway…" /> : health.isError ? <EmptyState icon="general" title="Knowledge Base is unavailable" description={health.error.message} /> : articles.isLoading ? <EmptyState icon="general" title="Loading articles" description="Loading published knowledge articles…" /> : articles.isError ? <EmptyState icon="general" title="Could not load articles" description={articles.error.message} /> : <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-surface-container p-3">
            <Search className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles" className="w-full bg-transparent text-sm text-on-surface outline-none" aria-label="Search articles" />
          </div>
          {articles.data?.items.length ? <div className="grid gap-3">{articles.data.items.map((article) => <Link key={article.articulo_id} to={`../knowledge/${article.articulo_id}`} className="rounded-2xl border border-border/40 bg-surface-container p-4 hover:border-primary/60 transition-colors"><div className="text-xs text-on-surface-variant">{article.numero_visible} · {article.audiencia}</div><h2 className="mt-1 font-semibold text-on-surface">{article.titulo}</h2><p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{article.contenido}</p></Link>)}</div> : <EmptyState icon="general" title="No published articles" description={search ? 'No published articles match your search.' : 'There are no published knowledge articles yet.'} />}
        </div>}
      </div>
    </div>
  );
}
