import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/states';
import { listRecurringProblems } from './api';
import { PROBLEM_SEVERITY_TONES, formatDate } from './presentation';

export function RecurringProblemsPanel({ dealershipId }: { dealershipId: string }) {
  const query = useQuery({
    queryKey: ['services', 'recurring-problems', dealershipId],
    queryFn: () => listRecurringProblems(dealershipId),
  });
  const problems = query.data ?? [];

  return (
    <Card data-testid="recurring-problems-panel">
      <CardHeader>
        <CardTitle>Recurring problems at this dealership</CardTitle>
      </CardHeader>

      {query.isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-services-surface-container" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          title="No se pudo cargar el historial de este sitio"
          onRetry={() => query.refetch()}
          compact
        />
      ) : problems.length === 0 ? (
        <div data-testid="recurring-problems-empty" className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
          <p className="text-sm font-bold text-services-on-surface">
            Sin otros problemas abiertos en este dealership
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {problems.map((problem) => (
            <li
              key={problem.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-services-border bg-services-surface-container px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-services-on-surface">{problem.title}</p>
                <p className="text-xs text-services-on-surface-variant">{formatDate(problem.occurredAt)}</p>
              </div>
              <Badge tone={PROBLEM_SEVERITY_TONES[problem.severity]} size="sm">
                {problem.severity}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
