import type { ReactNode } from 'react';
import { Loader2, ServerCrash, ShieldOff, WifiOff, Clock, Inbox, SearchX, FileQuestion } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';
import { describeError } from '../../lib/errors';

/**
 * The seven states every data-driven screen in this pass needs to handle
 * (loading / empty / error / permission-denied / offline / stale / success)
 * — success is just "render the real content", so it has no component here.
 */

function StateShell({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger' | 'warning';
  compact?: boolean;
}) {
  const iconToneClass = {
    neutral: 'text-on-surface-variant',
    danger: 'text-red-700 dark:text-red-400',
    warning: 'text-amber-800 dark:text-amber-400',
  }[tone];
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'p-6 min-h-[160px]' : 'p-12 min-h-[300px]',
      )}
      role="status"
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-3xl border border-border/50 bg-surface-container-high shadow-inner',
          compact ? 'mb-3 h-12 w-12' : 'mb-6 h-20 w-20',
        )}
      >
        <span className={cn(iconToneClass, compact ? '[&>svg]:h-5 [&>svg]:w-5' : '[&>svg]:h-9 [&>svg]:w-9')}>{icon}</span>
      </div>
      <h3 className={cn('font-bold text-on-surface', compact ? 'text-sm' : 'text-xl')}>{title}</h3>
      {description && (
        <p className={cn('mx-auto mt-2 max-w-sm text-on-surface-variant', compact ? 'text-xs' : 'text-sm')}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', compact ? 'p-6' : 'p-12 min-h-[300px]')} role="status" aria-live="polite">
      <Loader2 className={cn('animate-spin text-primary motion-reduce:animate-none', compact ? 'h-5 w-5' : 'h-8 w-8')} aria-hidden="true" />
      <span className={cn('text-on-surface-variant', compact ? 'text-xs' : 'text-sm')}>{label}</span>
    </div>
  );
}

export interface ErrorStateProps {
  /** Pass the caught error directly and this renders the right copy for it
   *  (offline vs. permission vs. server) — see `describeError`. */
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}

/** Generic error display. Prefer passing `error` so the message matches
 *  what actually went wrong instead of a one-size-fits-all string. */
export function ErrorState({ error, title, description, onRetry, retryLabel = 'Try again', compact }: ErrorStateProps) {
  const described = error !== undefined ? describeError(error) : undefined;
  return (
    <StateShell
      icon={<ServerCrash />}
      tone="danger"
      compact={compact}
      title={title ?? described?.title ?? "We couldn't load this"}
      description={description ?? described?.description ?? 'Please try again.'}
      action={onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
    />
  );
}

export function PermissionDeniedState({
  title = "You don't have permission to view this",
  description = 'Ask an administrator to grant you access if you need it.',
  compact,
}: { title?: string; description?: string; compact?: boolean }) {
  return <StateShell icon={<ShieldOff />} tone="warning" title={title} description={description} compact={compact} />;
}

export function OfflineState({ onRetry, compact }: { onRetry?: () => void; compact?: boolean }) {
  return (
    <StateShell
      icon={<WifiOff />}
      tone="danger"
      compact={compact}
      title="We couldn't reach the server"
      description="Check your connection and try again."
      action={onRetry && <Button onClick={onRetry}>Try again</Button>}
    />
  );
}

/** A small inline banner (not a full-screen state) for data that loaded but
 *  is known to be behind the source of truth — e.g. a cached CMDB
 *  projection. Sits above the content it describes, not in place of it. */
export function StaleDataState({
  description = 'This data may be out of date.',
  onRefresh,
}: { description?: string; onRefresh?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{description}</span>
      {onRefresh && (
        <button type="button" onClick={onRefresh} className="font-bold underline-offset-2 hover:underline">
          Refresh
        </button>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: 'inbox' | 'search' | 'general';
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

/**
 * The canonical empty-state component. `components/ui/EmptyState.tsx` (the
 * original, `type` instead of `icon`, no `compact` variant, its own
 * hand-rolled shell) is retired — every call site was migrated to this one
 * (some became `ErrorState` instead, where the old component was actually
 * being used to render a load failure with a retry button, not an empty
 * result set) and the old file was deleted. This was briefly named
 * `EmptyStateV2` while both existed side by side; don't reintroduce a `V2`
 * suffix as a permanent name if this ever needs to change shape again —
 * migrate the old one out instead, the way this one replaced its predecessor.
 */
export function EmptyState({ icon = 'general', title, description, action, compact }: EmptyStateProps) {
  const Icon = icon === 'search' ? SearchX : icon === 'inbox' ? Inbox : FileQuestion;
  return <StateShell icon={<Icon />} title={title} description={description} action={action} compact={compact} />;
}
