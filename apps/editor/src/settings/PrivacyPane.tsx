import { useState } from 'react';
import { TERMS_VERSION } from '@canvasflow/types';
import { formatTermsVersion, privacyUrl, termsUrl } from '@/lib/legal-links';
import type { Profile } from '../profile';
import {
  Card,
  DangerButton,
  ExternalLinkButton,
  GroupLabel,
  Row,
  RowText,
  SecondaryButton,
  SettingsPane,
  Toggle,
  ValueText,
} from './settings-ui';

/** Data & Privacy: taking your boards with you, or closing the account. */
export function PrivacyPane({
  onClose,
  profile = null,
}: {
  onClose: () => void;
  /** The signed-in account, when there is one. It says which terms were agreed to. */
  profile?: Profile | null;
}) {
  const [analytics, setAnalytics] = useState(true);

  // The agreement on record, when it is to the terms in force. Anything else is
  // what the terms notice is for, so here it only says when they last changed.
  const termsHint =
    profile?.termsVersion === TERMS_VERSION
      ? `You agreed to the version of ${formatTermsVersion(TERMS_VERSION)}`
      : `Last updated ${formatTermsVersion(TERMS_VERSION)}`;

  return (
    <SettingsPane
      title="Data & Privacy"
      subtitle="Export your boards or close your account."
      onClose={onClose}
    >
      <GroupLabel>Your data</GroupLabel>
      <Card>
        <Row>
          <RowText title="Export all boards" hint="Download every board as .canvasflow JSON" />
          <SecondaryButton>Export</SecondaryButton>
        </Row>
        <Row>
          <RowText title="Storage used" hint="Across 3 boards in this workspace" />
          <ValueText>48 MB</ValueText>
        </Row>
        <Row>
          <RowText title="Usage analytics" hint="Share anonymous data to improve CanvasFlow" />
          <Toggle label="Usage analytics" on={analytics} onChange={setAnalytics} />
        </Row>
      </Card>

      {/* The editor has no footer, so this is where the legal pages are found
          from inside it. */}
      <GroupLabel>Legal</GroupLabel>
      <Card>
        <Row>
          <RowText title="Terms of Service" hint={termsHint} />
          <ExternalLinkButton href={termsUrl()} label="Read the Terms of Service">
            Read
          </ExternalLinkButton>
        </Row>
        <Row>
          <RowText title="Privacy Policy" hint="What we collect, and your rights over it" />
          <ExternalLinkButton href={privacyUrl()} label="Read the Privacy Policy">
            Read
          </ExternalLinkButton>
        </Row>
      </Card>

      <GroupLabel>Danger zone</GroupLabel>
      <Card>
        <Row>
          <RowText
            title="Delete account"
            hint="Permanently removes your boards. This cannot be undone."
          />
          <DangerButton>Delete account</DangerButton>
        </Row>
      </Card>
    </SettingsPane>
  );
}
