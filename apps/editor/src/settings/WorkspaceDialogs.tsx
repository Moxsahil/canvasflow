import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Crown, Mail, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonAvatar } from '../ui/PersonAvatar';
import {
  inviteToWorkspace,
  resendInvite,
  revokeInvite,
  type GuestBoardRole,
  type InvitableRole,
  type WorkspaceGuest,
  type WorkspaceInvite,
  type WorkspaceMember,
  type WorkspacePeople,
} from '../workspace/people-api';
import type { WorkspaceRole } from '../workspace/workspace-api';
import {
  ErrorLine,
  INPUT,
  SCROLLBAR,
  SettingsButton,
  SettingsModal,
  StatusTag,
} from './settings-ui';

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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Expires in 7 days", "Expires within a day" — an invitation lives a week, so
 * whole days are enough. Rounded up, so one sent a moment ago says the week it
 * was sent for.
 */
function expiryLine(invite: WorkspaceInvite, now: number): string {
  const left = Date.parse(invite.expiresAt) - now;
  if (left < DAY_MS) return 'Expires within a day';
  const days = Math.ceil(left / DAY_MS);
  return `Expires in ${days} days`;
}

/**
 * Who the invitation makes somebody, as a pair of pills rather than a menu:
 * there are only two, and both stay in view while the address is typed.
 */
function RoleSwitch({
  value,
  onChange,
  disabled,
}: {
  value: InvitableRole;
  onChange: (role: InvitableRole) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Invite as"
      className="flex h-[32px] shrink-0 items-center rounded-[7px] border border-[var(--surface-border)] bg-[var(--surface-input)] p-[2px]"
    >
      {(['member', 'admin'] as const).map((role) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          disabled={disabled}
          data-testid={`invite-role-${role}`}
          onClick={() => onChange(role)}
          className={cn(
            'h-full rounded-[5px] px-[10px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-60',
            value === role
              ? 'bg-[var(--surface-wash-hover)] font-medium text-[var(--surface-fg)]'
              : 'text-[var(--surface-fg-muted)] hover:text-[var(--surface-fg)]',
          )}
        >
          {ROLE_LABELS[role]}
        </button>
      ))}
    </div>
  );
}

/** What the last send did, said under the form until something else happens. */
type Notice = { tone: 'ok' | 'caution'; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={cn(
        'text-[11.5px]',
        notice.tone === 'ok' ? 'text-[var(--surface-ok)]' : 'text-amber-600 dark:text-amber-400',
      )}
    >
      {notice.text}
    </p>
  );
}

/** The sentence for an email that did or did not go. */
function sentNotice(email: string, emailSent: boolean, again: boolean): Notice {
  if (emailSent)
    return { tone: 'ok', text: `${again ? 'Sent again' : 'Invitation sent'} to ${email}.` };
  return {
    tone: 'caution',
    text: `The invitation is saved, but its email to ${email} didn’t go. Try Send again in a minute.`,
  };
}

/**
 * The address and role to invite, and the button. Enter sends it, as it does
 * in any one-line form.
 */
