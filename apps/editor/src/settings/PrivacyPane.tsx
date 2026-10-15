import { useEffect, useState } from 'react';
import { ACCOUNT_DELETION_GRACE_DAYS, TERMS_VERSION } from '@canvasflow/types';
import { formatTermsVersion, privacyUrl, termsUrl } from '@/lib/legal-links';
import { t as translate, useT } from '../i18n';
import type { Profile } from '../profile';
import { formatStorageSize, storageHint } from './account-format';
import {
  fetchDeletionPreview,
  type DeletionInput,
  type DeletionPreview,
} from './account-deletion-api';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { track } from '../analytics/analytics';
import { downloadFile } from '../file/save-file';
import { exportAllBoards, exportSummary, type OpenBoard } from './export-boards';
import { fetchStorageUsage, type StorageUsage } from './storage-api';
import {
  Band,
  ExternalLinkButton,
  SettingRow,
  SettingsButton,
  SettingsPage,
  Toggle,
  ValueText,
} from './settings-ui';

/** Data & Privacy: taking your boards with you, or closing the account. */
export function PrivacyPane({
  profile = null,
  token = null,
  signedInEmail = null,
  userId = null,
  isGuest = false,
  startDeleting = false,
  deleteAccount,
  openBoard = null,
  analytics = null,
  chooseAnalytics,
}: {
  /** The signed-in account, when there is one. It says which terms were agreed to. */
  profile?: Profile | null;
  /** Reaches the gateway, for deleting the account. */
  token?: string | null;
  /**
   * The address the sign-in token names. Known from the first render, so the
   * Delete account dialog can say what to type before anything has loaded.
   */
  signedInEmail?: string | null;
  userId?: string | null;
  /** A guest has no account, so there is nothing here for them to delete. */
  isGuest?: boolean;
  /** Open with the Delete account dialog up — back from signing in again. */
  startDeleting?: boolean;
  /** Ask for the account to be deleted, and leave once it is. The editor owns both. */
  deleteAccount?: (input: DeletionInput) => Promise<void>;
  /** The board on screen, exported as it is now rather than as last saved. */
  openBoard?: OpenBoard | null;
  /** The account's usage analytics answer: null before it has given one. */
  analytics?: boolean | null;
  /** Saves a new answer; resolves false when it could not. */
  chooseAnalytics?: (allow: boolean) => Promise<boolean>;
}) {
  const t = useT();
  const [analyticsSaving, setAnalyticsSaving] = useState(false);
  const [analyticsFailed, setAnalyticsFailed] = useState(false);
  const [deleting, setDeleting] = useState(startDeleting && !isGuest);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const canDelete = !isGuest && deleteAccount !== undefined;
  const storage = useStorageUsage(token);
  const exporter = useBoardsExport(token, openBoard);

  // Fetched as the pane opens rather than when the button is pressed, so the
  // Delete account dialog opens straight onto the fields it needs. A failed
  // refresh keeps the preview already held; the dialog only reports a failure
  // when it has nothing to go on.
  useEffect(() => {
    if (!canDelete) return;
    let cancelled = false;
    setPreviewError(null);
    fetchDeletionPreview(token).then(
      (loaded) => {
        if (!cancelled) setPreview(loaded);
      },
      (caught: unknown) => {
        if (!cancelled) {
          setPreviewError(
            caught instanceof Error ? caught.message : translate('common.somethingWentWrongRetry'),
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canDelete, token, previewAttempt]);

  // The agreement on record, when it is to the terms in force. Anything else is
  // what the terms notice is for, so here it only says when they last changed.
  const termsHint =
    profile?.termsVersion === TERMS_VERSION
      ? t('privacy.agreedTo', { date: formatTermsVersion(TERMS_VERSION) })
      : t('terms.lastUpdated', { date: formatTermsVersion(TERMS_VERSION) });

  return (
    <SettingsPage
      lead={t('settings.section.privacy.lead')}
      dialog={
        deleting && deleteAccount ? (
          <DeleteAccountDialog
            key="delete"
            token={token}
            userId={userId}
            preview={preview}
            loadError={previewError}
            fallbackEmail={profile?.email ?? signedInEmail}
            onRetry={() => setPreviewAttempt((n) => n + 1)}
            onClose={() => setDeleting(false)}
            deleteAccount={deleteAccount}
          />
        ) : undefined
      }
    >
      <Band title={t('settings.group.yourData')}>
        <SettingRow
          setting="export"
          title={t('settings.row.export')}
          hint={exporter.hint ?? t('privacy.exportHint')}
        >
          <SettingsButton onClick={exporter.start} disabled={!token || exporter.progress !== null}>
            {!exporter.progress
              ? t('privacy.export')
              : exporter.progress.total > 0
                ? t('privacy.exportingOf', {
                    done: exporter.progress.done,
                    total: exporter.progress.total,
                  })
                : t('privacy.exporting')}
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="storage-used"
          title={t('settings.row.storage-used')}
          hint={storage.usage ? storageHint(storage.usage) : t('privacy.storageHint')}
        >
          <ValueText>
            {storage.usage
              ? formatStorageSize(storage.usage.totalBytes)
              : storage.failed
                ? t('settings.unavailable')
                : '—'}
          </ValueText>
        </SettingRow>
        {!isGuest && (
          <SettingRow
            setting="analytics"
            title={t('settings.row.analytics')}
            hint={analyticsFailed ? t('privacy.analyticsFailed') : t('privacy.analyticsHint')}
          >
            <Toggle
              label={t('settings.row.analytics')}
              on={analytics === true}
              disabled={analyticsSaving || !chooseAnalytics}
              onChange={(on) => {
                if (!chooseAnalytics) return;
                setAnalyticsSaving(true);
                setAnalyticsFailed(false);
                void chooseAnalytics(on).then((saved) => {
                  setAnalyticsSaving(false);
                  setAnalyticsFailed(!saved);
                });
              }}
            />
          </SettingRow>
        )}
      </Band>

      {/* The editor has no footer, so this is where the legal pages are found
          from inside it. */}
      <Band title={t('settings.group.legal')}>
        <SettingRow setting="terms" title={t('settings.row.terms')} hint={termsHint}>
          <ExternalLinkButton href={termsUrl()} label={t('privacy.readTerms')}>
            {t('privacy.read')}
          </ExternalLinkButton>
        </SettingRow>
        <SettingRow
          setting="privacy-policy"
          title={t('settings.row.privacy-policy')}
          hint={t('privacy.policyHint')}
        >
          <ExternalLinkButton href={privacyUrl()} label={t('privacy.readPolicy')}>
            {t('privacy.read')}
          </ExternalLinkButton>
        </SettingRow>
      </Band>

      {!isGuest && (
        <Band title={t('settings.group.dangerZone')} danger>
          <SettingRow
            setting="delete-account"
            title={t('settings.row.delete-account')}
            hint={t('privacy.deleteHint', { days: ACCOUNT_DELETION_GRACE_DAYS })}
          >
            <SettingsButton
              variant="danger"
              onClick={() => setDeleting(true)}
              disabled={!deleteAccount}
            >
              {t('settings.row.delete-account')}
            </SettingsButton>
          </SettingRow>
        </Band>
      )}
    </SettingsPage>
  );
}

/**
 * The Storage used reading, fetched as the pane opens and again whenever the
 * window comes back into focus — a board drawn on in another tab, or an image
 * added there, shows up without reopening Settings. A failed refresh keeps the
 * reading already held rather than blanking it.
 */
function useStorageUsage(token: string | null): { usage: StorageUsage | null; failed: boolean } {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchStorageUsage(token).then(
        (loaded) => {
          if (cancelled) return;
          setUsage(loaded);
          setFailed(false);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [token]);

  return { usage, failed };
}

/**
 * Export all boards, run from the pane. The button counts the boards off as
 * they are packed, and the row's line then says what the download holds, or
 * why there is none. Leaving the pane mid-export lets it finish and download.
 */
function useBoardsExport(
  token: string | null,
  openBoard: OpenBoard | null,
): {
  start: () => void;
  progress: { done: number; total: number } | null;
  hint: string | null;
} {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const start = () => {
    if (!token || progress) return;
    setHint(null);
    setProgress({ done: 0, total: 0 });
    exportAllBoards({
      token,
      openBoard,
      onProgress: (done, total) => setProgress({ done, total }),
    })
      .then((result) => {
        if (!result) {
          setHint(translate('privacy.nothingToExport'));
          return;
        }
        // A plain download rather than the save picker: by now the click that
        // asked for this is too long ago for the picker to open.
        downloadFile(result.fileName, result.blob, 'application/zip');
        track('boards_exported', { boards: result.boards, library: result.libraryItems > 0 });
        setHint(exportSummary(result));
      })
      .catch((caught: unknown) => {
        setHint(caught instanceof Error ? caught.message : translate('privacy.exportFailed'));
      })
      .finally(() => setProgress(null));
  };

  return { start, progress, hint };
}
