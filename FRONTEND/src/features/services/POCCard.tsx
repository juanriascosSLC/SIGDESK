import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, UserX } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getDealershipPOC } from './api';

/** No Error state by design (Design Review Pass 2) — getDealershipPOC
 *  never rejects, so this only ever renders Loading/Empty/Success. */
export function POCCard({ dealershipId }: { dealershipId: string }) {
  const query = useQuery({
    queryKey: ['services', 'poc', dealershipId],
    queryFn: () => getDealershipPOC(dealershipId),
  });

  return (
    <Card data-testid="poc-card">
      <CardHeader>
        <CardTitle>Receiving contact (POC)</CardTitle>
      </CardHeader>

      {query.isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-services-surface-container" aria-hidden="true" />
      ) : !query.data ? (
        <div data-testid="poc-card-empty" className="flex flex-col items-center gap-3 py-4 text-center">
          <UserX className="h-8 w-8 text-services-on-surface-variant" aria-hidden="true" />
          <p className="text-sm font-bold">Sin POC asignado</p>
          <Button data-testid="poc-request-it" variant="secondary" size="sm">
            Solicitar a IT
          </Button>
        </div>
      ) : (
        <dl className="space-y-1.5 text-sm">
          <dd className="font-bold">{query.data.name}</dd>
          <dd className="text-services-on-surface-variant">{query.data.role}</dd>
          <dd className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {query.data.phone}
          </dd>
          <dd className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {query.data.email}
          </dd>
        </dl>
      )}
    </Card>
  );
}
