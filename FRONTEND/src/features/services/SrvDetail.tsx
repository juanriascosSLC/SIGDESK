import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getSrvTicket, getDealership } from './api';
import { EQUIPMENT_ITEM_LABELS, EQUIPMENT_ITEM_TONES } from './presentation';
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

        <Card data-testid="srv-equipment-checklist">
          <CardHeader>
            <CardTitle>Affected Equipment</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {ticket.equipment.map((item) => (
              <li
                key={item.id}
                data-testid={`srv-equipment-item-${item.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-services-border bg-services-surface-container px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.label} × {item.quantity}</p>
                  {item.validationError && (
                    <p
                      data-testid={`srv-equipment-item-${item.id}-warning`}
                      className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      No se pudo validar
                    </p>
                  )}
                </div>
                {item.isValidating ? (
                  <Loader2
                    data-testid={`srv-equipment-item-${item.id}-spinner`}
                    className="h-4 w-4 shrink-0 animate-spin text-services-on-surface-variant"
                    aria-hidden="true"
                  />
                ) : (
                  <Badge tone={EQUIPMENT_ITEM_TONES[item.status]} size="sm">
                    {EQUIPMENT_ITEM_LABELS[item.status]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

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
