import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getDealership } from './api';
import { RecurringProblemsPanel } from './RecurringProblemsPanel';

export default function DealershipView() {
  const { dealershipId } = useParams<{ dealershipId: string }>();
  const query = useQuery({
    queryKey: ['services', 'dealership', dealershipId],
    queryFn: () => getDealership(dealershipId!),
    enabled: Boolean(dealershipId),
  });

  if (query.isLoading) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <LoadingState label="Loading dealership…" />
      </DepartmentScope>
    );
  }

  if (query.isError || !query.data) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </DepartmentScope>
    );
  }

  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full space-y-6 p-6 lg:p-8"
    >
      <PageHeader
        title={query.data.name}
        description={`${query.data.city}, ${query.data.state}`}
        eyebrow={
          <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-services-accent">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Dealership
          </span>
        }
      />
      <RecurringProblemsPanel dealershipId={query.data.id} />
    </DepartmentScope>
  );
}
