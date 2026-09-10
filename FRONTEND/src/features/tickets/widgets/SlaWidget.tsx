import { AlertTriangle, Timer } from 'lucide-react';
import type { SlaAssessment } from '@/features/sla/api';
import { formatDateTime } from '@/i18n/format';
import type { TicketPageContext } from './context';

type SlaMetricView = {
  pct: number;
  label: string;
  deadline: string;
  completed: boolean;
  breached: boolean;
  paused: boolean;
};

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(Math.abs(milliseconds) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    minutes || (!days && !hours) ? `${minutes}m` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function slaMetric(assessment: SlaAssessment, kind: 'response' | 'resolution'): SlaMetricView {
  const dueAt = new Date(kind === 'response' ? assessment.responseDueAt : assessment.resolutionDueAt);
  const completedValue = kind === 'response' ? assessment.respondedAt : assessment.resolvedAt;
  const completedAt = completedValue ? new Date(completedValue) : null;
  const pausedAt = assessment.pausedAt ? new Date(assessment.pausedAt) : null;
  const effectiveNow = completedAt ?? pausedAt ?? new Date();
  const explicitTarget =
    kind === 'response' ? assessment.responseTargetMinutes : assessment.resolutionTargetMinutes;
  const targetMinutes =
    explicitTarget && explicitTarget > 0
      ? explicitTarget
      : Math.max(1, (dueAt.getTime() - new Date(assessment.startedAt).getTime()) / 60_000);
  const remaining = dueAt.getTime() - effectiveNow.getTime();
  const breached =
    (kind === 'response' ? assessment.responseBreached : assessment.resolutionBreached) || remaining < 0;
  const pct = Math.max(0, Math.min(100, 100 - (remaining / (targetMinutes * 60_000)) * 100));
  let label = `${formatDuration(remaining)} remaining`;
  if (completedAt) {
    label = breached ? 'Breached' : 'Met';
  } else if (breached) {
    label = `Overdue by ${formatDuration(remaining)}`;
  } else if (pausedAt) {
    label = `${formatDuration(remaining)} remaining when paused`;
  }
  return {
    pct,
    label,
    deadline: formatDateTime(dueAt, 'en-US'),
    completed: Boolean(completedAt),
    breached,
    paused: Boolean(pausedAt && !completedAt),
  };
}

function SlaBar({ title, metric }: { title: string; metric: SlaMetricView }) {
  const successful = metric.completed && !metric.breached;
  const barColor = successful
    ? 'bg-status-success-icon'
    : metric.breached
      ? 'bg-status-danger-icon'
      : metric.paused
        ? 'bg-status-paused-icon'
        : metric.pct >= 75
          ? 'bg-status-warning-icon'
          : 'bg-primary';
  const textColor = successful
    ? 'text-status-success-fg'
    : metric.breached
      ? 'text-status-danger-fg'
      : metric.paused
        ? 'text-status-paused-fg'
        : metric.pct >= 75
          ? 'text-status-warning-fg'
          : 'text-primary';

  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{title}</span>
        <span className={`text-xs font-bold ${textColor}`}>{metric.label}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-container overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} ${metric.breached ? 'animate-pulse' : ''}`}
          style={{ width: `${metric.completed ? 100 : metric.pct}%` }}
        />
      </div>
      <span className="block mt-1 text-[10px] text-on-surface-variant">
        Deadline: {metric.deadline} · {Math.round(metric.pct)}% consumed
      </span>
    </div>
  );
}

// SLA calculation and the underlying assessment remain owned by the SLA
// module — this widget only positions/renders what `context.sla` already
// resolved for it.
export function SlaWidget({ context }: { context: TicketPageContext }) {
  const { assessment, loading } = context.sla;
  return (
    <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-border/40 pb-2">
        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <Timer className="w-4 h-4 text-primary" />
          Service Level Agreement
        </h3>
        {assessment && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {assessment.pausedAt && !assessment.resolvedAt && (
              <span className="text-[10px] font-black text-status-paused-fg bg-status-paused-bg border border-status-paused-border rounded-full px-3 py-1">
                CLOCK PAUSED
              </span>
            )}
            <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container border border-border/50 rounded-full px-3 py-1">
              {assessment.policyId} · v{assessment.policyVersion}
            </span>
            {assessment.definitionVersion && (
              <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container border border-border/50 rounded-full px-3 py-1">
                Def. v{assessment.definitionVersion}
              </span>
            )}
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-on-surface-variant">Calculating SLA targets…</p>
      ) : assessment ? (
        <div className="flex flex-wrap gap-8">
          <SlaBar title="First response" metric={slaMetric(assessment, 'response')} />
          <SlaBar title="Resolution" metric={slaMetric(assessment, 'resolution')} />
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-status-warning-border bg-status-warning-bg p-4">
          <AlertTriangle className="w-4 h-4 text-status-warning-icon mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-status-warning-fg">No SLA assessment</p>
            <p className="text-xs text-on-surface-variant mt-1">
              The catalog version used by this ticket didn't link an executable SLA policy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
