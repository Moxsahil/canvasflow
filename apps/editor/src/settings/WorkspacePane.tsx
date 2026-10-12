import { useState } from 'react';
import { can } from '@canvasflow/types';
import { env } from '@/lib/env';
import type { WorkspaceRole, WorkspaceSummary } from '../workspace/workspace-api';
import {
  acceptOwnership,
  leaveWorkspace,
  withdrawOwnershipOffer,
  type SharedBoard,
  type WorkspaceMember,
} from '../workspace/people-api';
import { useWorkspacePeople } from '../workspace/useWorkspacePeople';
import { announceWorkspaceChanged } from '../workspace/workspace-events';
import { ConfirmDialog, HandOverDialog, MembersDialog, ROLE_LABELS } from './WorkspaceDialogs';
import {
  Band,
  InlineTextField,
  SettingRow,
  SettingsButton,
  SettingsPage,
  StatusTag,
  ValueText,
} from './settings-ui';

const LEAD = 'Members, roles, and workspace-level settings.';

const MAX_WORKSPACE_NAME = 60;

/** Which workspace the tab is about: none (a guest), not known yet, or this one. */
export type WorkspaceSettingsSource =
  | { status: 'none' }
  /**
   * The sidebar is listing the boards shared from other people's workspaces.
   * `board` is the open board when it is one of them; `own` is one's own first
   * workspace, if there is one, to point at.
   */
  | { status: 'shared'; board: SharedBoard | null; own: WorkspaceSummary | null }
  | { status: 'loading' }
  | { status: 'ready'; workspace: WorkspaceSummary };

const ROLE_HINTS: Record<WorkspaceRole, string> = {
  owner: 'Full control, including deleting the workspace',
  admin: 'Can rename it, invite people, and change or remove members',
  member: 'Can open, make and edit its boards',
};

/** "You're the owner here", and so on. */
const ROLE_PHRASES: Record<WorkspaceRole, string> = {
  owner: 'the owner',
  admin: 'an admin',
  member: 'a member',
};

/** Which dialog is up over the page. */
type Dialog = 'members' | 'leave' | 'hand-over' | null;

/** "you", or the owner's name, for sentences about where boards go. */
function ownerWord(owner: WorkspaceMember | null, userId: string | null): string {
  if (!owner) return 'the owner';
  return owner.userId === userId ? 'you' : owner.name;
}

/** "Just you", "3 members", and the invitations and guests after them when there are any. */
function peopleCount(members: number, invited: number, guests: number): string {
  const parts = [members === 1 ? 'Just you' : `${members} members`];
  if (invited > 0) parts.push(`${invited} invited`);
  if (guests > 0) parts.push(guests === 1 ? '1 guest' : `${guests} guests`);
  return parts.join(' · ');
}

interface WorkspacePaneProps {
  source: WorkspaceSettingsSource;
  /** Who is signed in, to mark them in the member list. */
  userId?: string | null;
  /** Resolves once the server has kept the name, and rejects with why it did not. */
  onRename?: (workspaceId: string, name: string) => Promise<void>;
  /** Lists one of one's own workspaces in the sidebar, which this page then follows. */
  onShowWorkspace?: (workspaceId: string) => void;
}

/**
 * Workspace: the one the sidebar is showing — what it is called, where you
 * stand in it, and who else is in it.
 */
export function WorkspacePane({
  source,
  userId = null,
  onRename,
  onShowWorkspace,
}: WorkspacePaneProps) {
  if (source.status === 'shared') {
    return <SharedPane board={source.board} own={source.own} onShowWorkspace={onShowWorkspace} />;
  }

  if (source.status === 'none') {
    return (
      <SettingsPage lead={LEAD}>
        <Band title="Workspace">
          <SettingRow
            setting="workspace-name"
            title="No workspace"
            hint="You joined this board by link. Create an account to have boards of your own."
          />
        </Band>
      </SettingsPage>
    );
  }

  return (
    <ReadyPane
      // A different workspace is a different page: nothing typed into one
      // name field should carry over into the next.
      key={source.status === 'ready' ? source.workspace.id : 'loading'}
      workspace={source.status === 'ready' ? source.workspace : null}
      userId={userId}
      onRename={onRename}
    />
  );
}

