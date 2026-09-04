import { Timer } from 'lucide-react';
import type { FormPageContext, FormSlaPreview } from './context';

function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return (
    [days ? `${days}d` : '', hours ? `${hours}h` : '', rest || (!days && !hours) ? `${rest}m` : '']
      .filter(Boolean)
      .join(' ')
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl border border-border/40 bg-surface-container-low p-6"
      data-testid="form-sla-preview-widget"
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
        <Timer className="h-4 w-4 text-primary" />
        Expected SLA
      </h3>
      {children}
    </div>
  );
}

function Target({ label, minutes, dueAt }: { label: string; minutes: number; dueAt?: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="text-lg font-black text-on-surface">{formatMinutes(minutes)}</p>
      {dueAt && (
        <p className="text-[11px] text-on-surface-variant">
          approx. {new Date(dueAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function Ready({ preview }: { preview: FormSlaPreview }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Target
          label="Response"
          minutes={preview.responseTargetMinutes}
          dueAt={preview.responseDueAt}
        />
        <Target
          label="Resolution"
          minutes={preview.resolutionTargetMinutes}
          dueAt={preview.resolutionDueAt}
        />
      </div>
      {/* The durations are exact; the instants are not. An automation that
          re-prioritizes the record right after creation changes the real
          deadlines, and the clock keeps running between this render and the
          submit — saying so is cheaper than being wrong later. */}
      <p className="mt-4 border-t border-border/40 pt-3 text-[11px] leading-4 text-on-surface-variant">
        Calculated for the selected priority under the policy's business calendar. Dates are an estimate from now; target durations will apply.
      </p>
    </>
  );
}

// What the SLA policy would promise, before the record exists.
//
// Every state is rendered rather than collapsed into "nothing to show":
// an admin placing this widget in the designer needs to see what it looks like
// when a service has no SLA policy at all, which is the common case.
export function FormSlaPreviewWidget({ context }: { context: FormPageContext }) {
  const { sla } = context;

  if (sla.state === 'ready' && sla.preview) {
    return (
      <Shell>
        <Ready preview={sla.preview} />
      </Shell>
    );
  }
  if (sla.state === 'loading') {
    return (
      <Shell>
        <div className="h-12 animate-pulse rounded-xl bg-surface-container-high" />
      </Shell>
    );
  }
  if (sla.state === 'error') {
    return (
      <Shell>
        <p className="text-sm text-amber-300">
          {sla.message ?? 'We could not calculate the expected SLA.'}
        </p>
        <button
          type="button"
          onClick={sla.onRetry}
          className="mt-3 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-bold text-on-surface"
        >
          Retry
        </button>
      </Shell>
    );
  }
  if (sla.state === 'unavailable') {
    return (
      <Shell>
        <p className="text-sm text-on-surface-variant">
          {sla.message ?? 'This service does not have an associated SLA policy.'}
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <p className="text-sm text-on-surface-variant">
        Select a priority to view the SLA targets that will apply.
      </p>
    </Shell>
  );
}
