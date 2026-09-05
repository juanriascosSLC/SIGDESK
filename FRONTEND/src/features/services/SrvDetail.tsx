import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getSrvTicket, getDealership } from './api';
import { SubcontractorPicker } from './SubcontractorPicker';
import { POCCard } from './POCCard';

export default function SrvDetail() {
  const { id } = useParams<{ id: string }>();
  const [subcontractorId, setSubcontractorId] = useState<string | undefined>(undefined);

  const ticketQuery = useQuery({
    queryKey: ['services', 'srv-ticket', id],
    queryFn: () => getSrvTicket(id!),
    enabled: Boolean(id),
  });
  const dealershipId = ticketQuery.data?.dealershipId;
  const dealershipQuery = useQuery({
    queryKey: ['services', 'dealership', dealershipId],
    queryFn: () => getDealership(dealershipId!),
    enabled: Boolean(dealershipId),
  });

  if (ticketQuery.isLoading) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <LoadingState label="Loading SRV ticket…" />
      </DepartmentScope>
    );
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <ErrorState error={ticketQuery.error} onRetry={() => ticketQuery.refetch()} />
      </DepartmentScope>
    );
  }

  const ticket = ticketQuery.data;

  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full space-y-6 p-6 lg:p-8"
    >
      <PageHeader title={ticket.title} description={ticket.humanId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <POCCard dealershipId={ticket.dealershipId} />

        {dealershipQuery.data ? (
          <SubcontractorPicker
            region={dealershipQuery.data.region}
            selectedId={subcontractorId ?? ticket.subcontractorId}
            onSelect={setSubcontractorId}
          />
        ) : (
          <Card><LoadingState label="Loading dealership context…" compact /></Card>
        )}
      </div>
    </DepartmentScope>
  );
}
