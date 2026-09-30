import { useEffect, useId, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INPUT } from '../settings/settings-ui';
import {
  SurfaceWindow,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';

interface DeleteWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the thing being deleted, e.g. `Delete "Marketing"?`. */
  title: string;
  /** Inline content only — it renders under the title. */
  description: ReactNode;
  /**
   * The exact text that has to be typed before the action unlocks. Omit for a
   * plain confirmation.
   *
   * Reserved for deletes that take more than the one thing named with them: a
   * workspace carries every board in it, and copying its name out is the
   * moment where you notice which workspace you are actually on.
   */
  confirmText?: string;
  confirmLabel: string;
  busy: boolean;
  /** The last refusal from the server, if there was one. */
  error: string | null;
  onConfirm: () => void;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

/**
 * The last word before something is deleted.
 *
 * The one window a click outside or Escape won't close: the field asking you
 * to type a name is work, and a stray click should not throw it away. Cancel
 * and × still do.
 *
 * It confirms rather than deletes: the caller does the work and keeps the
 * window open if the server refuses, so a failure is read here, in the foot,
 * rather than disappearing with the window that asked.
 */
export function DeleteWarningDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmLabel,
  busy,
  error,
  onConfirm,
  theme,
}: DeleteWarningDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  const [typed, setTyped] = useState('');

  // Cleared on every open, so a name copied out for one workspace can't still
  // be sitting in the field when the dialog reopens on another.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // Compared case-insensitively on trimmed text: this is a "did you read the
  // name" check, not a spelling test, and a name with a capital in an awkward
  // place shouldn't make the button unreachable.
  const confirmed =
    confirmText === undefined || typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  const close = () => {
    if (!busy) onOpenChange(false);
  };

  return (
    <SurfaceWindow
      open={open}
      theme={theme}
      onClose={close}
      width={440}
      labelledBy={titleId}
      describedBy={descriptionId}
      alert
      dismissable={false}
      onSubmit={() => {
        if (confirmed && !busy) onConfirm();
      }}
      data-testid="delete-warning-dialog"
    >
      <WindowHeader
        titleId={titleId}
        title={title}
        description={description}
        descriptionId={descriptionId}
        onClose={close}
      />

      {confirmText !== undefined && (
        <WindowBody className="gap-[8px]">
          <label htmlFor={fieldId} className="text-[12px] text-[var(--surface-fg-muted)]">
            To confirm, type{' '}
            <span className="font-semibold text-[var(--surface-fg)]">{confirmText}</span>
          </label>
          {/* No placeholder: it would be the name being asked for, in grey,
              which reads as a field already filled in. */}
          <input
            id={fieldId}
            type="text"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            data-autofocus
            onChange={(event) => setTyped(event.target.value)}
            className={cn(
              INPUT,
              'focus:border-[var(--surface-danger)] focus:shadow-[0_0_0_3px_var(--surface-danger-wash)]',
            )}
          />
        </WindowBody>
      )}

      <WindowFooter status={error} danger>
        {/* Focus lands on the way out when there is nothing to type: the
            button that discards is never the one under the first keystroke. */}
        <WindowButton
          variant="ghost"
          disabled={busy}
          autoFocus={confirmText === undefined}
          data-autofocus={confirmText === undefined ? true : undefined}
          onClick={close}
        >
          Cancel
        </WindowButton>
        <WindowButton variant="danger" type="submit" disabled={!confirmed || busy}>
          {!busy && <Trash2 aria-hidden="true" />}
          {busy ? 'Deleting…' : confirmLabel}
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}
