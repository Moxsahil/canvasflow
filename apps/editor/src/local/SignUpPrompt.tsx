import { useId } from 'react';
import { FolderInput, LogIn, MessageCircle, UserPlus, Users } from 'lucide-react';
import { DiagramMark } from '../diagrams/DiagramMark';
import { useT } from '../i18n';
import {
  SurfaceWindow,
  WindowBadge,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';
import { leaveForAccount } from './carry';

/** What was asked for on the local board that only an account's board can do. */
export type SignUpReason = 'share' | 'comment' | 'diagram';

interface SignUpPromptProps {
  /** Null when closed. */
  reason: SignUpReason | null;
  /** Someone already signed in moves the drawing to their account, rather than signing in again. */
  signedIn: boolean;
  theme: SurfaceTheme;
  onClose: () => void;
}

/**
 * What the board kept in this browser says when asked for something that
 * needs the server: sharing it, commenting on it, or generating a diagram.
 *
 * Offered rather than demanded — it closes back onto the board, which keeps
 * everything drawn on it. Sign in sits beside Create account because plenty of
 * people who open the editor straight from a search already have one.
 *
 * Every way on takes the drawing along into the account (see carry.ts), and
 * opens the share window once it is there when sharing is what was asked for.
 * Someone already signed in has one way on: moving it to their account.
 */
export function SignUpPrompt({ reason, signedIn, theme, onClose }: SignUpPromptProps) {
  const t = useT();
  const titleId = useId();
  const bodyId = useId();
  // Held through the closing animation, so the words do not change under it.
  const shown = reason ?? 'share';
  const share = shown === 'share';

  return (
    <SurfaceWindow
      open={reason !== null}
      theme={theme}
      onClose={onClose}
      width={460}
      labelledBy={titleId}
      describedBy={bodyId}
      data-testid="sign-up-prompt"
    >
      <WindowHeader
        titleId={titleId}
        title={t(
          shown === 'share'
            ? 'local.prompt.shareTitle'
            : shown === 'diagram'
              ? 'local.prompt.diagramTitle'
              : 'local.prompt.commentTitle',
        )}
        lead={
          <WindowBadge tone="soft">
            {shown === 'share' ? (
              <Users aria-hidden="true" />
            ) : shown === 'diagram' ? (
              <DiagramMark />
            ) : (
              <MessageCircle aria-hidden="true" />
            )}
          </WindowBadge>
        }
        onClose={onClose}
      />

      <WindowBody>
        <p id={bodyId} className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
          {t('local.prompt.body')} {t(signedIn ? 'local.prompt.signedIn' : 'local.prompt.account')}
        </p>
      </WindowBody>

      <WindowFooter>
        {signedIn ? (
          <WindowButton
            variant="primary"
            onClick={() => leaveForAccount('yourBoards', { share, carry: true })}
          >
            <FolderInput aria-hidden="true" />
            {t('local.prompt.moveToAccount')}
          </WindowButton>
        ) : (
          <>
            <WindowButton variant="ghost" onClick={() => leaveForAccount('signIn', { share })}>
              <LogIn aria-hidden="true" />
              {t('menu.signIn')}
            </WindowButton>
            <WindowButton variant="primary" onClick={() => leaveForAccount('signUp', { share })}>
              <UserPlus aria-hidden="true" />
              {t('menu.signUp')}
            </WindowButton>
          </>
        )}
      </WindowFooter>
    </SurfaceWindow>
  );
}