function InviteForm({
  workspaceId,
  onSent,
}: {
  workspaceId: string;
  onSent: (notice: Notice) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const typed = email.trim();
    if (!typed || busy) return;
    setBusy(true);
    setError(null);
    onSent(null);
    try {
      const sent = await inviteToWorkspace(workspaceId, typed, role);
      setEmail('');
      onSent(sentNotice(sent.invite.email, sent.emailSent, false));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-[8px]">
      <label
        htmlFor="invite-email"
        className="text-[11.5px] font-medium text-[var(--surface-fg-muted)]"
      >
        Invite by email
      </label>
      <div className="flex items-center gap-[8px]">
        <input
          id="invite-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder="name@company.com"
          value={email}
          disabled={busy}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          data-testid="invite-email"
          className={cn(INPUT, 'min-w-0 flex-1')}
        />
        <RoleSwitch value={role} onChange={setRole} disabled={busy} />
        <SettingsButton
          type="submit"
          variant="primary"
          disabled={busy || !email.trim()}
          data-testid="invite-send"
          className="h-[32px]"
        >
          {busy ? 'Sending…' : 'Invite'}
        </SettingsButton>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </form>
  );
}

/**
 * One invitation still waiting: the address, what it makes them and when it
 * runs out, with sending it again and taking it back at the end.
 */
function InviteRow({
  invite,
  workspaceId,
  now,
  onDone,
}: {
  invite: WorkspaceInvite;
  workspaceId: string;
  now: number;
  onDone: (notice: Notice) => void;
}) {
  const [busy, setBusy] = useState<'resend' | 'revoke' | null>(null);

  const run = async (action: 'resend' | 'revoke') => {
    if (busy) return;
    setBusy(action);
    onDone(null);
    try {
      if (action === 'resend') {
        const sent = await resendInvite(workspaceId, invite.id);
        onDone(sentNotice(invite.email, sent.emailSent, true));
      } else {
        await revokeInvite(workspaceId, invite.id);
        onDone({ tone: 'ok', text: `Invitation to ${invite.email} taken back.` });
      }
    } catch (err: unknown) {
      onDone({
        tone: 'caution',
        text: err instanceof Error ? err.message : 'That didn’t work. Try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const detail = [ROLE_LABELS[invite.role], invite.expired ? null : expiryLine(invite, now)]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      data-testid={`workspace-invite-${invite.id}`}
      className="flex h-[50px] shrink-0 items-center gap-[11px] border-t border-[var(--surface-line)] first:border-t-0"
    >
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--surface-border)] bg-[var(--surface-wash)] text-[var(--surface-fg-muted)]">
        <Mail className="size-[13px]" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <p className="flex min-w-0 items-center gap-[6px] text-[12.5px] font-medium">
          <span className="truncate">{invite.email}</span>
          {invite.expired && <StatusTag tone="caution">Expired</StatusTag>}
        </p>
        <p className="truncate text-[11.5px] text-[var(--surface-fg-muted)]">
          {`${detail} · from ${invite.invitedByName}`}
        </p>
      </div>
      <SettingsButton
        disabled={busy !== null}
        onClick={() => void run('resend')}
        data-testid={`invite-resend-${invite.id}`}
      >
        {busy === 'resend' ? 'Sending…' : 'Send again'}
      </SettingsButton>
      <SettingsButton
        variant="ghost"
        aria-label={`Take back the invitation to ${invite.email}`}
        title="Take back"
        disabled={busy !== null}
        onClick={() => void run('revoke')}
        data-testid={`invite-revoke-${invite.id}`}
        className="w-[28px] px-0"
      >
        <X className="size-[14px]" aria-hidden="true" />
      </SettingsButton>
    </li>
  );
}

/** The clock for "expires in", read once a minute while the window is open. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * Who is in the workspace, who has been asked in, and who else is on its
 * boards.
 *
 * Guests are kept apart because their access is narrower: a share link let
 * them onto particular boards, and nothing else in the workspace is theirs to
 * open. Saying which boards is what makes the difference visible.
 *
 * Whoever runs the workspace also gets the Invite form at the top and the
 * invitations still waiting for an answer. Each change is re-read through the
 * same list everyone else's window reads, so what shows here is what the
 * server kept.
 */
export function MembersDialog({
  workspaceName,
  workspaceId = null,
  people,
  userId,
  canInvite = false,
  onChanged,
  onClose,
}: {
  workspaceName: string;
  /** Needed to invite; without it the window only lists. */
  workspaceId?: string | null;
  people: WorkspacePeople;
  userId: string | null;
  /** The owner or an admin. The server holds the same rule and is what decides. */
  canInvite?: boolean;
  /** Called after an invitation is sent, sent again or taken back, to re-read the list. */
  onChanged?: () => void;
  onClose: () => void;
}) {
  const { members, guests } = people;
  const invites = canInvite ? (people.invites ?? []) : [];
  const inviting = canInvite && workspaceId !== null;
  const hasGuests = guests.length > 0;
  const captioned = hasGuests || invites.length > 0;
  const [notice, setNotice] = useState<Notice>(null);
  const now = useMinuteClock();

  const done = (next: Notice) => {
    setNotice(next);
    if (next) onChanged?.();
  };

  const description = inviting
    ? `Everyone in ${workspaceName}. Invite people by email to join it and all its boards.`
    : hasGuests
      ? `Everyone in ${workspaceName}, and the people let onto its boards by link.`
      : `Everyone in ${workspaceName}.`;

  return (
    <SettingsModal
      title="Members"
      description={description}
      onClose={onClose}
      width={inviting ? 520 : 460}
      actions={
        <SettingsButton variant="primary" onClick={onClose}>
          Done
        </SettingsButton>
      }
    >
      {inviting && (
        <div className="flex flex-col gap-[6px] border-b border-[var(--surface-line)] pb-[14px]">
          <InviteForm workspaceId={workspaceId} onSent={done} />
          <NoticeLine notice={notice} />
        </div>
      )}
      <div className={cn('max-h-[340px] overflow-y-auto pr-[2px]', SCROLLBAR)}>
        {captioned && <GroupCaption>{`Members · ${members.length}`}</GroupCaption>}
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
        {inviting && invites.length > 0 && (
          <>
            <GroupCaption>{`Invited · ${invites.length}`}</GroupCaption>
            <ul>
              {invites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  workspaceId={workspaceId}
                  now={now}
                  onDone={done}
                />
              ))}
            </ul>
          </>
        )}
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
