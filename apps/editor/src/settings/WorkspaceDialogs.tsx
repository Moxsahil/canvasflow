import type { ReactNode } from 'react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonAvatar } from '../ui/PersonAvatar';
import type {
  GuestBoardRole,
  WorkspaceGuest,
  WorkspaceMember,
  WorkspacePeople,
} from '../workspace/people-api';
import type { WorkspaceRole } from '../workspace/workspace-api';
import { SCROLLBAR, SettingsButton, SettingsModal, StatusTag } from './settings-ui';

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const BOARD_ROLE_LABELS: Record<GuestBoardRole, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'Can view',
};

/** Their handle and, for whoever runs the workspace, their address. */
function detailOf(person: { username: string | null; email: string | null }): string | null {
  const parts = [person.username && `@${person.username}`, person.email].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The boards a guest is on, named while there are few enough to name. */
function boardsLine(guest: WorkspaceGuest): string {
  const titles = guest.boards.map((board) => board.title);
  if (titles.length <= 2) return `On ${titles.join(' and ')}`;
  return `On ${titles[0]} and ${titles.length - 1} more boards`;
}

/** What a guest may do, when it is the same on every board they are on. */
function guestRole(guest: WorkspaceGuest): string {
  const roles = new Set(guest.boards.map((board) => board.role));
  const [only] = roles;
  return roles.size === 1 && only ? BOARD_ROLE_LABELS[only] : 'Mixed access';
}

const PILL =
  'inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] border border-[var(--surface-border)] px-[9px] text-[11.5px] text-[var(--surface-fg-muted)]';

/** A face, a name, a line under it, and something at the end: the Share dialog's people row. */
function PersonRow({
  testId,
  photo,
  name,
  you,
  tag,
  detail,
  end,
}: {
  testId: string;
  photo: string | null;
  name: string;
  you: boolean;
  tag?: ReactNode;
  detail: string;
  end: ReactNode;
}) {
  return (
    <li
      data-testid={testId}
      className="flex h-[50px] shrink-0 items-center gap-[11px] border-t border-[var(--surface-line)] first:border-t-0"
    >
      <PersonAvatar url={photo} name={name} className="size-[30px] text-[11px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <p className="flex min-w-0 items-center gap-[6px] text-[12.5px] font-medium">
          <span className="truncate">
            {name}
            {you && <span className="font-normal text-[var(--surface-fg-muted)]"> (you)</span>}
          </span>
          {tag}
        </p>
        <p className="truncate text-[11.5px] text-[var(--surface-fg-muted)]">{detail}</p>
      </div>
      {end}
    </li>
  );
}

function GroupCaption({ children }: { children: ReactNode }) {
  return (
    <p className="pt-[14px] pb-[4px] text-[11.5px] font-medium text-[var(--surface-fg-muted)] first:pt-0">
      {children}
    </p>
  );
}

/**
 * Who is in the workspace, and who else is on its boards.
 *
 * Guests are kept apart because their access is narrower: a share link let
 * them onto particular boards, and nothing else in the workspace is theirs to
 * open. Saying which boards is what makes the difference visible.
 */
export function MembersDialog({
  workspaceName,
  people,
  userId,
  onClose,
}: {
  workspaceName: string;
  people: WorkspacePeople;
  userId: string | null;
  onClose: () => void;
}) {
  const { members, guests } = people;
  const hasGuests = guests.length > 0;

  return (
    <SettingsModal
      title="Members"
      description={
        hasGuests
          ? `Everyone in ${workspaceName}, and the people let onto its boards by link.`
          : `Everyone in ${workspaceName}.`
      }
      onClose={onClose}
      width={460}
      actions={
        <SettingsButton variant="primary" onClick={onClose}>
          Done
        </SettingsButton>
      }
    >
      <div className={cn('max-h-[340px] overflow-y-auto pr-[2px]', SCROLLBAR)}>
        {hasGuests && <GroupCaption>{`Members · ${members.length}`}</GroupCaption>}
        <ul>
          {members.map((member: WorkspaceMember) => (
            <PersonRow
              key={member.userId}
              testId={`workspace-member-${member.userId}`}
              photo={member.photo}
              name={member.name}
              you={member.userId === userId}
              detail={detailOf(member) ?? 'No username yet'}
              end={
                <span className={PILL}>
                  {member.role === 'owner' && <Crown className="size-[12px]" aria-hidden="true" />}
                  {ROLE_LABELS[member.role]}
                </span>
              }
            />
          ))}
        </ul>
        {hasGuests && (
          <>
            <GroupCaption>{`Guests on boards · ${guests.length}`}</GroupCaption>
            <ul>
              {guests.map((guest) => {
                const handle = detailOf(guest);
                return (
                  <PersonRow
                    key={guest.userId}
                    testId={`workspace-guest-${guest.userId}`}
                    photo={guest.photo}
                    name={guest.name}
                    you={guest.userId === userId}
                    tag={guest.isGuest && <StatusTag tone="neutral">No account</StatusTag>}
                    detail={handle ? `${boardsLine(guest)} · ${handle}` : boardsLine(guest)}
                    end={<span className={PILL}>{guestRole(guest)}</span>}
                  />
                );
              })}
            </ul>
          </>
        )}
      </div>
    </SettingsModal>
  );
}
