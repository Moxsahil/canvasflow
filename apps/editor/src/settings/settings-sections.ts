import { t, type TranslationKey } from '../i18n';

export type SettingsSectionId =
  | 'profile'
  | 'account'
  | 'workspace'
  | 'notifications'
  | 'billing'
  | 'privacy';

export interface SettingsSection {
  readonly id: SettingsSectionId;
  readonly labelKey: TranslationKey;
  /** The line under the tabs, saying what the page is for. */
  readonly leadKey: TranslationKey;
}

/** The tabs, left to right. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'profile', labelKey: 'settings.section.profile', leadKey: 'settings.section.profile.lead' },
  { id: 'account', labelKey: 'settings.section.account', leadKey: 'settings.section.account.lead' },
  {
    id: 'workspace',
    labelKey: 'settings.section.workspace',
    leadKey: 'settings.section.workspace.lead',
  },
  {
    id: 'notifications',
    labelKey: 'settings.section.notifications',
    leadKey: 'settings.section.notifications.lead',
  },
  { id: 'billing', labelKey: 'settings.section.billing', leadKey: 'settings.section.billing.lead' },
  { id: 'privacy', labelKey: 'settings.section.privacy', leadKey: 'settings.section.privacy.lead' },
];

export interface SettingEntry {
  /** Matches the `data-setting` on the row, which is how search finds it on the page. */
  readonly id: string;
  readonly titleKey: TranslationKey;
  readonly section: SettingsSectionId;
  /** The band it sits in, shown under the title in the results. */
  readonly groupKey: TranslationKey;
  /** Other words someone might type for it, in English whatever the language on screen. */
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
    titleKey: 'settings.row.photo',
    section: 'profile',
    groupKey: 'settings.group.identity',
    terms: 'avatar picture upload',
  },
  {
    id: 'display-name',
    titleKey: 'settings.row.display-name',
    section: 'profile',
    groupKey: 'settings.group.identity',
    terms: 'name cursor',
  },
  {
    id: 'username',
    titleKey: 'settings.row.username',
    section: 'profile',
    groupKey: 'settings.group.identity',
    terms: 'handle mentions',
  },
  {
    id: 'cursor-colour',
    titleKey: 'settings.row.cursor-colour',
    section: 'profile',
    groupKey: 'settings.group.presence',
    terms: 'color presence',
  },

  {
    id: 'email',
    titleKey: 'settings.row.email',
    section: 'account',
    groupKey: 'settings.group.signIn',
    terms: 'address verify verification',
  },
  {
    id: 'password',
    titleKey: 'settings.row.password',
    section: 'account',
    groupKey: 'settings.group.signIn',
    terms: 'change security',
  },
  {
    id: 'connected-accounts',
    titleKey: 'settings.row.connected-accounts',
    section: 'account',
    groupKey: 'settings.group.signIn',
    terms: 'google github sign in',
  },
  {
    id: 'two-factor',
    titleKey: 'settings.row.two-factor',
    section: 'account',
    groupKey: 'settings.group.signIn',
    terms: '2fa security',
  },
  {
    id: 'sessions',
    titleKey: 'settings.row.sessions',
    section: 'account',
    groupKey: 'settings.group.sessions',
    terms: 'devices signed in',
  },
  {
    id: 'sign-out-everywhere',
    titleKey: 'settings.row.sign-out-everywhere',
    section: 'account',
    groupKey: 'settings.group.sessions',
    terms: 'devices log out',
  },

  // A guest is in no workspace, so search offers them none of these.
  {
    id: 'workspace-name',
    titleKey: 'settings.row.workspace-name',
    section: 'workspace',
    groupKey: 'settings.group.workspace',
    terms: 'rename team',
    accountOnly: true,
  },
  {
    id: 'role',
    titleKey: 'settings.row.role',
    section: 'workspace',
    groupKey: 'settings.group.workspace',
    terms: 'owner admin member',
    accountOnly: true,
  },
  {
    id: 'members',
    titleKey: 'settings.row.members',
    section: 'workspace',
    groupKey: 'settings.group.people',
    terms: 'invite people team email',
    accountOnly: true,
  },
  {
    id: 'board-access',
    titleKey: 'settings.row.board-access',
    section: 'workspace',
    groupKey: 'settings.group.people',
    terms: 'sharing edit',
    accountOnly: true,
  },
  {
    id: 'leave-workspace',
    titleKey: 'settings.row.leave-workspace',
    section: 'workspace',
    groupKey: 'settings.group.people',
    accountOnly: true,
  },

  {
    id: 'access-changes',
    titleKey: 'settings.row.access-changes',
    section: 'notifications',
    groupKey: 'settings.group.email',
    terms: 'board shared with me invite role',
  },
  {
    id: 'comment-mentions',
    titleKey: 'settings.row.comment-mentions',
    section: 'notifications',
    groupKey: 'settings.group.email',
    terms: 'tag',
  },
  {
    id: 'invite-accepted',
    titleKey: 'settings.row.invite-accepted',
    section: 'notifications',
    groupKey: 'settings.group.email',
    terms: 'joins',
  },
  {
    id: 'weekly-digest',
    titleKey: 'settings.row.weekly-digest',
    section: 'notifications',
    groupKey: 'settings.group.digest',
    terms: 'summary email',
  },
  {
    id: 'product-updates',
    titleKey: 'settings.row.product-updates',
    section: 'notifications',
    groupKey: 'settings.group.digest',
    terms: 'news release notes',
  },

  {
    id: 'plan',
    titleKey: 'settings.row.plan',
    section: 'billing',
    groupKey: 'settings.group.plan',
    terms: 'upgrade free pro team subscription cancel',
  },
  {
    id: 'payment-method',
    titleKey: 'settings.row.payment-method',
    section: 'billing',
    groupKey: 'settings.group.payment',
    terms: 'card',
  },
  {
    id: 'invoices',
    titleKey: 'settings.row.invoices',
    section: 'billing',
    groupKey: 'settings.group.payment',
    terms: 'receipts history',
  },

  {
    id: 'export',
    titleKey: 'settings.row.export',
    section: 'privacy',
    groupKey: 'settings.group.yourData',
    terms: 'download zip backup canvasflow',
  },
  {
    id: 'storage-used',
    titleKey: 'settings.row.storage-used',
    section: 'privacy',
    groupKey: 'settings.group.yourData',
    terms: 'space size usage',
  },
  {
    id: 'analytics',
    titleKey: 'settings.row.analytics',
    section: 'privacy',
    groupKey: 'settings.group.yourData',
    terms: 'tracking data',
  },
  {
    id: 'terms',
    titleKey: 'settings.row.terms',
    section: 'privacy',
    groupKey: 'settings.group.legal',
    terms: 'legal',
  },
  {
    id: 'privacy-policy',
    titleKey: 'settings.row.privacy-policy',
    section: 'privacy',
    groupKey: 'settings.group.legal',
    terms: 'legal',
  },
  {
    id: 'delete-account',
    titleKey: 'settings.row.delete-account',
    section: 'privacy',
    groupKey: 'settings.group.dangerZone',
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
    return `${t(entry.titleKey)} ${t(entry.groupKey)} ${entry.terms ?? ''}`
      .toLowerCase()
      .includes(needle);
  }).slice(0, 6);
}

export function sectionLabel(id: SettingsSectionId): string {
  const section = SETTINGS_SECTIONS.find((entry) => entry.id === id);
  return section ? t(section.labelKey) : '';
}
