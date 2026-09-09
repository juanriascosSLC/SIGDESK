import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';
import { apiRequest } from '@/lib/apiClient';

/** `GET /knowledge/articulos/{id}` returns this and nothing more. */
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
 * See KnowledgeBase.tsx for the full merge note. Short version: both sides
 * of the merge had a real detail screen, they disagreed on the contract, and
 * the conflict was resolved against `knowledge_service` itself — the route is
 * `GET /knowledge/articulos/{id}` with a NUMERIC articulo_id, not
 * `/knowledge/articles/<numero_visible>`.
 *
 * Kept from this branch: the YAML front-matter stripping (published content
 * is Markdown with a front-matter block — see SIG-Desk-Backend/Docs/knowledge/,
 * and showing it as prose was a real bug) and the permission-aware failure
 * copy. The service answers a wrong id and an unauthorized audience through
 * the same door (`BuscarPublicado` not-found and `PuedeLeer` denial), so one
 * honest message covers both without leaking whether the article exists.
 *
 * Kept from Hector: `..` for the back link, which correctly resolves to
 * `/app/knowledge` or `/portal/knowledge` depending on which surface rendered
 * this route — the absolute `/app/knowledge` this branch had ejected portal
 * users out of their own surface.
 */
export default function ArticleDetail() {
  const { id } = useParams();
  const article = useQuery({
    queryKey: ['knowledge-article', id],
    queryFn: () => apiRequest<PublishedArticle>(`/knowledge/articulos/${encodeURIComponent(id ?? '')}`),
    enabled: Boolean(id),
  });

  const body = article.data?.contenido.replace(/^---[\s\S]*?---\s*/, '') ?? '';

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <Link to=".." className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to Knowledge Base
      </Link>
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
        {article.isLoading ? (
          <EmptyState icon="general" title="Loading manual" description="Loading the published manual…" />
        ) : article.isError ? (
          <EmptyState
            icon="general"
            title="Could not load article"
            description="That manual does not exist, or you do not have permission to view it."
          />
        ) : (
          <article className="p-6">
            <div className="font-mono text-xs text-cyan-500">
              {article.data?.numero_visible} · v{article.data?.version} · {article.data?.audiencia}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-on-surface">{article.data?.titulo}</h1>
            <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-on-surface-variant">{body}</div>
          </article>
        )}
      </div>
    </div>
  );
}
