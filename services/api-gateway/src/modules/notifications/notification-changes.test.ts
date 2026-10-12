import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  notificationSettingsFrom,
  parseNotificationChanges,
} from '@canvasflow/types';

describe('parseNotificationChanges', () => {
  it('takes one switch or several, each true or false', () => {
    expect(parseNotificationChanges({ commentMentions: false })).toEqual({
      ok: true,
      changes: { commentMentions: false },
    });
    expect(parseNotificationChanges({ weeklyDigest: true, productUpdates: false })).toEqual({
      ok: true,
      changes: { weeklyDigest: true, productUpdates: false },
    });
  });

  it('refuses anything that is not a set of switches', () => {
    for (const body of [null, undefined, 'on', 1, [], ['commentMentions']]) {
      expect(parseNotificationChanges(body).ok).toBe(false);
    }
    expect(parseNotificationChanges({})).toEqual({ ok: false, error: 'Nothing to change.' });
  });

  it('lets nothing but a switch reach the stored preferences', () => {
    expect(parseNotificationChanges({ theme: 'dark' })).toEqual({
      ok: false,
      error: 'There is no "theme" switch.',
    });
    expect(parseNotificationChanges({ commentMentions: true, cursorColor: 'red' }).ok).toBe(false);
    expect(parseNotificationChanges({ commentMentions: 'false' })).toEqual({
      ok: false,
      error: '"commentMentions" must be true or false.',
    });
  });
});

describe('notificationSettingsFrom', () => {
  it('reads the defaults for an account that never chose', () => {
    expect(notificationSettingsFrom(undefined)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(notificationSettingsFrom({})).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('keeps what was chosen, and ignores anything stored that is not a switch', () => {
    expect(
      notificationSettingsFrom({ commentMentions: false, weeklyDigest: true, other: true }),
    ).toEqual({ ...DEFAULT_NOTIFICATION_SETTINGS, commentMentions: false, weeklyDigest: true });
    expect(notificationSettingsFrom({ accessChanges: 'no' })).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS,
    );
  });
});
