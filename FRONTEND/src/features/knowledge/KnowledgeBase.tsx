import { BookOpen, FileText, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';
import { apiRequest } from '@/lib/apiClient';
import { knowledgeCollection, knowledgeCollectionLabel, knowledgeExcerpt, type KnowledgeCollection } from './articlePresentation';

type PublishedArticle = { articulo_id: number; numero_visible: string; titulo: string; contenido: string; audiencia: string; publicado_en: string };

/** The API owns access. Collections are Markdown-derived navigation aids. */
export default function KnowledgeBase() {
  const health = useQuery({ queryKey: ['knowledge-service-health'], queryFn: () => apiRequest<{ status: string; service: string }>('/knowledge/health'), retry: 1 });
  const [search, setSearch] = useState('');
  const [collection, setCollection] = useState<KnowledgeCollection>('all');
  const articles = useQuery({
    queryKey: ['knowledge-articles', search],
    queryFn: () => apiRequest<{ items: PublishedArticle[] }>(`/knowledge/articulos${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`),
    enabled: health.isSuccess,
  });
  const allArticles = articles.data?.items ?? [];
  const visibleArticles = allArticles.filter((article) => collection === 'all' || knowledgeCollection(article.titulo, article.contenido) === collection);
  const collectionCounts = allArticles.reduce<Record<KnowledgeCollection, number>>((counts, article) => {
    counts.all += 1;
    counts[knowledgeCollection(article.titulo, article.contenido)] += 1;
    return counts;
  }, { all: 0, guide: 0, manual: 0, article: 0 });
  const collections: Array<{ id: KnowledgeCollection; label: string }> = [
    { id: 'all', label: 'All knowledge' }, { id: 'guide', label: 'Guides' }, { id: 'manual', label: 'Manuals' }, { id: 'article', label: 'Articles' },
  ];

  return <div className="p-6 lg:p-8 w-full space-y-6">
    <PageHeader eyebrow={<div className="mb-1 flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" aria-hidden="true" /><span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Self Service</span></div>} title="Knowledge Base" description="Find answers, guides and standard procedures before opening a ticket." />
    <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
      {health.isLoading ? <EmptyState icon="general" title="Connecting to Knowledge Base" description="Checking the Knowledge Base service through the API gateway…" /> : health.isError ? <EmptyState icon="general" title="Knowledge Base is unavailable" description={health.error.message} /> : articles.isLoading ? <EmptyState icon="general" title="Loading articles" description="Loading published knowledge articles…" /> : articles.isError ? <EmptyState icon="general" title="Could not load articles" description={articles.error.message} /> : <div className="p-6 space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-surface-container p-3"><Search className="h-4 w-4 text-on-surface-variant" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles" className="w-full bg-transparent text-sm text-on-surface outline-none" aria-label="Search articles" /></div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Knowledge collections">
          {collections.map((item) => <button key={item.id} type="button" role="tab" aria-selected={collection === item.id} onClick={() => setCollection(item.id)} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${collection === item.id ? 'border-primary bg-primary/15 text-primary' : 'border-border/50 text-on-surface-variant hover:border-primary/60 hover:text-on-surface'}`}>{item.label} <span className="ml-1 text-xs" aria-label={`${collectionCounts[item.id]} articles`}>({collectionCounts[item.id]})</span></button>)}
        </div>
        {visibleArticles.length ? <div className="grid gap-3">{visibleArticles.map((article) => {
          const articleCollection = knowledgeCollection(article.titulo, article.contenido);
          return <Link key={article.articulo_id} to={`../knowledge/${article.articulo_id}`} className="rounded-2xl border border-border/40 bg-surface-container p-4 hover:border-primary/60 transition-colors"><div className="flex items-center gap-2 text-xs text-on-surface-variant"><FileText className="h-3.5 w-3.5" aria-hidden="true" /><span>{article.numero_visible} · {article.audiencia}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{knowledgeCollectionLabel(articleCollection)}</span></div><h2 className="mt-2 font-semibold text-on-surface">{article.titulo}</h2><p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{knowledgeExcerpt(article.contenido)}</p></Link>;
        })}</div> : <EmptyState icon="general" title="No matching knowledge" description={search ? 'No published articles match your search.' : `There are no ${collection === 'all' ? 'published knowledge articles' : collections.find((item) => item.id === collection)?.label.toLowerCase()} available to you.`} />}
      </div>}
    </div>
  </div>;
}
