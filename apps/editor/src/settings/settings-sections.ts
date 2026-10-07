export type SettingsSectionId =
  | 'profile'
  | 'account'
  | 'workspace'
  | 'notifications'
  | 'billing'
  | 'privacy';

export interface SettingsSection {
  readonly id: SettingsSectionId;
  readonly label: string;
  /** The line under the tabs, saying what the page is for. */
  readonly lead: string;
}

/** The tabs, left to right. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'profile', label: 'Profile', lead: 'How you appear to collaborators on shared boards.' },
  {
    id: 'account',
    label: 'Account & Security',
    lead: 'Sign-in methods, active sessions, and account deletion.',
  },
  { id: 'workspace', label: 'Workspace', lead: 'Members, roles, and workspace-level settings.' },
  { id: 'notifications', label: 'Notifications', lead: 'Choose what CanvasFlow emails you about.' },
  { id: 'billing', label: 'Billing', lead: 'Plan, seats, usage, and invoice history.' },
  { id: 'privacy', label: 'Data & Privacy', lead: 'Export your boards or close your account.' },
];

export interface SettingEntry {
  /** Matches the `data-setting` on the row, which is how search finds it on the page. */
  readonly id: string;
  readonly title: string;
  readonly section: SettingsSectionId;
  /** The band it sits in, shown under the title in the results. */
  readonly group: string;
  /** Other words someone might type for it. */
  readonly terms?: string;
  /** Only an account has it; a guest's search leaves it out. */
  readonly accountOnly?: boolean;
}

/**
 * Every row there is, for search.
 *
 * Kept beside the pages rather than read out of them: the page for a tab is not
 * mounted until it is opened, and search has to find a row on any tab.
 */
export const SETTINGS_INDEX: readonly SettingEntry[] = [
  {
    id: 'photo',
    title: 'Profile photo',
    section: 'profile',
    group: 'Identity',
    terms: 'avatar picture upload',
  },
  {
    id: 'display-name',
    title: 'Display name',
    section: 'profile',
    group: 'Identity',
    terms: 'name cursor',
  },
  {
    id: 'username',
    title: 'Username',
    section: 'profile',
    group: 'Identity',
    terms: 'handle mentions',
  },
  {
    id: 'cursor-colour',
    title: 'Cursor colour',
    section: 'profile',
    group: 'Presence',
    terms: 'color presence',
  },

  {
    id: 'email',
    title: 'Email',
    section: 'account',
    group: 'Sign-in',
    terms: 'address verify verification',
  },
  {
    id: 'password',
    title: 'Password',
    section: 'account',
    group: 'Sign-in',
    terms: 'change security',
  },
  {
    id: 'connected-accounts',
    title: 'Connected accounts',
    section: 'account',
    group: 'Sign-in',
    terms: 'google github sign in',
  },
  {
    id: 'two-factor',
    title: 'Two-factor authentication',
    section: 'account',
    group: 'Sign-in',
    terms: '2fa security',
  },
  {
    id: 'sessions',
    title: 'Active sessions',
    section: 'account',
    group: 'Sessions',
    terms: 'devices signed in',
  },
  {
    id: 'sign-out-everywhere',
    title: 'Sign out everywhere',
    section: 'account',
    group: 'Sessions',
    terms: 'devices log out',
  },

  // A guest is in no workspace, so search offers them none of these.
  {
    id: 'workspace-name',
    title: 'Workspace name',
    section: 'workspace',
    group: 'Workspace',
    terms: 'rename team',
    accountOnly: true,
  },
  {
    id: 'role',
    title: 'Your role',
    section: 'workspace',
    group: 'Workspace',
    terms: 'owner admin member',
    accountOnly: true,
  },
  {
    id: 'members',
    title: 'Members',
    section: 'workspace',
    group: 'People',
    terms: 'invite people team',
    accountOnly: true,
  },
  {
    id: 'board-access',
    title: 'Default board access',
    section: 'workspace',
    group: 'People',
    terms: 'sharing edit',
    accountOnly: true,
  },
  {
    id: 'leave-workspace',
    title: 'Leave workspace',
    section: 'workspace',
    group: 'People',
    accountOnly: true,
  },

  {
    id: 'board-shared',
    title: 'Board shared with me',
    section: 'notifications',
    group: 'Email',
    terms: 'invite',
  },
  {
    id: 'comment-mentions',
    title: 'Comment mentions',
    section: 'notifications',
    group: 'Email',
    terms: 'tag',
  },
  {
    id: 'invite-accepted',
    title: 'Invite accepted',
    section: 'notifications',
    group: 'Email',
    terms: 'joins',
  },
  {
    id: 'weekly-digest',
    title: 'Weekly digest',
    section: 'notifications',
    group: 'Digest',
    terms: 'summary email',
  },
  {
    id: 'product-updates',
    title: 'Product updates',
    section: 'notifications',
    group: 'Digest',
    terms: 'news release notes',
  },

  { id: 'plan', title: 'Plan', section: 'billing', group: 'Plan', terms: 'upgrade free' },
  {
    id: 'seats',
    title: 'Seats',
    section: 'billing',
    group: 'Usage',
    terms: 'collaborators editors',
  },
  { id: 'storage', title: 'Storage', section: 'billing', group: 'Usage', terms: 'space' },
  {
    id: 'payment-method',
    title: 'Payment method',
    section: 'billing',
    group: 'Payment',
    terms: 'card',
  },
  {
    id: 'invoices',
    title: 'Invoices',
    section: 'billing',
    group: 'Payment',
    terms: 'receipts history',
  },

  {
    id: 'export',
    title: 'Export all boards',
    section: 'privacy',
    group: 'Your data',
    terms: 'download json',
  },
  { id: 'storage-used', title: 'Storage used', section: 'privacy', group: 'Your data' },
  {
    id: 'analytics',
    title: 'Usage analytics',
    section: 'privacy',
    group: 'Your data',
    terms: 'tracking data',
  },
  { id: 'terms', title: 'Terms of Service', section: 'privacy', group: 'Legal', terms: 'legal' },
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    section: 'privacy',
    group: 'Legal',
    terms: 'legal',
  },
  {
    id: 'delete-account',
    title: 'Delete account',
    section: 'privacy',
    group: 'Danger zone',
    terms: 'close remove',
    accountOnly: true,
  },
];

/** Up to six rows matching what was typed, in the order the tabs show them. */
export function searchSettings(query: string, { isGuest = false } = {}): SettingEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return SETTINGS_INDEX.filter((entry) => {
    if (isGuest && entry.accountOnly) return false;
    return `${entry.title} ${entry.group} ${entry.terms ?? ''}`.toLowerCase().includes(needle);
  }).slice(0, 6);
}

export function sectionLabel(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.label ?? '';
}
