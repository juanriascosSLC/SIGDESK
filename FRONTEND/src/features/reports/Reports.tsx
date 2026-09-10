import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';

/**
 * There is no backend service for reporting/analytics yet — no aggregate
 * endpoint for agent performance, SLA compliance, ticket volume trends, or
 * CSAT. The previous version of this screen was 100% fabricated: made-up
 * agent names and resolve counts, a hardcoded "87% SLA met" donut, a
 * hardcoded 6-month incoming/resolved bar chart, a hardcoded "4.6 CSAT ·
 * 312 responses" breakdown, and a non-functional date-range select and
 * Export button. None of it queried anything. Per "no simulated data or
 * non-functional actions", this now says so honestly instead of pretending
 * to work. Replace this with the real thing once a backend contract
 * exists — do not reintroduce local fake data here.
 */
export default function Reports() {
  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <PageHeader
        eyebrow={
          <div className="mb-1 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        }
        title="Reports & Analytics"
        description="Prebuilt reports across your service desk operation."
      />
      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <EmptyState
          icon="general"
          title="Reports aren't available yet"
          description="SIG-DESK doesn't have a backend service for reporting or analytics yet. This section will become active once that capability ships — nothing here is functional in the meantime."
        />
      </div>
    </div>
  );
}
