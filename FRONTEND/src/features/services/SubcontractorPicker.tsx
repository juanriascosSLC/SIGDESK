import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';
import { listSubcontractors } from './api';

export interface SubcontractorPickerProps {
  region: string;
  selectedId?: string;
  onSelect: (subcontractorId: string) => void;
}

export function SubcontractorPicker({ region, selectedId, onSelect }: SubcontractorPickerProps) {
  const query = useQuery({
    queryKey: ['services', 'subcontractors', region],
    queryFn: () => listSubcontractors(region),
  });
  const subcontractors = query.data ?? [];

  return (
    <Card data-testid="subcontractor-picker">
      <CardHeader>
        <CardTitle>Subcontractor</CardTitle>
      </CardHeader>

      {query.isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-services-surface-container" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          title="No se pudo cargar subcontractors"
          error={query.error}
          onRetry={() => query.refetch()}
          compact
        />
      ) : subcontractors.length === 0 ? (
        <div data-testid="subcontractor-picker-empty" className="flex flex-col items-center gap-3 py-6 text-center">
          <Users className="h-8 w-8 text-services-on-surface-variant" aria-hidden="true" />
          <p className="text-sm font-bold">No hay subcontractors disponibles en esta región todavía</p>
          <Button data-testid="subcontractor-request-coverage" variant="secondary" size="sm">
            Solicitar cobertura
          </Button>
        </div>
      ) : (
        <ul className="space-y-2" role="listbox" aria-label="Subcontractors">
          {subcontractors.map((sub) => {
            const selected = sub.id === selectedId;
            return (
              <li key={sub.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(sub.id)}
                  className={`flex min-h-[44px] w-full flex-col items-start gap-1 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-services-accent bg-services-accent/10'
                      : 'border-services-border bg-services-surface-container hover:bg-services-surface-container-low'
                  }`}
                >
                  <span className="font-semibold">{sub.name}</span>
                  <span className="text-xs text-services-on-surface-variant">{sub.region}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {sub.skills.map((skill) => (
                      <Badge key={skill} tone="neutral" size="sm">{skill}</Badge>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
