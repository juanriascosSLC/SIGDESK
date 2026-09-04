import { ConfirmDialog } from '@/components/ui';

export interface TaskActionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (value?: string) => void | Promise<void>;
  actionKey: 'complete' | 'block' | 'cancel' | null;
  loading?: boolean;
  error?: string;
}

/**
 * Replaces the `window.prompt` calls in `ChangeTasksBoard.tsx`'s
 * `transitionMutation`: evidence when completing a task, a mandatory reason
 * when blocking or canceling one.
 */
export function TaskActionDialog({ open, onClose, onConfirm, actionKey, loading, error }: TaskActionDialogProps) {
  if (actionKey === 'complete') {
    return (
      <ConfirmDialog
        open={open}
        onClose={onClose}
        onConfirm={(value) => onConfirm(value)}
        title="Complete task"
        description="Record evidence or the result of this task."
        confirmLabel="Complete"
        loading={loading}
        error={error}
        reasonRequired={true}
        reasonLabel="Evidence or result"
        reasonPlaceholder="What was done, where it's documented, a ticket number…"
      />
    );
  }
  if (actionKey === 'block') {
    return (
      <ConfirmDialog
        open={open}
        onClose={onClose}
        onConfirm={(reason) => {
          if (reason) onConfirm(reason);
        }}
        title="Block task"
        description="Explain what's blocking this task so whoever picks it up next knows why."
        confirmLabel="Block"
        tone="destructive"
        loading={loading}
        error={error}
        reasonLabel="Reason for blocking"
        reasonPlaceholder="What's blocking this task?"
      />
    );
  }
  if (actionKey === 'cancel') {
    return (
      <ConfirmDialog
        open={open}
        onClose={onClose}
        onConfirm={(reason) => {
          if (reason) onConfirm(reason);
        }}
        title="Cancel task"
        description="This task will be marked canceled."
        confirmLabel="Cancel task"
        tone="destructive"
        loading={loading}
        error={error}
        reasonLabel="Reason for cancellation"
        reasonPlaceholder="Why is this task being canceled?"
      />
    );
  }
  return null;
}
