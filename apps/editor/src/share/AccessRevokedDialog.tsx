import { useId } from 'react';
import { LogIn, ShieldOff, UserPlus } from 'lucide-react';
import { env } from '@/lib/env';
import {
  SurfaceWindow,
  WindowBadge,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from '../ui/SurfaceWindow';
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
  const titleId = useId();
  const bodyId = useId();
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
    <SurfaceWindow
      open={open}
      theme={theme}
      alert
      // No ×, and Escape or a click outside do nothing.
      dismissable={false}
      // Never called: nothing in this dialog asks to close.
      onClose={() => {}}
      width={500}
      labelledBy={titleId}
      describedBy={bodyId}
      data-testid="access-revoked-dialog"
    >
      <WindowHeader
        titleId={titleId}
        // Phrased for every way of arriving here, not just the one that prompted
        // it: the token route answers the same 404 for "removed", "never had
        // access" and "board deleted", so a heading that claimed any one of them
        // would be wrong two-thirds of the time.
        title="You don’t have access to this board"
        description={name ? name : 'This board'}
        lead={
          <WindowBadge tone="danger">
            <ShieldOff aria-hidden="true" />
          </WindowBadge>
        }
      />

      <WindowBody>
        <p id={bodyId} className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
          It may have been unshared or deleted. This session has stopped syncing, and anything
          already drawn stays with the board.{' '}
          {isGuest
            ? 'You joined as a guest, so there is nothing else here to go back to. An account gives you boards of your own.'
            : 'Your own boards are unaffected.'}
        </p>
      </WindowBody>

      <WindowFooter>
        {isGuest ? (
          <>
            {/* Kept alongside rather than hidden behind the primary action:
                a guest identity is disposable, and plenty of people who
                joined as one already have an account. */}
            <WindowButton variant="ghost" onClick={() => go('/login?next=/open')}>
              <LogIn aria-hidden="true" />
              Sign in
            </WindowButton>
            <WindowButton variant="primary" onClick={() => go('/signup')}>
              <UserPlus aria-hidden="true" />
              Create an account
            </WindowButton>
          </>
        ) : (
          /* /open resolves which board to land on — there is no board list
             page to send anyone to. */
          <WindowButton variant="primary" onClick={() => go('/open')}>
            Go to my workspace
          </WindowButton>
        )}
      </WindowFooter>
    </SurfaceWindow>
  );
}
