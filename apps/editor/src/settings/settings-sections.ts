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

/*
 * The cursor swatches are no longer listed here. They come from the board's own
 * presence palette now, so what a person picks in this dialog is the colour
 * their collaborators actually see — see PRESENCE_PALETTE.
 */