function ReadyPane({
  workspace,
  userId,
  onRename,
}: {
  /** Null while the sidebar's list is still loading. */
  workspace: WorkspaceSummary | null;
  userId: string | null;
  onRename?: (workspaceId: string, name: string) => Promise<void>;
}) {
  const people = useWorkspacePeople(workspace?.id ?? null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);

  const role = workspace?.role ?? null;
  const runs = role !== null && can(role, 'invite');
  const ready = people.status === 'ready' ? people : null;
  const members = ready?.members ?? [];
  const owner = members.find((member) => member.role === 'owner') ?? null;
  const offer = ready?.ownershipOffer ?? null;
  const offeredTo = offer ? (members.find((m) => m.userId === offer.toUserId) ?? null) : null;
  const offeredToMe = offer !== null && offer.toUserId === userId;
  const reread = () => {
    if (workspace) announceWorkspaceChanged(workspace.id);
  };

  /** Accept or turn down the ownership one was offered. */
  const answerOffer = async (accept: boolean) => {
    if (!workspace || offerBusy) return;
    setOfferBusy(true);
    setOfferError(null);
    try {
      await (accept ? acceptOwnership(workspace.id) : withdrawOwnershipOffer(workspace.id));
      reread();
    } catch (err: unknown) {
      setOfferError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
    } finally {
      setOfferBusy(false);
    }
  };

  const save = async (next: string) => {
    if (!workspace || !onRename) return false;
    if (!next) {
      setRenameError('A workspace needs a name.');
      return false;
    }
    try {
      await onRename(workspace.id, next);
      setRenameError(null);
      return true;
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : 'Could not rename the workspace.');
      return false;
    }
  };

  const membersHint =
    people.status === 'ready'
      ? peopleCount(
          people.members.length,
          runs ? (people.invites ?? []).length : 0,
          people.guests.length,
        )
      : people.status === 'error'
        ? people.error
        : 'Loading…';

  return (
    <SettingsPage
      lead={LEAD}
      dialog={
        workspace && ready && dialog === 'members' ? (
          <MembersDialog
            key="members"
            workspaceName={workspace.name}
            workspaceId={workspace.id}
            people={ready}
            userId={userId}
            viewerRole={role}
            // This window's own list re-reads at once; everyone else's hears it
            // from the sync-server.
            onChanged={reread}
            onClose={() => setDialog(null)}
          />
        ) : workspace && ready && dialog === 'hand-over' ? (
          <HandOverDialog
            key="hand-over"
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            members={members}
            userId={userId}
            onOffered={() => {
              setDialog(null);
              reread();
            }}
            onClose={() => setDialog(null)}
          />
        ) : workspace && dialog === 'leave' ? (
          <ConfirmDialog
            key="leave"
            title={`Leave ${workspace.name}?`}
            description={`You lose it and every board in it at once. What you drew stays on the boards, and any boards you own here pass to ${ownerWord(owner, userId)}. Someone in it can invite you back.`}
            confirmLabel="Leave workspace"
            danger
            testId="confirm-leave"
            onClose={() => setDialog(null)}
            onConfirm={async () => {
              await leaveWorkspace(workspace.id);
              // Off this workspace's boards, onto the most recent one left —
              // or a fresh workspace of their own if this was the only one.
              window.location.assign(new URL('/open', env.VITE_WEB_URL).toString());
            }}
          />
        ) : null
      }
    >
      <Band title="Workspace">
        {offeredToMe && (
          <SettingRow
            setting="ownership-offer"
            title="Become the owner?"
            badge={<StatusTag tone="caution">Waiting for you</StatusTag>}
            hint={
              offerError ?? (
                <>
                  {`${owner?.name ?? 'The owner'} offered you this workspace. You’d have full control, including deleting it, and they’d become an admin.`}
                </>
              )
            }
          >
            <SettingsButton
              variant="ghost"
              disabled={offerBusy}
              onClick={() => void answerOffer(false)}
              data-testid="ownership-decline"
            >
              Decline
            </SettingsButton>
            <SettingsButton
              variant="primary"
              disabled={offerBusy}
              onClick={() => void answerOffer(true)}
              data-testid="ownership-accept"
            >
              Accept
            </SettingsButton>
          </SettingRow>
        )}
        {workspace && runs ? (
          <InlineTextField
            setting="workspace-name"
            label="Workspace name"
            hint="Shown at the top of the sidebar, for everyone in it"
            value={workspace.name}
            placeholder="Workspace name"
            maxLength={MAX_WORKSPACE_NAME}
            error={renameError}
            onEdit={() => setRenameError(null)}
            onSave={save}
          />
        ) : (
          <SettingRow
            setting="workspace-name"
            title="Workspace name"
            hint={workspace ? 'Only the owner or an admin can rename it' : 'Loading…'}
          >
            {workspace && <ValueText>{workspace.name}</ValueText>}
          </SettingRow>
        )}
        <SettingRow setting="role" title="Your role" hint={role ? ROLE_HINTS[role] : 'Loading…'}>
          {role && <ValueText>{ROLE_LABELS[role]}</ValueText>}
        </SettingRow>
      </Band>

      <Band title="People">
        <SettingRow setting="members" title="Members" hint={membersHint}>
          <SettingsButton
            disabled={!ready}
            onClick={() => setDialog('members')}
            data-testid="workspace-members-open"
          >
            {runs ? 'Manage' : 'View'}
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="board-access"
          title="Default board access"
          hint="Everyone in the workspace can open and edit its boards"
        >
          <ValueText>Can edit</ValueText>
        </SettingRow>
        <LeaveRow
          role={role}
          ready={ready !== null}
          alone={members.length <= 1}
          offeredTo={offeredTo}
          onLeave={() => setDialog('leave')}
          onHandOver={() => setDialog('hand-over')}
          onWithdraw={async () => {
            if (!workspace) return;
            await withdrawOwnershipOffer(workspace.id);
            reread();
          }}
        />
      </Band>
    </SettingsPage>
  );
}

