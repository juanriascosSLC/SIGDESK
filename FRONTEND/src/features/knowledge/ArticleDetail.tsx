import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';
import { apiRequest } from '@/lib/apiClient';

type PublishedArticle = {
  numero_visible: string;
  titulo: string;
  contenido: string;
  audiencia: string;
};

/**
 * See KnowledgeBase.tsx — the service is wired into the stack, while the
 * authenticated read contract for article details is still pending.
 * This screen used to render the exact same fabricated HIKVISION-camera
 * article content for every `:id`, complete with a made-up author, view
 * count, "helpful" vote counts, a fake related-articles list, and
 * print/share buttons with no handler. None of that is real. The route is
 * kept (not removed) so an existing `/knowledge/:id` link — from a ticket
 * comment, a bookmark, wherever — lands on an honest message instead of a
 * 404. `..` correctly resolves to `/app/knowledge` or `/portal/knowledge`
 * depending on which audience rendered this route.
 */
export default function ArticleDetail() {
  const { id } = useParams();
  const article = useQuery({
    queryKey: ['knowledge-article', id],
    queryFn: () => apiRequest<PublishedArticle>(`/knowledge/articulos/${encodeURIComponent(id ?? '')}`),
    enabled: Boolean(id),
  });

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
        {article.isLoading ? <EmptyState icon="general" title="Loading article" description="Loading the published article…" /> : article.isError ? <EmptyState icon="general" title="Could not load article" description={article.error.message} /> : <article className="p-6"><div className="text-xs text-on-surface-variant">{article.data?.numero_visible} · {article.data?.audiencia}</div><h1 className="mt-2 text-2xl font-bold text-on-surface">{article.data?.titulo}</h1><div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-on-surface-variant">{article.data?.contenido}</div></article>}
      </div>
    </div>
  );
}
