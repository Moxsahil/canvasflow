import { useState } from 'react';
import { Archive } from 'lucide-react';
import { useT } from '../i18n';

export interface ArchivedNoticeProps {
  /** You may bring it back: you made it, or you run its workspace. */
  canUnarchive: boolean;
  /** Rejects when the server refuses; the switcher has said why by then. */
  onUnarchive: () => Promise<void>;
}

/**
 * "Archived", top right, where "View only" stands on a board one may not
 * change — the same badge, saying the reason instead.
 *
 * An archived board is read-only for everyone, and a board that will not take
 * a stroke with nothing saying why reads as broken. Whoever may bring it back
 * gets the button beside it; everyone else is told who can, on hover, as the
 * view-only badge tells a viewer.
 */
export function ArchivedNotice({ canUnarchive, onUnarchive }: ArchivedNoticeProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  return (
    <span
      role="status"
      data-testid="archived-notice"
      title={canUnarchive ? t('archived.hintManager') : t('archived.hintOthers')}
      className={`cf-peer-list__badge cf-peer-list__badge--archived${canUnarchive ? ' cf-peer-list__badge--action' : ''}`}
    >
      <Archive aria-hidden="true" className="size-3.5 shrink-0" />
      {t('archived.notice')}
      {canUnarchive && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onUnarchive().then(
              () => setBusy(false),
              () => setBusy(false),
            );
          }}
          data-testid="archived-notice-unarchive"
          className="h-6 shrink-0 rounded-md bg-sidebar-accent px-2 font-medium text-sidebar-accent-foreground outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent/80 focus-visible:ring-2 disabled:opacity-60"
        >
          {t('boards.unarchive')}
        </button>
      )}
    </span>
  );
}
