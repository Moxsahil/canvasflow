import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonAvatar } from '../ui/PersonAvatar';
import type { WorkspaceMember } from '../workspace/members-api';
import type { WorkspaceRole } from '../workspace/workspace-api';
import { SCROLLBAR, SettingsButton, SettingsModal } from './settings-ui';

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

/** Their handle and, for whoever runs the workspace, their address. */
function detailOf(member: WorkspaceMember): string {
  const parts = [member.username && `@${member.username}`, member.email].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No username yet';
}

/**
 * Who is in the workspace, in the Share dialog's people look: a face, a name,
 * a line under it, and their role at the end.
 */
export function MembersDialog({
  workspaceName,
  members,
  userId,
  onClose,
}: {
  workspaceName: string;
  members: WorkspaceMember[];
  userId: string | null;
  onClose: () => void;
}) {
  return (
    <SettingsModal
      title="Members"
      description={`Everyone in ${workspaceName}.`}
      onClose={onClose}
      width={460}
      actions={
        <SettingsButton variant="primary" onClick={onClose}>
          Done
        </SettingsButton>
      }
    >
      <ul className={cn('max-h-[300px] overflow-y-auto pr-[2px]', SCROLLBAR)}>
        {members.map((member) => (
          <li
            key={member.userId}
            data-testid={`workspace-member-${member.userId}`}
            className="flex h-[50px] shrink-0 items-center gap-[11px] border-t border-[var(--surface-line)] first:border-t-0"
          >
            <PersonAvatar
              url={member.photo}
              name={member.name}
              className="size-[30px] text-[11px]"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
              <p className="truncate text-[12.5px] font-medium">
                {member.name}
                {member.userId === userId && (
                  <span className="font-normal text-[var(--surface-fg-muted)]"> (you)</span>
                )}
              </p>
              <p className="truncate text-[11.5px] text-[var(--surface-fg-muted)]">
                {detailOf(member)}
              </p>
            </div>
            <span className="inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] border border-[var(--surface-border)] px-[9px] text-[11.5px] text-[var(--surface-fg-muted)]">
              {member.role === 'owner' && <Crown className="size-[12px]" aria-hidden="true" />}
              {ROLE_LABELS[member.role]}
            </span>
          </li>
        ))}
      </ul>
    </SettingsModal>
  );
}
