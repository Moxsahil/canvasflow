import { useState } from 'react';
import { Card, GroupLabel, Row, RowText, SettingsPane, Toggle } from './settings-ui';

/**
 * Which switches start on is the design's, read off where each knob sits: the
 * two that concern someone else reaching you are on, and the three that are
 * CanvasFlow talking to you are off.
 */
const INITIAL_SWITCHES = {
  boardShared: true,
  commentMentions: true,
  inviteAccepted: false,
  weeklyDigest: false,
  productUpdates: false,
};

/** Notifications: what CanvasFlow is allowed to email about. */
export function NotificationsPane({ onClose }: { onClose: () => void }) {
  const [switches, setSwitches] = useState(INITIAL_SWITCHES);
  const set = (key: keyof typeof INITIAL_SWITCHES) => (next: boolean) =>
    setSwitches((current) => ({ ...current, [key]: next }));

  return (
    <SettingsPane
      title="Notifications"
      subtitle="Choose what CanvasFlow emails you about."
      onClose={onClose}
    >
      <GroupLabel>Email</GroupLabel>
      <Card>
        <Row>
          <RowText title="Board shared with me" hint="When someone invites you to a board" />
          <Toggle
            label="Board shared with me"
            on={switches.boardShared}
            onChange={set('boardShared')}
          />
        </Row>
        <Row>
          <RowText title="Comment mentions" hint="When a collaborator tags you" />
          <Toggle
            label="Comment mentions"
            on={switches.commentMentions}
            onChange={set('commentMentions')}
          />
        </Row>
        <Row>
          <RowText title="Invite accepted" hint="When someone joins a board you shared" />
          <Toggle
            label="Invite accepted"
            on={switches.inviteAccepted}
            onChange={set('inviteAccepted')}
          />
        </Row>
      </Card>

      <GroupLabel>Digest</GroupLabel>
      <Card>
        <Row>
          <RowText title="Weekly digest" hint="A summary of board activity each Monday" />
          <Toggle label="Weekly digest" on={switches.weeklyDigest} onChange={set('weeklyDigest')} />
        </Row>
        <Row>
          <RowText title="Product updates" hint="New features and release notes" />
          <Toggle
            label="Product updates"
            on={switches.productUpdates}
            onChange={set('productUpdates')}
          />
        </Row>
      </Card>
    </SettingsPane>
  );
}
