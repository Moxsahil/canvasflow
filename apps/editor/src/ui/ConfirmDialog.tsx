import { useId, type ReactNode } from 'react';
import {
  SurfaceWindow,
  WindowBadge,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from './SurfaceWindow';
import type { SurfaceTheme } from './surface-palette';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What answering does, under the title. `<strong>` is set in the title's colour. */
  children: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Paints the confirming button in the danger wash and the badge amber, for
   * an action that discards work — work that can still be undone. The red
   * badge is kept for what can't be.
   */
  destructive?: boolean;
  /** Stands in the badge: what the question is about. */
  icon?: ReactNode;
  busy?: boolean;
  theme: SurfaceTheme;
  onClose: () => void;
}

/**
 * A question, in the app's window.
 *
 * Cancel takes focus: whoever opened this has been asked something they have
 * not answered yet, and the answer Enter gives for free should be the one that
 * changes nothing. Escape, × and a click outside all cancel; it is the
 * confirming button, never the way out, that has to be deliberate.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  icon,
  busy = false,
  theme,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();

  return (
    <SurfaceWindow
      open={open}
      theme={theme}
      onClose={onClose}
      width={440}
      labelledBy={titleId}
      describedBy={bodyId}
      alert
      data-testid="confirm-dialog"
    >
      <WindowHeader
        titleId={titleId}
        title={title}
        description={children}
        descriptionId={bodyId}
        lead={
          icon ? <WindowBadge tone={destructive ? 'warn' : 'soft'}>{icon}</WindowBadge> : undefined
        }
        onClose={onClose}
      />
      <WindowFooter>
        <WindowButton variant="ghost" autoFocus data-autofocus onClick={onClose}>
          {cancelLabel}
        </WindowButton>
        <WindowButton
          variant={destructive ? 'danger' : 'primary'}
          disabled={busy}
          onClick={onConfirm}
          data-testid="confirm-dialog-confirm"
        >
          {confirmLabel}
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}
