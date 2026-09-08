import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import { SurfaceDialog } from '../ui/SurfaceDialog';
import { SurfaceButton, SurfaceCard, SurfaceGroupLabel, SurfaceHint } from '../ui/surface-ui';
import type { SurfaceTheme } from '../ui/surface-palette';

interface DeleteWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the thing being deleted, e.g. `Delete "Marketing"?`. */
  title: string;
  /** Inline content only — it renders inside the description paragraph. */
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
 * On the app's dialog surface, like every other window that stops the board —
 * but the only one that refuses to be dismissed by the backdrop or by Escape.
 * Everywhere else those cancel harmlessly; here the field asking you to type a
 * name is work, and a stray click outside should not throw it away.
 *
 * It confirms rather than deletes: the caller does the work and keeps the
 * dialog open if the server refuses, so a failure is read here rather than
 * disappearing with the dialog that asked.
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
  const fieldId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');

  // Cleared on every open, so a name copied out for one workspace can't still
  // be sitting in the field when the dialog reopens on another.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // Focus lands on the way out: the button that discards is never the one
  // under the first keystroke.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Compared case-insensitively on trimmed text: this is a "did you read the
  // name" check, not a spelling test, and a name with a capital in an awkward
  // place shouldn't make the button unreachable.
  const confirmed =
    confirmText === undefined || typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  return (
    <SurfaceDialog
      open={open}
      theme={theme}
      alert
      dismissable={false}
      title={title}
      subtitle={
        <span className="flex items-center gap-[5px]">
          <Trash2 size={12} aria-hidden="true" />
          This can’t be undone
        </span>
      }
      leading={
        <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-danger-wash)] text-[var(--surface-danger)]">
          <TriangleAlert className="size-[18px]" aria-hidden="true" />
        </span>
      }
      width={520}
      onClose={() => onOpenChange(false)}
      footer={
        <>
          <div className="flex-1" />
          <SurfaceButton
            ref={cancelRef}
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </SurfaceButton>
          <SurfaceButton variant="danger" disabled={!confirmed} loading={busy} onClick={onConfirm}>
            {!busy && <Trash2 size={13} aria-hidden="true" />}
            {busy ? 'Deleting…' : confirmLabel}
          </SurfaceButton>
        </>
      }
    >
      <div className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
        {description}
      </div>

      {confirmText !== undefined && (
        <>
          <SurfaceGroupLabel htmlFor={fieldId}>
            Type <span className="font-semibold text-[var(--surface-fg)]">{confirmText}</span> to
            confirm
          </SurfaceGroupLabel>
          {/* The card *is* the field rather than a box drawn around one, so
              this reads as one surface instead of three nested shades. Full
              width rather than a row's 220px: a name elided to fit is one you
              cannot check against the thing you are about to delete. */}
          <SurfaceCard className="rounded-[8px] focus-within:border-[var(--surface-accent)]">
            {/* No placeholder: it would be the name being asked for, in grey,
                which reads as a field already filled in. */}
            <input
              id={fieldId}
              type="text"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
              className="w-full bg-transparent px-[12px] py-[8px] text-[12.5px] text-[var(--surface-fg)] outline-none"
            />
          </SurfaceCard>
        </>
      )}

      {error && <SurfaceHint tone="danger">{error}</SurfaceHint>}
    </SurfaceDialog>
  );
}
