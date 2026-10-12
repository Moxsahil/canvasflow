/**
 * What CanvasFlow may email somebody about, one switch each.
 *
 * Stored with the account's other preferences, under `notifications`, as only
 * the switches somebody has flipped: an account that never opened the tab has
 * nothing stored and reads as these defaults, so changing a default here
 * changes it for everybody who never chose.
 */
export interface NotificationSettings {
  /** Someone gives you access to a board, or changes what you can do on one. */
  accessChanges: boolean;
  /** A collaborator @mentions you in a comment. */
  commentMentions: boolean;
  /** Somebody joins a board or workspace through you. */
  inviteAccepted: boolean;
  /** A summary of board activity each Monday. */
  weeklyDigest: boolean;
  /** New features and release notes. */
  productUpdates: boolean;
}

export type NotificationKind = keyof NotificationSettings;

/**
 * The two about someone else reaching you start on; the three that are
 * CanvasFlow talking to you start off.
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  accessChanges: true,
  commentMentions: true,
  inviteAccepted: false,
  weeklyDigest: false,
  productUpdates: false,
};

export const NOTIFICATION_KINDS = Object.keys(DEFAULT_NOTIFICATION_SETTINGS) as NotificationKind[];

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && (NOTIFICATION_KINDS as string[]).includes(value);
}

/**
 * The settings as stored, with a default for every switch nobody flipped.
 * Anything stored that is not a switch, or not a boolean, is ignored rather
 * than trusted.
 */
export function notificationSettingsFrom(stored: unknown): NotificationSettings {
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS };
  if (typeof stored !== 'object' || stored === null) return settings;
  for (const kind of NOTIFICATION_KINDS) {
    const value = (stored as Record<string, unknown>)[kind];
    if (typeof value === 'boolean') settings[kind] = value;
  }
  return settings;
}

/**
 * A change somebody asked for: one or more switches, each true or false, and
 * nothing else. Refuses an empty change, an unknown switch and anything that
 * is not a boolean, so nothing but a switch can reach the stored preferences.
 */
export function parseNotificationChanges(
  body: unknown,
): { ok: true; changes: Partial<NotificationSettings> } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Send the switches to change as an object.' };
  }
  const entries = Object.entries(body);
  if (entries.length === 0) return { ok: false, error: 'Nothing to change.' };

  const changes: Partial<NotificationSettings> = {};
  for (const [key, value] of entries) {
    if (!isNotificationKind(key)) return { ok: false, error: `There is no "${key}" switch.` };
    if (typeof value !== 'boolean') return { ok: false, error: `"${key}" must be true or false.` };
    changes[key] = value;
  }
  return { ok: true, changes };
}

/** What each switch's emails are called in a sentence: "stop emails about …". */
export const NOTIFICATION_EMAIL_TOPICS: Record<NotificationKind, string> = {
  accessChanges: 'changes to your board access',
  commentMentions: 'comment mentions',
  inviteAccepted: 'accepted invitations',
  weeklyDigest: 'the weekly digest',
  productUpdates: 'product updates',
};
