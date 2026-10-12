import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { can, canManageMember } from '@canvasflow/types';
import {
  ChevronDown,
  Crown,
  Eye,
  Mail,
  Pencil,
  Shield,
  Trash2,
  Undo2,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  InlineDropdownMenu,
  InlineDropdownMenuChoiceItem,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuRadioGroup,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import { PersonAvatar } from '../ui/PersonAvatar';
import {
  changeMemberRole,
  inviteToWorkspace,
  offerOwnership,
  removeGuest,
  removeMember,
  resendInvite,
  revokeInvite,
  setGuestRole,
  withdrawOwnershipOffer,
  type GuestBoardRole,
  type GuestRole,
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
import { useEscape } from './settings-frame';

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

/** Something a member's menu asks to be confirmed first. */
type Pending =
  | { kind: 'remove' | 'hand-over'; member: WorkspaceMember }
  | { kind: 'remove-guest'; guest: WorkspaceGuest }
  | null;

/**
 * What someone in the workspace may be made, or have done to them — in the
 * menu look the share window's role menu wears, on the button that says what
 * they are now.
 *
 * Escape closes the menu rather than the window under it, since the window
 * takes Escape before the menu would.
 */
function MemberMenu({
  member,
  viewerIsOwner,
  offered,
  container,
  busy,
  onRole,
  onHandOver,
  onWithdraw,
  onRemove,
}: {
  member: WorkspaceMember;
  viewerIsOwner: boolean;
  /** The ownership is on offer to this person. */
  offered: boolean;
  container: HTMLElement | null;
  busy: boolean;
  onRole: (role: InvitableRole) => void;
  onHandOver: () => void;
  onWithdraw: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEscape(open ? () => setOpen(false) : null);
  const role = member.role === 'owner' ? 'admin' : member.role;
  const RoleIcon = role === 'admin' ? Shield : UserRound;

  return (
    <InlineDropdownMenu open={open} onOpenChange={setOpen}>
      <InlineDropdownMenuTrigger asChild>
        <SettingsButton
          aria-label={`Role for ${member.name}`}
          data-testid={`member-menu-${member.userId}`}
          disabled={busy}
          className="gap-[6px] pr-[7px] pl-[9px] data-[state=open]:bg-[var(--surface-wash-hover)] [&[data-state=open]>svg:last-child]:rotate-180"
        >
          <RoleIcon className="size-[12px]" aria-hidden="true" />
          {ROLE_LABELS[role]}
          <ChevronDown
            className="size-[12px] text-[var(--surface-fg-muted)] transition-transform duration-200"
            aria-hidden="true"
          />
        </SettingsButton>
      </InlineDropdownMenuTrigger>
      <InlineDropdownMenuContent
        align="end"
        sideOffset={4}
        collisionPadding={8}
        container={container}
        aria-label={`Role for ${member.name}`}
        className="min-w-48"
      >
        <InlineDropdownMenuRadioGroup
          value={role}
          onValueChange={(value) => onRole(value as InvitableRole)}
        >
          <InlineDropdownMenuChoiceItem value="admin" icon={<Shield aria-hidden="true" />}>
            Admin
          </InlineDropdownMenuChoiceItem>
          <InlineDropdownMenuChoiceItem value="member" icon={<UserRound aria-hidden="true" />}>
            Member
          </InlineDropdownMenuChoiceItem>
        </InlineDropdownMenuRadioGroup>
        {viewerIsOwner && (
          <>
            <InlineDropdownMenuSeparator />
            {offered ? (
              <InlineDropdownMenuItem icon={<Undo2 aria-hidden="true" />} onSelect={onWithdraw}>
                Take back ownership offer
              </InlineDropdownMenuItem>
            ) : (
              <InlineDropdownMenuItem icon={<Crown aria-hidden="true" />} onSelect={onHandOver}>
                Make owner…
              </InlineDropdownMenuItem>
            )}
          </>
        )}
        <InlineDropdownMenuSeparator />
        <InlineDropdownMenuItem
          icon={<Trash2 aria-hidden="true" />}
          onSelect={onRemove}
          className={menuDangerRowClasses}
        >
          Remove from workspace
        </InlineDropdownMenuItem>
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}

/**
 * What a guest may do on the workspace's boards, and taking them off — the
 * share window's role menu, applied to every board of this workspace they
 * are on. Someone on boards with different roles reads "Mixed access" until
 * a choice here makes them the same.
 */
function GuestMenu({
  guest,
  container,
  busy,
  onRole,
  onRemove,
}: {
  guest: WorkspaceGuest;
  container: HTMLElement | null;
  busy: boolean;
  onRole: (role: GuestRole) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEscape(open ? () => setOpen(false) : null);
  const roles = new Set(guest.boards.map((board) => board.role));
  const [only] = roles;
  // A share link hands out editor or viewer; an owner row here would be a
  // leftover, and reads as editor.
  const role = roles.size === 1 && only ? (only === 'viewer' ? 'viewer' : 'editor') : '';
  const Icon = role === 'viewer' ? Eye : Pencil;

  return (
    <InlineDropdownMenu open={open} onOpenChange={setOpen}>
      <InlineDropdownMenuTrigger asChild>
        <SettingsButton
          aria-label={`Access for ${guest.name}`}
          data-testid={`guest-menu-${guest.userId}`}
          disabled={busy}
          className="gap-[6px] pr-[7px] pl-[9px] data-[state=open]:bg-[var(--surface-wash-hover)] [&[data-state=open]>svg:last-child]:rotate-180"
        >
          {role && <Icon className="size-[12px]" aria-hidden="true" />}
          {guestRole(guest)}
          <ChevronDown
            className="size-[12px] text-[var(--surface-fg-muted)] transition-transform duration-200"
            aria-hidden="true"
          />
        </SettingsButton>
      </InlineDropdownMenuTrigger>
      <InlineDropdownMenuContent
        align="end"
        sideOffset={4}
        collisionPadding={8}
        container={container}
        aria-label={`Access for ${guest.name}`}
        className="min-w-48"
      >
        <InlineDropdownMenuRadioGroup
          value={role}
          onValueChange={(value) => onRole(value as GuestRole)}
        >
          <InlineDropdownMenuChoiceItem value="editor" icon={<Pencil aria-hidden="true" />}>
            Can edit
          </InlineDropdownMenuChoiceItem>
          <InlineDropdownMenuChoiceItem value="viewer" icon={<Eye aria-hidden="true" />}>
            Can view
          </InlineDropdownMenuChoiceItem>
        </InlineDropdownMenuRadioGroup>
        <InlineDropdownMenuSeparator />
        <InlineDropdownMenuItem
          icon={<Trash2 aria-hidden="true" />}
          onSelect={onRemove}
          className={menuDangerRowClasses}
        >
          {guest.boards.length === 1 ? 'Remove from board' : 'Remove from boards'}
        </InlineDropdownMenuItem>
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}

/**
 * Asks before something that cannot be taken back in one click, saying what
 * will happen, with the error in place if it does not.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  testId,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  testId?: string;
  /** Resolves once done; rejects with why it was not. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
      setBusy(false);
    }
  };

  return (
    <SettingsModal
      title={title}
      description={description}
      onClose={onClose}
      actions={
        <>
          <SettingsButton onClick={onClose} disabled={busy}>
            Cancel
          </SettingsButton>
          <SettingsButton
            variant={danger ? 'danger' : 'primary'}
            onClick={() => void confirm()}
            disabled={busy}
            data-testid={testId}
          >
            {busy ? 'Working…' : confirmLabel}
          </SettingsButton>
        </>
      }
    >
      {error && <ErrorLine>{error}</ErrorLine>}
    </SettingsModal>
  );
}

/** "Their 3 boards pass to Sam", or nothing to say when they own none here. */
function boardsWord(count: number): string {
  return count === 1 ? '1 board' : `${count} boards`;
}

/**
 * Who is in the workspace, who has been asked in, and who else is on its
 * boards.
 *
 * Guests are kept apart because their access is narrower: a share link let
 * them onto particular boards, and nothing else in the workspace is theirs to
 * open. Saying which boards is what makes the difference visible.
 *
 * Whoever runs the workspace also gets the Invite form, the invitations still
 * waiting for an answer, and a menu on everyone they may manage: member or
 * admin, removing them, and — for the owner — handing the workspace over.
 * Each change is re-read through the same list everyone else's window reads,
 * so what shows here is what the server kept.
 */
export function MembersDialog({
  workspaceName,
  workspaceId = null,
  people,
  userId,
  viewerRole = null,
  onChanged,
  onClose,
}: {
  workspaceName: string;
  /** Needed to change anything; without it the window only lists. */
  workspaceId?: string | null;
  people: WorkspacePeople;
  userId: string | null;
  /** The role of whoever is looking. The server holds the same rules and is what decides. */
  viewerRole?: WorkspaceRole | null;
  /** Called after anything here changes, to re-read the list. */
  onChanged?: () => void;
  onClose: () => void;
}) {
  const { members, guests } = people;
  const editable = workspaceId !== null && viewerRole !== null;
  const inviting = editable && can(viewerRole, 'invite');
  const invites = inviting ? (people.invites ?? []) : [];
  const offer = people.ownershipOffer ?? null;
  const owner = members.find((member) => member.role === 'owner') ?? null;
  const hasGuests = guests.length > 0;
  const managesGuests = editable && can(viewerRole, 'manage-members');
  const captioned = hasGuests || invites.length > 0;
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const now = useMinuteClock();

  const done = (next: Notice) => {
    setNotice(next);
    if (next) onChanged?.();
  };

  /** A change from a menu that needs no confirming. `key` is the row it came from. */
  const act = async (key: string, run: () => Promise<void>, said: string) => {
    if (working) return;
    setWorking(key);
    setNotice(null);
    try {
      await run();
      done({ tone: 'ok', text: said });
    } catch (err: unknown) {
      done({ tone: 'caution', text: err instanceof Error ? err.message : 'That didn’t work.' });
    } finally {
      setWorking(null);
    }
  };

  const description = inviting
    ? `Everyone in ${workspaceName}. Invite people by email to join it and all its boards.`
    : hasGuests
      ? `Everyone in ${workspaceName}, and the people let onto its boards by link.`
      : `Everyone in ${workspaceName}.`;

  return (
    <>
      <SettingsModal
        title="Members"
        description={description}
        onClose={onClose}
        width={inviting ? 520 : 460}
        layerRef={setLayer}
        actions={
          <SettingsButton variant="primary" onClick={onClose}>
            Done
          </SettingsButton>
        }
      >
        {inviting && (
          <div className="flex flex-col gap-[6px] border-b border-[var(--surface-line)] pb-[14px]">
            <InviteForm workspaceId={workspaceId} onSent={done} />
          </div>
        )}
        <NoticeLine notice={notice} />
        <div className={cn('max-h-[340px] overflow-y-auto pr-[2px]', SCROLLBAR)}>
          {captioned && <GroupCaption>{`Members · ${members.length}`}</GroupCaption>}
          <ul>
            {members.map((member: WorkspaceMember) => {
              const offered = offer?.toUserId === member.userId;
              const manageable =
                editable && member.userId !== userId && canManageMember(viewerRole, member.role);
              return (
                <PersonRow
                  key={member.userId}
                  testId={`workspace-member-${member.userId}`}
                  photo={member.photo}
                  name={member.name}
                  you={member.userId === userId}
                  tag={offered && <StatusTag tone="caution">Ownership offered</StatusTag>}
                  detail={detailOf(member) ?? 'No username yet'}
                  end={
                    manageable && workspaceId ? (
                      <MemberMenu
                        member={member}
                        viewerIsOwner={viewerRole === 'owner'}
                        offered={offered}
                        container={layer}
                        busy={working === member.userId}
                        onRole={(role) =>
                          void act(
                            member.userId,
                            () => changeMemberRole(workspaceId, member.userId, role),
                            `${member.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`,
                          )
                        }
                        onHandOver={() => setPending({ kind: 'hand-over', member })}
                        onWithdraw={() =>
                          void act(
                            member.userId,
                            () => withdrawOwnershipOffer(workspaceId),
                            `Ownership offer to ${member.name} taken back.`,
                          )
                        }
                        onRemove={() => setPending({ kind: 'remove', member })}
                      />
                    ) : (
                      <span className={PILL}>
                        {member.role === 'owner' && (
                          <Crown className="size-[12px]" aria-hidden="true" />
                        )}
                        {ROLE_LABELS[member.role]}
                      </span>
                    )
                  }
                />
              );
            })}
          </ul>
          {inviting && invites.length > 0 && workspaceId && (
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
                      end={
                        managesGuests && workspaceId && guest.userId !== userId ? (
                          <GuestMenu
                            guest={guest}
                            container={layer}
                            busy={working === guest.userId}
                            onRole={(role) =>
                              void act(
                                guest.userId,
                                () => setGuestRole(workspaceId, guest.userId, role),
                                `${guest.name} can now ${role === 'viewer' ? 'view' : 'edit'} ${
                                  guest.boards.length === 1
                                    ? guest.boards[0]?.title
                                    : `the ${guest.boards.length} boards they’re on`
                                }.`,
                              )
                            }
                            onRemove={() => setPending({ kind: 'remove-guest', guest })}
                          />
                        ) : (
                          <span className={PILL}>{guestRole(guest)}</span>
                        )
                      }
                    />
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </SettingsModal>

      {pending?.kind === 'remove' && workspaceId && (
        <ConfirmDialog
          title={`Remove ${pending.member.name}?`}
          description={`They lose ${workspaceName} and every board in it at once. What they drew stays on the boards, and any boards they own pass to ${
            owner?.userId === userId ? 'you' : (owner?.name ?? 'the owner')
          }.`}
          confirmLabel="Remove"
          danger
          testId="confirm-remove"
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const { member } = pending;
            const departed = await removeMember(workspaceId, member.userId);
            setPending(null);
            done({
              tone: 'ok',
              text:
                departed.boardsPassed > 0
                  ? `${member.name} was removed. Their ${boardsWord(departed.boardsPassed)} passed to ${
                      owner?.userId === userId ? 'you' : (owner?.name ?? 'the owner')
                    }.`
                  : `${member.name} was removed.`,
            });
          }}
        />
      )}
      {pending?.kind === 'remove-guest' && workspaceId && (
        <ConfirmDialog
          title={`Remove ${pending.guest.name}?`}
          description={`They lose ${
            pending.guest.boards.length === 1
              ? pending.guest.boards[0]?.title
              : `all ${pending.guest.boards.length} boards they’re on in ${workspaceName}`
          } at once. What they drew stays, and a board’s owner can add them back from Share. ${
            pending.guest.isGuest
              ? 'They joined without an account, so a share link that lets guests in could let them in again as a new guest — reset it from Share to keep them out.'
              : 'Share links won’t let them back.'
          }`}
          confirmLabel="Remove"
          danger
          testId="confirm-remove-guest"
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const { guest } = pending;
            await removeGuest(workspaceId, guest.userId);
            setPending(null);
            done({ tone: 'ok', text: `${guest.name} was removed from the boards.` });
          }}
        />
      )}
      {pending?.kind === 'hand-over' && workspaceId && (
        <ConfirmDialog
          title={`Make ${pending.member.name} the owner?`}
          description={`They’re asked first, by email and in Settings. Once they accept they have full control of ${workspaceName}, including deleting it, and you become an admin. Until then nothing changes.`}
          confirmLabel="Offer ownership"
          testId="confirm-hand-over"
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const { member } = pending;
            await offerOwnership(workspaceId, member.userId);
            setPending(null);
            done({
              tone: 'ok',
              text: `Ownership offered to ${member.name}. It’s theirs once they accept.`,
            });
          }}
        />
      )}
    </>
  );
}

/**
 * Choosing who to offer the workspace to, for an owner who wants to leave:
 * everyone else in it, one to pick. They are asked; nothing changes until
 * they accept.
 */
export function HandOverDialog({
  workspaceId,
  workspaceName,
  members,
  userId,
  onOffered,
  onClose,
}: {
  workspaceId: string;
  workspaceName: string;
  members: WorkspaceMember[];
  userId: string | null;
  onOffered: () => void;
  onClose: () => void;
}) {
  const others = members.filter((member) => member.userId !== userId);
  const [chosen, setChosen] = useState<string | null>(others[0]?.userId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offer = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      await offerOwnership(workspaceId, chosen);
      onOffered();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not offer the ownership.');
      setBusy(false);
    }
  };

  return (
    <SettingsModal
      title="Hand over the workspace"
      description={`Choose who should own ${workspaceName}. They’re asked by email and in Settings, and once they accept you become an admin and can leave.`}
      onClose={onClose}
      width={460}
      actions={
        <>
          <SettingsButton onClick={onClose} disabled={busy}>
            Cancel
          </SettingsButton>
          <SettingsButton
            variant="primary"
            onClick={() => void offer()}
            disabled={busy || !chosen}
            data-testid="hand-over-offer"
          >
            {busy ? 'Offering…' : 'Offer ownership'}
          </SettingsButton>
        </>
      }
    >
      <ul
        role="radiogroup"
        aria-label="New owner"
        className={cn('max-h-[300px] overflow-y-auto pr-[2px]', SCROLLBAR)}
      >
        {others.map((member) => {
          const selected = member.userId === chosen;
          return (
            <li key={member.userId}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChosen(member.userId)}
                data-testid={`hand-over-${member.userId}`}
                className={cn(
                  'flex h-[50px] w-full items-center gap-[11px] rounded-[8px] px-[8px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]',
                  selected ? 'bg-[var(--surface-wash-hover)]' : 'hover:bg-[var(--surface-wash)]',
                )}
              >
                <PersonAvatar
                  url={member.photo}
                  name={member.name}
                  className="size-[30px] text-[11px]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                  <span className="truncate text-[12.5px] font-medium">{member.name}</span>
                  <span className="truncate text-[11.5px] text-[var(--surface-fg-muted)]">
                    {detailOf(member) ?? ROLE_LABELS[member.role]}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-[14px] shrink-0 rounded-full border',
                    selected
                      ? 'border-[4px] border-[var(--surface-accent)]'
                      : 'border-[var(--surface-border)]',
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}
