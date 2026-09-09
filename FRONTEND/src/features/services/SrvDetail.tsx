import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getSrvTicket, getDealership } from './api';
import {
  EQUIPMENT_ITEM_LABELS,
  EQUIPMENT_ITEM_TONES,
  SRV_STATUS_LABELS,
  SRV_STATUS_TONES,
} from './presentation';
import { SubcontractorPicker } from './SubcontractorPicker';
import { POCCard } from './POCCard';

export default function SrvDetail() {
  const { id } = useParams<{ id: string }>();
  const [subcontractorId, setSubcontractorId] = useState<string | undefined>(undefined);
  // Adjusting state during render (not in an effect) when the route param
  // changes — React's own recommended pattern for "reset local state when a
  // prop changes" without an extra render flash. Without this, a
  // subcontractor picked while viewing one SRV ticket stayed "selected" when
  // navigating to a different ticket via back/forward, since :id changing
  // alone doesn't remount SrvDetail (adversarial review finding).
  const [lastSeenId, setLastSeenId] = useState(id);
  if (id !== lastSeenId) {
    setLastSeenId(id);
    setSubcontractorId(undefined);
  }

  // "Resolve blockers" had no handler at all (bug: neither real nor mocked
  // — a click did literally nothing). Until the real resolution flow lands
  // (PR2 stepper work, see `services/pr2-invoice-workflow-embed-stepper`),
  // the honest interim behavior is to bring the equipment checklist named
  // in the CTA's own copy ("Confirm the missing equipment below") into
  // view and focus it — a real action, not a fake success state.
  const equipmentChecklistRef = useRef<HTMLDivElement>(null);
  const handleResolveBlockers = () => {
    equipmentChecklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    equipmentChecklistRef.current?.focus();
  };

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
      <PageHeader
        title={ticket.title}
        description={ticket.humanId}
        eyebrow={
          <Link
            to={`/app/services/dealerships/${ticket.dealershipId}`}
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-services-accent hover:underline"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            View dealership
          </Link>
        }
        actions={<StatusBadge label={SRV_STATUS_LABELS[ticket.status]} tone={SRV_STATUS_TONES[ticket.status]} />}
      />

      {/* Next Action — the single primary button on the screen (Design
          Review Pass 1). PR1 has no per-status action copy beyond this one
          blocking check (Design Review Pass 7 leaves exact per-stage copy
          an open decision for PR2's stepper work). */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-services-on-surface-variant">
            Next Action
          </div>
          <p className="mt-1 text-sm">
            {ticket.status === 'requires_action'
              ? 'Confirm the missing equipment below before dispatch.'
              : 'No blocking action right now.'}
          </p>
        </div>
        <Button
          disabled={!ticket.equipment.some((item) => item.status === 'missing')}
          onClick={handleResolveBlockers}
        >
          Resolve blockers
        </Button>
      </Card>

      {/* Blockers — never hidden behind a tab (Design Review Pass 1). */}
      {ticket.equipment.some((item) => item.status === 'missing') && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Missing equipment is blocking dispatch — see the checklist below.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <POCCard dealershipId={ticket.dealershipId} />

        <Card data-testid="srv-equipment-checklist" ref={equipmentChecklistRef} tabIndex={-1}>
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
