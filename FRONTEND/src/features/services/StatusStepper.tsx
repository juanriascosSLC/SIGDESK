import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { SRV_STAGES, SRV_STAGE_LABELS } from './presentation';
import type { SrvStage, SrvStageFlag } from './types';

export interface StatusStepperProps {
  currentStage: SrvStage;
  flag?: SrvStageFlag;
  /** Which department sent the visit back. Only used when flag is 'returned'. */
  returnedBy?: string;
  className?: string;
}

/**
 * The 6-stage progress projection for a service visit (Recommended Approach
 * step 7), variant S2 from the PR2 design exploration.
 *
 * READ-ONLY BY DESIGN. No step is clickable and none dispatches a transition:
 * this is a projection of the ticket's state for the summary view, not the
 * authoring surface for the automation rules underneath it. Which of the two
 * is authoritative once there is real wiring is the SRV ADR's job.
 *
 * Rendered as an ordered list with aria-current="step" rather than a row of
 * divs, so the sequence is navigable by screen reader.
 *
 * Three distinct meanings, three distinct treatments, and none of them is the
 * amber ⚠ — that symbol already means "could not validate this equipment
 * item" in SrvDetail, and reusing it would collapse two different failures
 * into one signal (docs/design-rules.md R-4):
 *   - returned    → reversal: danger tone + return icon, on the stage to redo
 *   - unconfirmed → dashed ring + "unconfirmed" label
 *   - done/current/pending → plain forward progress
 */
export function StatusStepper({ currentStage, flag, returnedBy, className }: StatusStepperProps) {
  const currentIndex = SRV_STAGES.indexOf(currentStage);
  const isReturned = flag === 'returned';
  const isUnconfirmed = flag === 'unconfirmed';

  return (
    <div className={className} data-testid="srv-status-stepper">
      {isReturned && (
        <div
          data-testid="srv-stepper-returned-banner"
          className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400"
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
          Returned by {returnedBy ?? 'the destination department'} — this stage has to be
          reworked before it moves forward again.
        </div>
      )}

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {SRV_STAGES.map((stage, index) => {
          const isCurrent = index === currentIndex;
          // A returned visit has NOT completed the stage it was sent back to,
          // nor anything after it — the earlier checks stay, which is what
          // makes this read as a reversal rather than a fresh start.
          const isDone = index < currentIndex;
          const label = SRV_STAGE_LABELS[stage];

          return (
            <li key={stage} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-2 text-xs font-bold',
                  isCurrent ? 'text-services-on-surface' : 'text-services-on-surface-variant',
                  isCurrent && isReturned && 'text-red-600 dark:text-red-400',
                )}
                {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
                data-testid={`srv-stage-${stage}`}
                data-stage-state={
                  isCurrent && isReturned
                    ? 'returned'
                    : isCurrent && isUnconfirmed
                      ? 'unconfirmed'
                      : isCurrent
                        ? 'current'
                        : isDone
                          ? 'done'
                          : 'pending'
                }
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                    isDone && 'border-services-accent bg-services-accent text-services-accent-foreground',
                    isCurrent && !isReturned && !isUnconfirmed && 'border-[3px] border-services-accent',
                    isCurrent && isUnconfirmed && 'border-dashed border-services-accent',
                    isCurrent && isReturned && 'border-red-500 text-red-600 dark:text-red-400',
                    !isDone && !isCurrent && 'border-services-border',
                  )}
                >
                  {isDone && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                  {isCurrent && isReturned && <RotateCcw className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span className="whitespace-nowrap">
                  {label}
                  {isCurrent && isUnconfirmed && (
                    <span
                      data-testid="srv-stage-unconfirmed-label"
                      className="ml-1.5 font-semibold text-services-on-surface-variant"
                    >
                      unconfirmed
                    </span>
                  )}
                </span>
              </div>
              {index < SRV_STAGES.length - 1 && (
                <span aria-hidden="true" className="text-services-on-surface-variant/50">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
