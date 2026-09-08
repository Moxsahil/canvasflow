import { useEffect, useRef, type ReactNode } from 'react';
import { SurfaceDialog } from './SurfaceDialog';
import { SurfaceButton } from './surface-ui';
import type { SurfaceTheme } from './surface-palette';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Omit to get a single dismissing button — the shape a notice takes. */
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The lone button's label when there is nothing to confirm. */
  dismissLabel?: string;
  /** Paints the confirming button as a warning, for actions that discard work. */
  destructive?: boolean;
  busy?: boolean;
  theme: SurfaceTheme;
  onClose: () => void;
}

/**
 * A question, on the app's own dialog surface.
 *
 * Dismissing on the backdrop is deliberate even for a destructive prompt: the
 * backdrop cancels, and it is the confirming button — never the way out — that
 * has to be deliberate.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  dismissLabel = 'Got it',
  destructive = false,
  busy = false,
  theme,
  onClose,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands on the way out rather than on the action. Whoever opened this
  // has been asked a question they have not answered yet, and the answer that
  // Enter and Space give for free should be the one that changes nothing.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <SurfaceDialog
      open={open}
      title={title}
      theme={theme}
      onClose={onClose}
      alert
      width={440}
      data-testid="confirm-dialog"
      footer={
        <>
          <div className="flex-1" />
          {onConfirm ? (
            <>
              <SurfaceButton ref={cancelRef} variant="ghost" onClick={onClose}>
                {cancelLabel}
              </SurfaceButton>
              <SurfaceButton
                variant={destructive ? 'danger' : 'primary'}
                loading={busy}
                onClick={onConfirm}
                data-testid="confirm-dialog-confirm"
              >
                {confirmLabel}
              </SurfaceButton>
            </>
          ) : (
            // Nothing to decide: the one button dismisses, and it is the
            // primary because agreeing is the only thing on offer.
            <SurfaceButton ref={cancelRef} variant="primary" onClick={onClose}>
              {dismissLabel}
            </SurfaceButton>
          )}
        </>
      }
    >
      <div className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">{children}</div>
    </SurfaceDialog>
  );
}
