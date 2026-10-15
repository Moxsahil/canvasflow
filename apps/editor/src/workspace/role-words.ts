import type { TranslationKey } from '../i18n';
import type { WorkspaceRole } from './workspace-api';

/** A role's name, as a list shows it: "Owner", "Admin", "Member". */
export const ROLE_KEYS: Readonly<Record<WorkspaceRole, TranslationKey>> = {
  owner: 'role.owner',
  admin: 'role.admin',
  member: 'role.member',
};

/**
 * "you are the owner", "an admin", "a member" — whole phrases, since the
 * article in front of a role differs from one language to the next.
 */
export const YOU_ARE_KEYS: Readonly<Record<WorkspaceRole, TranslationKey>> = {
  owner: 'role.youAre.owner',
  admin: 'role.youAre.admin',
  member: 'role.youAre.member',
};
