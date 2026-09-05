import { LogOut, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  container: HTMLElement | null;
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
 * Built as the delete, share and rename dialogs are — a Card carried by a
 * dialog stripped to nothing — because it opens over the same editor and has
 * to read as the same application on its way out of it.
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
  container,
}: SignOutDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange} container={container}>
      <AlertDialogContent className="w-[min(100%-2rem,32rem)] gap-0 rounded-none border-0 bg-transparent p-0 text-foreground shadow-none">
        <Card className="w-full">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <LogOut className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle className="text-lg font-semibold text-foreground">
                  Sign out?
                </AlertDialogTitle>
                {/* The account, spelled out: the sidebar row that opened this
                    is collapsed to an initial half the time, and "sign out"
                    with no name on it is how you sign the wrong one out. */}
                <p className="truncate text-sm text-muted-foreground">
                  {email ? `${name} · ${email}` : name}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <AlertDialogDescription className="max-w-none text-sm leading-relaxed text-muted-foreground">
              {isGuest ? (
                <>
                  You joined this board by link, as a guest. Everything you have drawn stays on the
                  board, but this guest identity ends here — the link will let you back in as
                  someone new rather than as {name}.
                </>
              ) : (
                <>
                  This device is signed out and sent back to the sign-in page. The board is
                  unaffected, and everything on it is waiting when you sign back in.
                </>
              )}
            </AlertDialogDescription>

            {/* Only when there is something to lose. The board's cached copy is
                held under the signing-in identity, so for an account it is
                picked up again on the next sign-in and this is a delay; for a
                guest there is no identity to come back as, and it is a loss. */}
            {!synced && (
              <p className="flex gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive-solid" />
                <span>
                  This board isn’t connected right now, so anything drawn since it dropped hasn’t
                  reached the server.{' '}
                  {isGuest
                    ? 'It is held on this device under a guest identity you cannot sign back into, so it will not reach the board. Reconnect first if you want to keep it.'
                    : 'It is kept on this device and sent the next time you open the board as this account.'}
                </span>
              </p>
            )}

            <div className="flex justify-end gap-2">
              {/* Focus lands here when the dialog opens: the button that ends
                  the session is never the one under the first keystroke. */}
              <AlertDialogCancel asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  Cancel
                </Button>
              </AlertDialogCancel>
              {/* An ordinary button, not AlertDialogAction: Radix would close
                  the dialog on click, and there is nothing to close onto — the
                  page is leaving, and a dialog that vanishes first leaves the
                  board looking untouched while it does. */}
              <Button
                type="button"
                disabled={busy}
                loading={busy}
                leftIcon={<LogOut aria-hidden="true" />}
                onClick={onConfirm}
                data-testid="sign-out-confirm"
              >
                {busy ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </AlertDialogContent>
    </AlertDialog>
  );
}
