import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Radio, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isMac } from '../help/platform';
import { INPUT } from '../settings/settings-ui';
import {
  SurfaceWindow,
  WindowBadge,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from './SurfaceWindow';
import type { SurfaceTheme } from './surface-palette';

export interface Notice {
  title: string;
  body: string;
  /** How it went: `ok` when it worked, `warn` when it didn't, or only partly. */
  tone: 'ok' | 'warn';
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
      () => setStatus('Copied again.'),
      () => {
        fieldRef.current?.select();
        setStatus(`Selected: press ${isMac() ? '⌘C' : 'Ctrl C'} to copy.`);
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
        lead={
          <WindowBadge tone={shown.tone}>
            {shown.tone === 'ok' ? (
              <Check aria-hidden="true" />
            ) : (
              <TriangleAlert aria-hidden="true" />
            )}
          </WindowBadge>
        }
        onClose={onClose}
      />

      {link && (
        <WindowBody>
          <div className="flex gap-[6px]">
            <input
              ref={fieldRef}
              readOnly
              value={link.url}
              aria-label="Board link"
              onFocus={(event) => event.currentTarget.select()}
              className={cn(INPUT, 'min-w-0 flex-1')}
            />
            <WindowButton onClick={copyAgain}>
              <Copy aria-hidden="true" />
              {link.copied ? 'Copy again' : 'Try again'}
            </WindowButton>
          </div>
        </WindowBody>
      )}

      <WindowFooter status={status}>
        {link && onLiveCollaboration && (
          <WindowButton variant="ghost" onClick={onLiveCollaboration}>
            <Radio aria-hidden="true" />
            Live collaboration
          </WindowButton>
        )}
        <WindowButton variant="primary" autoFocus data-autofocus onClick={onClose}>
          Got it
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}