/**
 * Leaving, for anyone but the owner. The owner cannot leave until somebody
 * has accepted the workspace from them, so their row is where that starts —
 * or says who it is waiting on — and, alone in the workspace, says to delete
 * it instead.
 */
function LeaveRow({
  role,
  ready,
  alone,
  offeredTo,
  onLeave,
  onHandOver,
  onWithdraw,
}: {
  role: WorkspaceRole | null;
  ready: boolean;
  alone: boolean;
  offeredTo: WorkspaceMember | null;
  onLeave: () => void;
  onHandOver: () => void;
  onWithdraw: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role !== 'owner') {
    return (
      <SettingRow
        setting="leave-workspace"
        title="Leave workspace"
        hint="You’ll lose access to its boards. Boards you own here pass to the owner."
      >
        <SettingsButton
          variant="danger"
          disabled={!role}
          onClick={onLeave}
          data-testid="workspace-leave"
        >
          Leave
        </SettingsButton>
      </SettingRow>
    );
  }

  if (!ready || alone) {
    return (
      <SettingRow
        setting="leave-workspace"
        title="Leave workspace"
        hint={ready ? 'You’re the only one here. Delete the workspace instead.' : 'Loading…'}
      >
        <SettingsButton variant="danger" disabled data-testid="workspace-leave">
          Leave
        </SettingsButton>
      </SettingRow>
    );
  }

  if (offeredTo) {
    return (
      <SettingRow
        setting="leave-workspace"
        title="Leave workspace"
        badge={<StatusTag tone="caution">Handing over</StatusTag>}
        hint={
          error ??
          `Waiting for ${offeredTo.name} to accept the ownership. You can leave once they do.`
        }
      >
        <SettingsButton
          disabled={busy}
          data-testid="ownership-withdraw"
          onClick={() => {
            setBusy(true);
            setError(null);
            onWithdraw()
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'That didn’t work. Try again.'),
              )
              .finally(() => setBusy(false));
          }}
        >
          Take back offer
        </SettingsButton>
      </SettingRow>
    );
  }

  return (
    <SettingRow
      setting="leave-workspace"
      title="Leave workspace"
      hint="You’re the owner. Hand the workspace to someone first; you can leave once they accept."
    >
      <SettingsButton onClick={onHandOver} data-testid="workspace-hand-over">
        Hand over…
      </SettingsButton>
    </SettingRow>
  );
}

/**
 * For a board one was let onto by link, from a workspace one is not in.
 *
 * There is nothing here to run — inviting, roles and leaving belong to that
 * workspace's people — so the page says whose board it is and what one may do
 * on it, and points at one's own workspace, rather than showing that one under
 * a board it has nothing to do with.
 */
function SharedPane({
  board,
  own,
  onShowWorkspace,
}: {
  board: SharedBoard | null;
  own: WorkspaceSummary | null;
  onShowWorkspace?: (workspaceId: string) => void;
}) {
  return (
    <SettingsPage lead={LEAD}>
      <Band title="This board">
        <SettingRow
          setting="workspace-name"
          title={board ? `Shared with you from ${board.workspaceName}` : 'Shared with you'}
          hint={
            board
              ? `${board.ownerName} shared it with you by link. You’re not in ${board.workspaceName}, so its members and settings aren’t yours to manage.`
              : 'Boards shared with you by link, from workspaces you’re not in. Their members and settings aren’t yours to manage.'
          }
        />
        {board && (
          <SettingRow
            setting="role"
            title="Your access"
            hint="Set by the board’s owner, from the board’s Share window"
          >
            <ValueText>{board.role === 'viewer' ? 'Can view' : 'Can edit'}</ValueText>
          </SettingRow>
        )}
      </Band>
      <Band title="Your workspace">
        {own ? (
          <SettingRow
            setting="members"
            title={own.name}
            hint={`You’re ${ROLE_PHRASES[own.role]} here. Open it to manage its members and settings.`}
          >
            <SettingsButton
              onClick={() => onShowWorkspace?.(own.id)}
              disabled={!onShowWorkspace}
              data-testid="workspace-show-own"
            >
              Open
            </SettingsButton>
          </SettingRow>
        ) : (
          <SettingRow
            setting="members"
            title="No workspace of your own yet"
            hint="Create one from the menu at the top of the sidebar to make boards of your own."
          />
        )}
      </Band>
    </SettingsPage>
  );
}
