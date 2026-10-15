import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationKind,
  type NotificationSettings,
} from '@canvasflow/types';
import { t as translate, useT, type TranslationKey } from '../i18n';
import { useAccountChanges } from '../sync/account-events';
import {
  knownNotificationSettings,
  loadNotificationSettings,
  saveNotificationSettings,
} from './notifications-api';
import { useBand, type BandStatus } from './settings-frame';
import { Band, SettingRow, SettingsPage, Toggle } from './settings-ui';

type Row = [NotificationKind, string, TranslationKey, TranslationKey];

const EMAIL: Row[] = [
  [
    'accessChanges',
    'access-changes',
    'settings.row.access-changes',
    'notifications.accessChangesHint',
  ],
  [
    'commentMentions',
    'comment-mentions',
    'settings.row.comment-mentions',
    'notifications.commentMentionsHint',
  ],
  [
    'inviteAccepted',
    'invite-accepted',
    'settings.row.invite-accepted',
    'notifications.inviteAcceptedHint',
  ],
];

const DIGEST: Row[] = [
  ['weeklyDigest', 'weekly-digest', 'settings.row.weekly-digest', 'notifications.weeklyDigestHint'],
  [
    'productUpdates',
    'product-updates',
    'settings.row.product-updates',
    'notifications.productUpdatesHint',
  ],
];

type Load = 'loading' | 'ready' | 'error';

interface NotificationSwitches {
  settings: NotificationSettings;
  load: Load;
  flip: (kind: NotificationKind, on: boolean, band: BandStatus | null) => void;
}

/**
 * The switches as saved, kept current while the window is open.
 *
 * A flip shows at once and is saved behind it; a refusal puts the switch back
 * and the band says why. Another tab or device flipping one is heard through
 * the board's socket and read again — but never while a flip of this tab's is
 * still on its way, since the read could predate it and flip the switch back.
 * Such a read waits for the saves and runs after them.
 */
function useNotificationSwitches(token: string | null, enabled: boolean): NotificationSwitches {
  const [settings, setSettings] = useState<NotificationSettings>(
    () => knownNotificationSettings() ?? DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [load, setLoad] = useState<Load>(() => (knownNotificationSettings() ? 'ready' : 'loading'));
  const saving = useRef(0);
  const readAfterSaves = useRef(false);
  // Moves on with every flip, so a read that started before one is not shown.
  const flips = useRef(0);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const read = useCallback(() => {
    if (!enabled) return;
    if (saving.current > 0) {
      readAfterSaves.current = true;
      return;
    }
    const startedAt = flips.current;
    loadNotificationSettings(tokenRef.current).then(
      (next) => {
        if (startedAt !== flips.current) return;
        setSettings(next);
        setLoad('ready');
      },
      () => {
        // Switches already shown stay usable; only a first read that failed says so.
        if (startedAt === flips.current) setLoad((was) => (was === 'ready' ? was : 'error'));
      },
    );
  }, [enabled]);

  useEffect(read, [read]);
  useAccountChanges('notifications', read);

  const flip = useCallback(
    (kind: NotificationKind, on: boolean, band: BandStatus | null) => {
      flips.current += 1;
      saving.current += 1;
      band?.clear();
      setSettings((current) => ({ ...current, [kind]: on }));

      saveNotificationSettings(tokenRef.current, { [kind]: on })
        .then(
          (saved) => {
            // Another flip still on its way would be undone by this answer.
            if (saving.current === 1) setSettings(saved);
            band?.saved();
          },
          (error: unknown) => {
            // Put it back, then ask what is saved: a later flip may have landed.
            setSettings((current) => ({ ...current, [kind]: !on }));
            readAfterSaves.current = true;
            band?.failed(error instanceof Error ? error.message : translate('settings.saveFailed'));
          },
        )
        .finally(() => {
          saving.current -= 1;
          if (saving.current === 0 && readAfterSaves.current) {
            readAfterSaves.current = false;
            read();
          }
        });
    },
    [read],
  );

  return { settings, load, flip };
}

/** One switch. Inside its band, so the band can say it saved. */
function NotificationSwitch({
  row: [kind, setting, titleKey, hintKey],
  switches,
  disabled,
}: {
  row: Row;
  switches: NotificationSwitches;
  disabled: boolean;
}) {
  const t = useT();
  const band = useBand();
  const title = t(titleKey);
  return (
    <SettingRow setting={setting} title={title} hint={t(hintKey)}>
      <Toggle
        label={title}
        on={switches.settings[kind]}
        disabled={disabled}
        onChange={(next) => switches.flip(kind, next, band)}
      />
    </SettingRow>
  );
}

/**
 * Notifications: what CanvasFlow is allowed to email about.
 *
 * Saved to the account as each switch flips, and followed live: flip one in
 * another tab or on another device and it flips here too. A guest has no
 * address to write to, so their switches are shown off and cannot be moved.
 */
export function NotificationsPane({
  token = null,
  isGuest = false,
}: {
  token?: string | null;
  isGuest?: boolean;
}) {
  const t = useT();
  const switches = useNotificationSwitches(token, !isGuest);
  const disabled = isGuest || switches.load !== 'ready';
  const error = switches.load === 'error' && !isGuest ? t('notifications.loadFailed') : null;

  const rows = (list: Row[]) =>
    list.map((row) => (
      <NotificationSwitch
        key={row[0]}
        row={row}
        switches={isGuest ? { ...switches, settings: ALL_OFF } : switches}
        disabled={disabled}
      />
    ));

  return (
    <SettingsPage
      lead={isGuest ? t('notifications.guestLead') : t('settings.section.notifications.lead')}
    >
      <Band title={t('settings.group.email')} error={error}>
        {rows(EMAIL)}
      </Band>
      <Band title={t('settings.group.digest')}>{rows(DIGEST)}</Band>
    </SettingsPage>
  );
}

const ALL_OFF: NotificationSettings = {
  accessChanges: false,
  commentMentions: false,
  inviteAccepted: false,
  weeklyDigest: false,
  productUpdates: false,
};
