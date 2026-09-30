import { useState } from 'react';
import { Band, SettingRow, SettingsPage, Toggle } from './settings-ui';

/**
 * Which switches start on is the design's: the two that concern someone else
 * reaching you are on, and the three that are CanvasFlow talking to you are off.
 */
const INITIAL_SWITCHES = {
  boardShared: true,
  commentMentions: true,
  inviteAccepted: false,
  weeklyDigest: false,
  productUpdates: false,
};

type Switch = keyof typeof INITIAL_SWITCHES;

const EMAIL: [Switch, string, string, string][] = [
  ['boardShared', 'board-shared', 'Board shared with me', 'When someone invites you to a board'],
  ['commentMentions', 'comment-mentions', 'Comment mentions', 'When a collaborator tags you'],
  ['inviteAccepted', 'invite-accepted', 'Invite accepted', 'When someone joins a board you shared'],
];

const DIGEST: [Switch, string, string, string][] = [
  ['weeklyDigest', 'weekly-digest', 'Weekly digest', 'A summary of board activity each Monday'],
  ['productUpdates', 'product-updates', 'Product updates', 'New features and release notes'],
];

/**
 * Notifications: what CanvasFlow is allowed to email about.
 *
 * Nothing stores these yet, so a switch flips without the band claiming it
 * saved.
 */
export function NotificationsPane() {
  const [switches, setSwitches] = useState(INITIAL_SWITCHES);

  const rows = (list: [Switch, string, string, string][]) =>
    list.map(([key, setting, title, hint]) => (
      <SettingRow key={key} setting={setting} title={title} hint={hint}>
        <Toggle
          label={title}
          on={switches[key]}
          onChange={(next) => setSwitches((current) => ({ ...current, [key]: next }))}
        />
      </SettingRow>
    ));

  return (
    <SettingsPage lead="Choose what CanvasFlow emails you about.">
      <Band title="Email">{rows(EMAIL)}</Band>
      <Band title="Digest">{rows(DIGEST)}</Band>
    </SettingsPage>
  );
}
