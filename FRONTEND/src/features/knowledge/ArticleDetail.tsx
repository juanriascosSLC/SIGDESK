import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';

/**
 * See KnowledgeBase.tsx — there is no backend for knowledge-base articles.
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
        <EmptyState
          icon="general"
          title="Knowledge Base is not available yet"
          description="SIG-DESK doesn't have a backend service for knowledge-base articles yet. This section will become active once that capability ships — nothing here is functional in the meantime."
        />
      </div>
    </div>
  );
}
