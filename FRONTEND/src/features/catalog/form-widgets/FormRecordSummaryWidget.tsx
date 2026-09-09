import { ClipboardCheck } from 'lucide-react';
import { isFieldRequired } from '../metamodel';
import type { FormPageContext } from './context';

function hasValue(value: unknown) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Boolean((value as { id?: string }).id) || Object.keys(value as object).length > 0;
  return true;
}

export function FormRecordSummaryWidget({ context }: { context: FormPageContext }) {
  const visible = context.fields;
  const completed = visible.filter((field) => hasValue(context.data[field.key])).length;
  const missingRequired = visible.filter(
    (field) => isFieldRequired(field, context.data) && !hasValue(context.data[field.key]),
  );
  const percent = visible.length ? Math.round((completed / visible.length) * 100) : 100;

  return (
    <section className="rounded-2xl border border-border/50 bg-surface-container p-5" data-testid="form-record-summary-widget">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h3 className="font-black text-on-surface">Intake Summary</h3>
        <span className="ml-auto text-xs font-bold text-primary">{percent}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">{completed} of {visible.length} fields completed</p>
      {missingRequired.length > 0 && (
        <p className="mt-2 text-xs text-amber-300">Missing: {missingRequired.map((field) => field.label).join(', ')}</p>
      )}
    </section>
  );
}
