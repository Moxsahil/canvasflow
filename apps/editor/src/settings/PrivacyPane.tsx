import { useState } from 'react';
import {
  Card,
  DangerButton,
  GroupLabel,
  Row,
  RowText,
  SecondaryButton,
  SettingsPane,
  Toggle,
  ValueText,
} from './settings-ui';

/** Data & Privacy: taking your boards with you, or closing the account. */
export function PrivacyPane({ onClose }: { onClose: () => void }) {
  const [analytics, setAnalytics] = useState(true);

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
