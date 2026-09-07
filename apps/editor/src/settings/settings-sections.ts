import type { ComponentType } from 'react';
import {
  AccountIcon,
  BillingIcon,
  NotificationsIcon,
  PrivacyIcon,
  ProfileIcon,
  WorkspaceIcon,
} from './settings-icons';

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
  readonly icon: ComponentType;
}

/** The rail, in the order the design has it. Profile is the one built so far. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'profile', label: 'Profile', icon: ProfileIcon },
  { id: 'account', label: 'Account & Security', icon: AccountIcon },
  { id: 'workspace', label: 'Workspace', icon: WorkspaceIcon },
  { id: 'notifications', label: 'Notifications', icon: NotificationsIcon },
  { id: 'billing', label: 'Billing', icon: BillingIcon },
  { id: 'privacy', label: 'Data & Privacy', icon: PrivacyIcon },
];

/**
 * The eight cursor colours, read off the design's swatch row in its own order.
 * Board presence derives a colour from the user id today; nothing here is wired
 * to that yet, so this is the design's palette rather than that one.
 */
export const CURSOR_COLORS = [
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#22C55E',
  '#14B8A6',
] as const;
