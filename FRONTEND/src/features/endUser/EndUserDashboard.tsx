import { Plus, Ticket as TicketIcon, BookOpen, ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

/**
 * This used to show a fabricated "My Recent Tickets" list (INC-202611,
 * REQ-202590 — ids that don't exist) and "Recommended Articles" linking to
 * `href="#"`, plus a search box with no `onChange` — decorative, not
 * functional. None of that is real: there is no requester-scoped "my
 * recent tickets" endpoint yet (that's My Work, out of scope for this
 * pass — see TicketFilters, which has no `requester` filter). Per "no
 * simulated data or non-functional actions", this now links out to the
 * real screens instead of faking a preview of data that isn't there — the
 * Knowledge Base link goes to KnowledgeBase.tsx, which is honest about not
 * having a backend yet rather than showing fabricated articles.
 */
export default function EndUserDashboard() {
  const navigate = useNavigate();
  const { displayName } = useAuth();

  return (
    <div className="p-6 lg:p-8 w-full space-y-8">
      <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border border-cyan-500/20 rounded-3xl p-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between shadow-lg">
        <div>
          <h1 className="text-3xl font-black text-on-surface mb-2">
            {displayName ? `Hello, ${displayName}` : 'Hello, how can we help?'}
          </h1>
          <p className="text-cyan-100/80">Browse the service catalog to open a new request, or check your existing tickets.</p>
        </div>
        <Button onClick={() => navigate('/portal/catalog')} className="shrink-0">
          <Plus className="w-5 h-5" aria-hidden="true" /> Report an Issue
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/portal/tickets">
          <Card interactive className="flex h-full flex-col gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <TicketIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>My Tickets</CardTitle>
              <CardDescription>See the status of every request you've raised.</CardDescription>
            </div>
            <span className="mt-1 flex items-center gap-1 text-xs font-bold text-primary">
              Go to my tickets <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </Card>
        </Link>

        <Link to="/portal/knowledge">
          <Card interactive className="flex h-full flex-col gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Knowledge Base</CardTitle>
              <CardDescription>Search guides and how-tos before opening a ticket.</CardDescription>
            </div>
            <span className="mt-1 flex items-center gap-1 text-xs font-bold text-primary">
              Browse articles <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </Card>
        </Link>
      </div>
    </div>
  );
}
