import { useId, useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Textarea } from './Input';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  loading?: boolean;
  /** When set, the dialog collects a mandatory free-text reason before the
   *  confirm button is enabled (reopen reason, rejection justification,
   *  block/cancel reason) — replaces `window.prompt(...)` for every one of
   *  those flows. */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Set false for a reason that's collected but not mandatory (e.g. "Complete task" evidence). Defaults true. */
  reasonRequired?: boolean;
  /** Error surfaced inline (e.g. the mutation failed) instead of a second
   *  window.alert. */
  error?: string;
}

/**
 * Replaces every `window.confirm(...)` and reason-collecting
 * `window.prompt(...)` in the app. Two shapes in one component: a plain
 * yes/no confirmation, or — when `reasonLabel` is given — a confirmation
 * that requires typed justification before it can be submitted.
 *
 * `key={String(open)}` on the inner body is the reset mechanism, and it's
 * deliberate rather than incidental: the typed `reason` needs to be empty
 * every time this opens, however it got closed last (Cancel, Escape, the
 * caller closing it after a successful confirm, …). Neither `useEffect`
 * (fires after paint, so a stale value flashes) nor reading a ref during
 * render (both disallowed by this codebase's lint rules, for the same
 * "extra render pass" / "inconsistent value" reasons) fit; remounting the
 * body on every open/close transition is the pattern React's own docs
 * recommend for "reset state when X changes", and it costs nothing here —
 * this dialog's body is a single small form.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onClose, title, description, loading = false } = props;
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} preventDismiss={loading}>
      <ConfirmDialogBody key={String(open)} {...props} />
    </Dialog>
  );
}

function ConfirmDialogBody({
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  reasonLabel,
  reasonPlaceholder,
  reasonRequired = true,
  error,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const needsReason = Boolean(reasonLabel);
  const reasonValid = !needsReason || !reasonRequired || reason.trim().length > 0;

  function handleConfirm() {
    if (!reasonValid) return;
    void onConfirm(needsReason ? reason.trim() || undefined : undefined);
  }

  return (
    <>
      <div className="space-y-3">
        {needsReason && (
          <Textarea
            id={reasonId}
            label={reasonLabel}
            required={reasonRequired}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            error={reasonRequired && reason.trim().length === 0 && reason.length > 0 ? 'A reason is required.' : undefined}
            autoFocus
          />
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'destructive' ? 'destructive' : 'primary'}
          onClick={handleConfirm}
          loading={loading}
          disabled={!reasonValid}
        >
          {confirmLabel}
        </Button>
      </div>
    </>
  );
}
