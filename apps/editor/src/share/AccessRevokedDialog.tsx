import { LogIn, ShieldOff, UserPlus } from 'lucide-react';
import { env } from '@/lib/env';
import { SurfaceDialog } from '../ui/SurfaceDialog';
import { SurfaceButton } from '../ui/surface-ui';
import type { SurfaceTheme } from '../ui/surface-palette';

interface AccessRevokedDialogProps {
  open: boolean;
  /** Shown as the board's name; falls back to a generic phrase. */
  boardName?: string;
  /**
   * Whether this session belongs to someone who joined by share link without
   * an account. It decides where they can be sent: an account holder has
   * boards of their own, a guest has none.
   */
  isGuest: boolean;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

/**
 * The end of a session someone no longer has any claim on.
 *
 * There is deliberately no way to dismiss this — no cancel, no Escape, no
 * click-away, no close button. Every other dialog in the editor closes back
 * onto the board, and this one cannot: the board behind it is not theirs to
 * return to, and leaving it reachable would restore exactly the state this
 * exists to end. Its only actions navigate away, which is why `onClose` is a
 * no-op rather than something the shell could call.
 *
 * Which actions those are depends on who is looking. A guest joined by link
 * and has nowhere of their own to be sent, so the way out is an account —
 * offered rather than demanded, since they may already have one they simply
 * didn't use. Someone signed in goes back to their own boards.
 *
 * On the app's dialog surface, like every other window that stops the board —
 * even while it is closing that application down.
 */
export function AccessRevokedDialog({ open, boardName, isGuest, theme }: AccessRevokedDialogProps) {
  const webUrl = env.VITE_WEB_URL;
  const name = boardName?.trim();

  const go = (path: string) => {
    // A full navigation rather than a router push: this tab is holding a
    // board document, a socket and a presence channel that all belong to a
    // session that is over, and leaving the page is the one thing certain to
    // let go of every one of them.
    window.location.href = new URL(path, webUrl).toString();
  };

  return (
    <SurfaceDialog
      open={open}
      theme={theme}
      alert
      // Escape, the backdrop and the close button all go with this.
      dismissable={false}
      // Phrased for every way of arriving here, not just the one that prompted
      // it: the token route answers the same 404 for "removed", "never had
      // access" and "board deleted", so a heading that claimed any one of them
      // would be wrong two-thirds of the time.
      title="You don’t have access to this board"
      subtitle={name ? name : 'This board'}
      leading={
        <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-danger-wash)] text-[var(--surface-danger)]">
          <ShieldOff className="size-[18px]" aria-hidden="true" />
        </span>
      }
      width={540}
      // Never called: nothing in this dialog asks to close, and the shell only
      // offers the routes out that `dismissable={false}` has already removed.
      onClose={() => {}}
      footer={
        <>
          <div className="flex-1" />
          {isGuest ? (
            <>
              {/* Kept alongside rather than hidden behind the primary action:
                  a guest identity is disposable, and plenty of people who
                  joined as one already have an account. */}
              <SurfaceButton variant="ghost" onClick={() => go('/login?next=/open')}>
                <LogIn size={13} aria-hidden="true" />
                Sign in
              </SurfaceButton>
              <SurfaceButton variant="primary" onClick={() => go('/signup')}>
                <UserPlus size={13} aria-hidden="true" />
                Create an account
              </SurfaceButton>
            </>
          ) : (
            /* /open resolves which board to land on — there is no board list
               page to send anyone to. */
            <SurfaceButton variant="primary" onClick={() => go('/open')}>
              Go to my workspace
            </SurfaceButton>
          )}
        </>
      }
    >
      <div className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
        {isGuest ? (
          <>
            It may have been unshared or deleted. This session has stopped syncing, and anything
            already drawn stays with the board. You joined as a guest, so there is nothing else here
            to go back to — an account gives you boards of your own.
          </>
        ) : (
          <>
            It may have been unshared or deleted. This session has stopped syncing, and anything
            already drawn stays with the board. Your own boards are unaffected.
          </>
        )}
      </div>
    </SurfaceDialog>
  );
}
