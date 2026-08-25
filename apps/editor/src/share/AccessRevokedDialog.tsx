import { LogIn, ShieldOff, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { env } from '@/lib/env';

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
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  container: HTMLElement | null;
}

/**
 * The end of a session someone no longer has any claim on.
 *
 * There is deliberately no way to dismiss this — no cancel, no Escape, no
 * click-away. Every other dialog in the editor closes back onto the board,
 * and this one cannot: the board behind it is not theirs to return to, and
 * leaving it reachable would restore exactly the state this exists to end.
 * Its only actions navigate away.
 *
 * Which actions those are depends on who is looking. A guest joined by link
 * and has nowhere of their own to be sent, so the way out is an account —
 * offered rather than demanded, since they may already have one they simply
 * didn't use. Someone signed in goes back to their own boards.
 *
 * Built as the delete, share and rename dialogs are — a Card carried by a
 * dialog stripped to nothing — because it opens over the same editor and has
 * to read as the same application, even while it is closing that application
 * down.
 */
export function AccessRevokedDialog({
  open,
  boardName,
  isGuest,
  container,
}: AccessRevokedDialogProps) {
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
    /* Controlled open with no onOpenChange, deliberately: the alert dialog
       already ignores a click on the overlay, and a close it asks for and is
       never granted is how the remaining route out — Escape — is refused too. */
    <AlertDialog open={open} container={container}>
      <AlertDialogContent className="w-[min(100%-2rem,32rem)] gap-0 rounded-none border-0 bg-transparent p-0 text-foreground shadow-none">
        <Card className="w-full">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-destructive-solid/12 text-destructive-solid">
                <ShieldOff className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                {/* Phrased for every way of arriving here, not just the one
                    that prompted it: the token route answers the same 404 for
                    "removed", "never had access" and "board deleted", so a
                    heading that claimed any one of them would be wrong
                    two-thirds of the time. */}
                <AlertDialogTitle className="text-lg font-semibold text-foreground">
                  You don’t have access to this board
                </AlertDialogTitle>
                <p className="truncate text-sm text-muted-foreground">
                  {name ? name : 'This board'}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <AlertDialogDescription className="max-w-none text-sm leading-relaxed text-muted-foreground">
              {isGuest ? (
                <>
                  It may have been unshared or deleted. This session has stopped syncing, and
                  anything already drawn stays with the board. You joined as a guest, so there is
                  nothing else here to go back to — an account gives you boards of your own.
                </>
              ) : (
                <>
                  It may have been unshared or deleted. This session has stopped syncing, and
                  anything already drawn stays with the board. Your own boards are unaffected.
                </>
              )}
            </AlertDialogDescription>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {isGuest ? (
                <>
                  {/* Kept alongside rather than hidden behind the primary
                      action: a guest identity is disposable, and plenty of
                      people who joined as one already have an account. */}
                  <Button
                    type="button"
                    variant="ghost"
                    leftIcon={<LogIn aria-hidden="true" />}
                    onClick={() => go('/login?next=/open')}
                  >
                    Sign in
                  </Button>
                  <Button
                    type="button"
                    leftIcon={<UserPlus aria-hidden="true" />}
                    onClick={() => go('/signup')}
                  >
                    Create an account
                  </Button>
                </>
              ) : (
                /* /open resolves which board to land on — there is no board
                   list page to send anyone to. */
                <Button type="button" onClick={() => go('/open')}>
                  Go to my workspace
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </AlertDialogContent>
    </AlertDialog>
  );
}
