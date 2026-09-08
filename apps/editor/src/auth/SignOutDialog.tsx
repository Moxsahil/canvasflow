import { useEffect, useRef } from 'react';
import { LogOut, TriangleAlert } from 'lucide-react';
import { SurfaceDialog } from '../ui/SurfaceDialog';
import { SurfaceButton } from '../ui/surface-ui';
import type { SurfaceTheme } from '../ui/surface-palette';

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name of the session being ended. */
  name: string;
  /** Shown under the name so the dialog says *which* account is leaving. */
  email: string | null;
  /**
   * Whether this session belongs to someone who joined by share link without
   * an account. A guest identity is not one they can sign back into, which
   * changes what signing out costs them.
   */
  isGuest: boolean;
  /**
   * Whether the board is currently with the server. False means edits made
   * since the connection dropped are still only on this device — the one thing
   * about signing out that isn't reversible by signing back in.
   */
  synced: boolean;
  busy: boolean;
  onConfirm: () => void;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

/**
 * The last word before a session ends.
 *
 * Asked rather than done, because the click that ends it is two rows below the
 * one that opens a board, and because it leaves the page: an accidental sign
 * out costs a round trip through the login form and every board this tab had
 * open. It is not a destructive action and is deliberately not dressed as one
 * — the warning colour is spent only on the case where something really is at
 * stake, which is a board that has not finished reaching the server.
 *
 * On the app's dialog surface, like every other window that stops the board to
 * ask something.
 */
export function SignOutDialog({
  open,
  onOpenChange,
  name,
  email,
  isGuest,
  synced,
  busy,
  onConfirm,
  theme,
}: SignOutDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands here when the dialog opens: the button that ends the session is
  // never the one under the first keystroke.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <SurfaceDialog
      open={open}
      theme={theme}
      alert
      title="Sign out?"
      // The account, spelled out: the sidebar row that opened this is collapsed
      // to an initial half the time, and "sign out" with no name on it is how
      // you sign the wrong one out.
      subtitle={email ? `${name} · ${email}` : name}
      leading={
        // The neutral raised circle, not the danger wash the delete dialog
        // uses: leaving is reversible, and dressing it in red would spend the
        // warning colour on the wrong half of this dialog.
        <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--surface-accent)]">
          <LogOut className="size-[18px]" aria-hidden="true" />
        </span>
      }
      width={480}
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
          <SurfaceButton
            variant="primary"
            loading={busy}
            onClick={onConfirm}
            data-testid="sign-out-confirm"
          >
            {!busy && <LogOut size={13} aria-hidden="true" />}
            {busy ? 'Signing out…' : 'Sign out'}
          </SurfaceButton>
        </>
      }
    >
      <div className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
        {isGuest ? (
          <>
            You joined this board by link, as a guest. Everything you have drawn stays on the board,
            but this guest identity ends here — the link will let you back in as someone new rather
            than as {name}.
          </>
        ) : (
          <>
            This device is signed out and sent back to the sign-in page. The board is unaffected,
            and everything on it is waiting when you sign back in.
          </>
        )}
      </div>

      {/* Only when there is something to lose. The board's cached copy is held
          under the signing-in identity, so for an account it is picked up again
          on the next sign-in and this is a delay; for a guest there is no
          identity to come back as, and it is a loss. */}
      {!synced && (
        <div className="flex gap-[8px] rounded-[8px] border border-[var(--surface-danger-border)] bg-[var(--surface-danger-wash)] px-[12px] py-[10px] text-[11.5px] leading-[1.6] text-[var(--surface-fg)]">
          <TriangleAlert
            className="mt-[2px] size-[14px] shrink-0 text-[var(--surface-danger)]"
            aria-hidden="true"
          />
          <span>
            This board isn’t connected right now, so anything drawn since it dropped hasn’t reached
            the server.{' '}
            {isGuest
              ? 'It is held on this device under a guest identity you cannot sign back into, so it will not reach the board. Reconnect first if you want to keep it.'
              : 'It is kept on this device and sent the next time you open the board as this account.'}
          </span>
        </div>
      )}
    </SurfaceDialog>
  );
}
