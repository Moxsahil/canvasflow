import { Card, GroupLabel, Row, RowText, SecondaryButton, SettingsPane } from './settings-ui';

/** Account & Security: how you get in, and what is currently signed in. */
export function AccountPane({ onClose }: { onClose: () => void }) {
  return (
    <SettingsPane
      title="Account & Security"
      subtitle="Sign-in methods, active sessions, and account deletion."
      onClose={onClose}
    >
      <GroupLabel>Sign-in</GroupLabel>
      <Card>
        <Row>
          <RowText title="Password" hint="Last changed 3 months ago" />
          <SecondaryButton>Change</SecondaryButton>
        </Row>
        <Row>
          <RowText title="Connected accounts" hint="Google, GitHub" />
          <SecondaryButton>Manage</SecondaryButton>
        </Row>
        <Row>
          <RowText title="Two-factor authentication" hint="Require a second step at sign-in" />
          <SecondaryButton>Set up</SecondaryButton>
        </Row>
      </Card>

      <GroupLabel>Sessions</GroupLabel>
      <Card>
        <Row>
          <RowText title="Active sessions" hint="3 devices signed in right now" />
          <SecondaryButton>View all</SecondaryButton>
        </Row>
        <Row>
          <RowText title="Sign out everywhere" hint="Ends every session except this one" />
          <SecondaryButton>Sign out all</SecondaryButton>
        </Row>
      </Card>
    </SettingsPane>
  );
}
