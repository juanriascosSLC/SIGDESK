import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';

/**
 * There is no backend service for a knowledge base yet — no endpoint to
 * list categories, list or search articles, or read one. `rag_service`
 * indexes and searches *tickets* for the RAG chatbot; it has no concept of
 * a knowledge-base article and isn't a substitute for one.
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
        <EmptyState
          icon="general"
          title="Knowledge Base is not available yet"
          description="SIG-DESK doesn't have a backend service for knowledge-base articles yet. This section will become active once that capability ships — nothing here is functional in the meantime."
        />
      </div>
    </div>
  );
}
