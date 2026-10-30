import { useId } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
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
  isGuest,
  synced,
  busy,
  onConfirm,
  theme,
}: SignOutDialogProps) {
  const t = useT();
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
        title={t('signOut.title')}
        onClose={busy ? undefined : close}
      />

      <WindowBody>
        <p id={bodyId} className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
          {isGuest ? t('signOut.guestBody', { name }) : t('signOut.body')}
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
              {t('signOut.notSynced')}{' '}
              {isGuest ? t('signOut.notSyncedGuest') : t('signOut.notSyncedAccount')}
            </span>
          </div>
        )}
      </WindowBody>

      <WindowFooter>
        {/* Focus lands here: the button that ends the session is never the
            one under the first keystroke. */}
        <WindowButton disabled={busy} autoFocus data-autofocus onClick={close}>
          {t('common.cancel')}
        </WindowButton>
        <WindowButton
          variant="primary"
          busy={busy}
          busyLabel={t('signOut.busy')}
          onClick={onConfirm}
          data-testid="sign-out-confirm"
        >
          {t('menu.signOut')}
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}
