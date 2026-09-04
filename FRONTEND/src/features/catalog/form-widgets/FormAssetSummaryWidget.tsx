import { Building2, HardDrive, Star } from 'lucide-react';
import { bindingIsMultiple, bindingList } from '../metamodel';
import type { FormPageContext } from './context';

export function FormAssetSummaryWidget({ context }: { context: FormPageContext }) {
  // Un campo multi-dispositivo aporta VARIAS entradas, no una: se aplana con
  // bindingList, que tolera tanto el objeto suelto de un campo de selección
  // única como la lista de uno múltiple.
  const linked = context.fields
    .filter((field) => field.bindsTo === 'siteAssetId' || field.bindsTo === 'assetId' || field.bindsTo === 'recursoId')
    .flatMap((field) => {
      const values = bindingList(context.data[field.key]);
      return values.map((value, index) => ({
        field,
        value,
        // Solo tiene sentido señalar el principal cuando hay más de uno.
        isPrincipal: bindingIsMultiple(field) && values.length > 1 && index === 0,
        count: values.length,
      }));
    });

  return (
    <section className="rounded-2xl border border-border/50 bg-surface-container p-5" data-testid="form-asset-summary-widget">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h3 className="font-black text-on-surface">Asset Context</h3>
      </div>
      {linked.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">Selected sites and equipment will appear here.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {linked.map(({ field, value, isPrincipal, count }) => (
            <li key={`${field.key}:${value.id}`} className="flex items-center gap-3 rounded-lg bg-surface-container-high px-3 py-2">
              <HardDrive className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                  {field.label}
                  {count > 1 && ` · ${count} devices`}
                </p>
                <p className="truncate text-sm font-semibold text-on-surface">{value.displayName}</p>
              </div>
              {isPrincipal && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
                  <Star className="h-3 w-3" /> Primary
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
