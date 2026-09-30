import { useId } from 'react';
import { LogOut, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonAvatar } from '../ui/PersonAvatar';
import {
  SurfaceWindow,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name of the session being ended. */
  name: string;
  /** Shown under the name so the dialog says *which* account is leaving. */
  email: string | null;
  /** The account's photo, when it has one; the initials stand in otherwise. */
  avatarUrl?: string | null;
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
 * one that opens a board, and because it leaves the page. The badge is whoever
 * is leaving, and Log out is drawn as the context menu's Delete row is: red
 * text on no fill, and the same red behind it on hover. A warning appears only
 * when something is at stake — a board that has not finished reaching the
 * server. Amber for an account, whose drawing waits on this device; red for a
 * guest, who would lose it.
 */
export function SignOutDialog({
  open,
  onOpenChange,
  name,
  email,
  avatarUrl = null,
  isGuest,
  synced,
  busy,
  onConfirm,
  theme,
}: SignOutDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const close = () => onOpenChange(false);

  return (
    <SurfaceWindow
      open={open}
      theme={theme}
      onClose={close}
      width={460}
      labelledBy={titleId}
      describedBy={bodyId}
      alert
      data-testid="sign-out-dialog"
    >
      <WindowHeader
        titleId={titleId}
        title="Log out?"
        // The account, spelled out: the sidebar row that opened this is
        // collapsed to an initial half the time.
        description={
          <span className="flex items-center gap-[6px]">
            {isGuest ? (
              <>
                {name}
                <span className="inline-flex h-[20px] items-center rounded-full bg-[var(--surface-wash)] px-[7px] text-[10.5px] font-medium">
                  Guest
                </span>
              </>
            ) : email ? (
              `${name} · ${email}`
            ) : (
              name
            )}
          </span>
        }
        lead={
          <span className="relative shrink-0" aria-hidden="true">
            <PersonAvatar
              url={avatarUrl}
              name={name}
              className="size-[36px] bg-[var(--surface-accent)] text-[12px] font-semibold text-[var(--surface-on-accent)]"
            />
            <span className="absolute -right-[4px] -bottom-[4px] flex size-[18px] items-center justify-center rounded-full bg-[var(--surface-panel)] text-[var(--surface-fg)] shadow-[0_0_0_1px_var(--surface-border)]">
              <LogOut className="size-[10px]" strokeWidth={2.5} />
            </span>
          </span>
        }
        onClose={busy ? undefined : close}
      />

      <WindowBody>
        <p id={bodyId} className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
          {isGuest
            ? `You joined this board by link, as a guest. Everything you have drawn stays on the board, but this guest identity ends here. The link will let you back in as someone new rather than as ${name}.`
            : 'This device is logged out and sent back to the sign-in page. The board is unaffected, and everything on it is waiting when you log back in.'}
        </p>

        {!synced && (
          <div
            className={cn(
              'flex items-start gap-[9px] rounded-[10px] px-[12px] py-[10px] text-[11.5px] leading-[1.6] text-[var(--surface-fg)]',
              isGuest ? 'bg-[var(--surface-danger-wash)]' : 'bg-[var(--surface-warn-wash)]',
            )}
          >
            <TriangleAlert
              className={cn(
                'mt-[2px] size-[14px] shrink-0',
                isGuest ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-warn)]',
              )}
              aria-hidden="true"
            />
            <span>
              This board isn’t connected right now, so anything drawn since it dropped hasn’t
              reached the server.{' '}
              {isGuest
                ? 'It is held on this device under a guest identity you cannot log back into, so it will not reach the board. Reconnect first if you want to keep it.'
                : 'It is kept on this device and sent the next time you open the board as this account.'}
            </span>
          </div>
        )}
      </WindowBody>

      <WindowFooter>
        {/* Focus lands here: the button that ends the session is never the
            one under the first keystroke. */}
        <WindowButton variant="ghost" disabled={busy} autoFocus data-autofocus onClick={close}>
          Cancel
        </WindowButton>
        <WindowButton
          variant="ghost"
          disabled={busy}
          onClick={onConfirm}
          data-testid="sign-out-confirm"
          // A touch stronger than the menu's 14.5% and 40%, so the red that shows
          // over this window's surface is the same one Delete shows over the menu's.
          className="text-red-400 hover:bg-red-500/[17%] hover:text-red-400 focus-visible:ring-red-400 dark:hover:bg-red-500/[43%]"
        >
          {!busy && <LogOut aria-hidden="true" />}
          {busy ? 'Logging out…' : 'Log out'}
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}
