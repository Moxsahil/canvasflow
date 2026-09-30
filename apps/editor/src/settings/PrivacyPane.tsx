import { useEffect, useState } from 'react';
import { ACCOUNT_DELETION_GRACE_DAYS, TERMS_VERSION } from '@canvasflow/types';
import { formatTermsVersion, privacyUrl, termsUrl } from '@/lib/legal-links';
import type { Profile } from '../profile';
import {
  fetchDeletionPreview,
  type DeletionInput,
  type DeletionPreview,
} from './account-deletion-api';
import { DeleteAccountDialog } from './DeleteAccountDialog';
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
}) {
  const [analytics, setAnalytics] = useState(true);
  const [deleting, setDeleting] = useState(startDeleting && !isGuest);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const canDelete = !isGuest && deleteAccount !== undefined;

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
            caught instanceof Error ? caught.message : 'Something went wrong. Try again.',
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
      ? `You agreed to the version of ${formatTermsVersion(TERMS_VERSION)}`
      : `Last updated ${formatTermsVersion(TERMS_VERSION)}`;

  return (
    <SettingsPage
      lead="Export your boards or close your account."
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
      {/* Nothing stores the analytics choice yet, so the band does not claim
          it saved. */}
      <Band title="Your data">
        <SettingRow
          setting="export"
          title="Export all boards"
          hint="Download every board as .canvasflow JSON"
        >
          <SettingsButton>Export</SettingsButton>
        </SettingRow>
        <SettingRow
          setting="storage-used"
          title="Storage used"
          hint="Across 3 boards in this workspace"
        >
          <ValueText>48 MB</ValueText>
        </SettingRow>
        <SettingRow
          setting="analytics"
          title="Usage analytics"
          hint="Share anonymous data to improve CanvasFlow"
        >
          <Toggle label="Usage analytics" on={analytics} onChange={setAnalytics} />
        </SettingRow>
      </Band>

      {/* The editor has no footer, so this is where the legal pages are found
          from inside it. */}
      <Band title="Legal">
        <SettingRow setting="terms" title="Terms of Service" hint={termsHint}>
          <ExternalLinkButton href={termsUrl()} label="Read the Terms of Service">
            Read
          </ExternalLinkButton>
        </SettingRow>
        <SettingRow
          setting="privacy-policy"
          title="Privacy Policy"
          hint="What we collect, and your rights over it"
        >
          <ExternalLinkButton href={privacyUrl()} label="Read the Privacy Policy">
            Read
          </ExternalLinkButton>
        </SettingRow>
      </Band>

      {!isGuest && (
        <Band title="Danger zone" danger>
          <SettingRow
            setting="delete-account"
            title="Delete account"
            hint={`Deletes your account and the boards you own. You’ll have ${ACCOUNT_DELETION_GRACE_DAYS} days to change your mind.`}
          >
            <SettingsButton
              variant="danger"
              onClick={() => setDeleting(true)}
              disabled={!deleteAccount}
            >
              Delete account
            </SettingsButton>
          </SettingRow>
        </Band>
      )}
    </SettingsPage>
  );
}
