import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { isMac } from '../help/platform';
import { useT } from '../i18n';
import { INPUT } from '../settings/settings-ui';
import {
  SurfaceWindow,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from './SurfaceWindow';
import type { SurfaceTheme } from './surface-palette';

export interface Notice {
  title: string;
  body: string;
  /**
   * The link a notice is about, on show so it can be copied again — or, when
   * copying it failed, copied by hand.
   */
  link?: { url: string; copied: boolean };
}

interface NoticeDialogProps {
  notice: Notice | null;
  theme: SurfaceTheme;
  onClose: () => void;
  /** Offered beside Got it on a link notice: how to invite someone new. */
  onLiveCollaboration?: () => void;
}

/**
 * What the editor says when something it was asked to do is done, or could
 * not be: a link copied, a file that would not open or save.
 *
 * The badge says how it went before the words do — a tick, or an amber
 * warning — and a notice about a link shows the link itself, with a way to copy
 * it again. Got it takes focus, so Enter or Escape puts it away.
 */
export function NoticeDialog({ notice, theme, onClose, onLiveCollaboration }: NoticeDialogProps) {
  const t = useT();
  const titleId = useId();
  const bodyId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Kept while it sinks away, so the window doesn't empty as it leaves.
  const last = useRef(notice);
  if (notice) last.current = notice;
  const shown = notice ?? last.current;

  useEffect(() => setStatus(null), [notice]);

  if (!shown) return null;
  const { link } = shown;

  const copyAgain = () => {
    if (!link) return;
    navigator.clipboard.writeText(link.url).then(
      () => setStatus(t('notice.copiedAgain')),
      () => {
        fieldRef.current?.select();
        setStatus(t('notice.pressToCopy', { keys: isMac() ? '⌘C' : 'Ctrl C' }));
      },
    );
  };

  return (
    <SurfaceWindow
      open={notice !== null}
      theme={theme}
      onClose={onClose}
      width={440}
      labelledBy={titleId}
      describedBy={bodyId}
      data-testid="notice-dialog"
    >
      <WindowHeader
        titleId={titleId}
        title={shown.title}
        description={shown.body}
        descriptionId={bodyId}
        onClose={onClose}
      />

      {link && (
        <WindowBody>
          <input
            ref={fieldRef}
            readOnly
            value={link.url}
            aria-label={t('notice.boardLink')}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(INPUT, 'h-[36px] min-w-0')}
          />
        </WindowBody>
      )}

      <WindowFooter status={status}>
        {link ? (
          <>
            <WindowButton onClick={copyAgain}>
              {link.copied ? t('notice.copyAgain') : t('common.tryAgain')}
            </WindowButton>
            {onLiveCollaboration ? (
              <WindowButton variant="primary" onClick={onLiveCollaboration}>
                {t('notice.liveCollaboration')}
              </WindowButton>
            ) : (
              <WindowButton variant="primary" autoFocus data-autofocus onClick={onClose}>
                {t('common.gotIt')}
              </WindowButton>
            )}
          </>
        ) : (
          <WindowButton variant="primary" autoFocus data-autofocus onClick={onClose}>
            {t('common.gotIt')}
          </WindowButton>
        )}
      </WindowFooter>
    </SurfaceWindow>
  );
}
