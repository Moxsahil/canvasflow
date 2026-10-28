import { useState } from 'react';
import { can } from '@canvasflow/types';
import { env } from '@/lib/env';
import { t as translate, useT, type TranslationKey } from '../i18n';
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

const ROLE_HINTS: Record<WorkspaceRole, TranslationKey> = {
  owner: 'role.hint.owner',
  admin: 'role.hint.admin',
  member: 'role.hint.member',
};

/** "You're the owner here", and so on — whole sentences, for the article. */
const YOURE_HERE: Record<WorkspaceRole, TranslationKey> = {
  owner: 'workspacePane.youreHere.owner',
  admin: 'workspacePane.youreHere.admin',
  member: 'workspacePane.youreHere.member',
};

/** Which dialog is up over the page. */
type Dialog = 'members' | 'leave' | 'hand-over' | null;

/** "you", or the owner's name, for sentences about where boards go. */
function ownerWord(owner: WorkspaceMember | null, userId: string | null): string {
  if (!owner) return translate('share.theOwner');
  return owner.userId === userId ? translate('workspacePane.you') : owner.name;
}

/** "Just you", "3 members", and the invitations and guests after them when there are any. */
function peopleCount(members: number, invited: number, guests: number): string {
  const parts = [
    members === 1
      ? translate('workspacePane.justYou')
      : translate('share.memberCount', { count: members }),
  ];
  if (invited > 0) parts.push(translate('workspacePane.invited', { count: invited }));
  if (guests > 0) parts.push(translate('workspacePane.guests', { count: guests }));
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
  const t = useT();
  if (source.status === 'shared') {
    return <SharedPane board={source.board} own={source.own} onShowWorkspace={onShowWorkspace} />;
  }

  if (source.status === 'none') {
    return (
      <SettingsPage lead={t('settings.section.workspace.lead')}>
        <Band title={t('settings.group.workspace')}>
          <SettingRow
            setting="workspace-name"
            title={t('workspacePane.none')}
            hint={t('workspacePane.noneHint')}
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
  const t = useT();
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
      setOfferError(err instanceof Error ? err.message : t('common.didNotWork'));
    } finally {
      setOfferBusy(false);
    }
  };

  const save = async (next: string) => {
    if (!workspace || !onRename) return false;
    if (!next) {
      setRenameError(t('workspacePane.nameRequired'));
      return false;
    }
    try {
      await onRename(workspace.id, next);
      setRenameError(null);
      return true;
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : t('workspacePane.renameFailed'));
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
        : t('common.loading');

  return (
    <SettingsPage
      lead={t('settings.section.workspace.lead')}
      dialog={
        workspace && ready && dialog === 'members' ? (
          <MembersDialog
            key="members"
            workspaceName={workspace.name}
            workspaceId={workspace.id}
            people={ready}
            userId={userId}
            viewerRole={role}
            plan={workspace.plan}
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
            title={t('workspacePane.leaveTitle', { name: workspace.name })}
            description={t('workspacePane.leaveBody', { owner: ownerWord(owner, userId) })}
            confirmLabel={t('settings.row.leave-workspace')}
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
      <Band title={t('settings.group.workspace')}>
        {offeredToMe && (
          <SettingRow
            setting="ownership-offer"
            title={t('workspacePane.becomeOwner')}
            badge={<StatusTag tone="caution">{t('workspacePane.waitingForYou')}</StatusTag>}
            hint={
              offerError ??
              t('workspacePane.offeredYou', { owner: owner?.name ?? t('workspacePane.theOwner') })
            }
          >
            <SettingsButton
              variant="ghost"
              disabled={offerBusy}
              onClick={() => void answerOffer(false)}
              data-testid="ownership-decline"
            >
              {t('workspacePane.decline')}
            </SettingsButton>
            <SettingsButton
              variant="primary"
              disabled={offerBusy}
              onClick={() => void answerOffer(true)}
              data-testid="ownership-accept"
            >
              {t('workspacePane.accept')}
            </SettingsButton>
          </SettingRow>
        )}
        {workspace && runs ? (
          <InlineTextField
            setting="workspace-name"
            label={t('workspace.name')}
            hint={t('workspacePane.nameHint')}
            value={workspace.name}
            placeholder={t('workspace.name')}
            maxLength={MAX_WORKSPACE_NAME}
            error={renameError}
            onEdit={() => setRenameError(null)}
            onSave={save}
          />
        ) : (
          <SettingRow
            setting="workspace-name"
            title={t('workspace.name')}
            hint={workspace ? t('workspacePane.renameRestricted') : t('common.loading')}
          >
            {workspace && <ValueText>{workspace.name}</ValueText>}
          </SettingRow>
        )}
        <SettingRow
          setting="role"
          title={t('settings.row.role')}
          hint={role ? t(ROLE_HINTS[role]) : t('common.loading')}
        >
          {role && <ValueText>{t(ROLE_LABELS[role])}</ValueText>}
        </SettingRow>
      </Band>

      <Band title={t('settings.group.people')}>
        <SettingRow setting="members" title={t('settings.row.members')} hint={membersHint}>
          <SettingsButton
            disabled={!ready}
            onClick={() => setDialog('members')}
            data-testid="workspace-members-open"
          >
            {runs ? t('account.manage') : t('workspacePane.view')}
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="board-access"
          title={t('settings.row.board-access')}
          hint={t('workspacePane.boardAccessHint')}
        >
          <ValueText>{t('access.canEdit')}</ValueText>
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
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role !== 'owner') {
    return (
      <SettingRow
        setting="leave-workspace"
        title={t('settings.row.leave-workspace')}
        hint={t('workspacePane.leaveHint')}
      >
        <SettingsButton
          variant="danger"
          disabled={!role}
          onClick={onLeave}
          data-testid="workspace-leave"
        >
          {t('workspacePane.leave')}
        </SettingsButton>
      </SettingRow>
    );
  }

  if (!ready || alone) {
    return (
      <SettingRow
        setting="leave-workspace"
        title={t('settings.row.leave-workspace')}
        hint={ready ? t('workspacePane.onlyOne') : t('common.loading')}
      >
        <SettingsButton variant="danger" disabled data-testid="workspace-leave">
          {t('workspacePane.leave')}
        </SettingsButton>
      </SettingRow>
    );
  }

  if (offeredTo) {
    return (
      <SettingRow
        setting="leave-workspace"
        title={t('settings.row.leave-workspace')}
        badge={<StatusTag tone="caution">{t('workspacePane.handingOver')}</StatusTag>}
        hint={error ?? t('workspacePane.waitingFor', { name: offeredTo.name })}
      >
        <SettingsButton
          disabled={busy}
          data-testid="ownership-withdraw"
          onClick={() => {
            setBusy(true);
            setError(null);
            onWithdraw()
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : t('common.didNotWork')),
              )
              .finally(() => setBusy(false));
          }}
        >
          {t('workspacePane.takeBackOffer')}
        </SettingsButton>
      </SettingRow>
    );
  }

  return (
    <SettingRow
      setting="leave-workspace"
      title={t('settings.row.leave-workspace')}
      hint={t('workspacePane.ownerLeaveHint')}
    >
      <SettingsButton onClick={onHandOver} data-testid="workspace-hand-over">
        {t('workspacePane.handOver')}
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
  const t = useT();
  return (
    <SettingsPage lead={t('settings.section.workspace.lead')}>
      <Band title={t('board.thisBoard')}>
        <SettingRow
          setting="workspace-name"
          title={
            board
              ? t('workspacePane.sharedFrom', { workspace: board.workspaceName })
              : t('boards.sharedWithYou')
          }
          hint={
            board
              ? t('workspacePane.sharedHint', {
                  owner: board.ownerName,
                  workspace: board.workspaceName,
                })
              : t('workspacePane.sharedListHint')
          }
        />
        {board && (
          <SettingRow
            setting="role"
            title={t('workspacePane.yourAccess')}
            hint={t('workspacePane.yourAccessHint')}
          >
            <ValueText>
              {board.role === 'viewer' ? t('access.canView') : t('access.canEdit')}
            </ValueText>
          </SettingRow>
        )}
      </Band>
      <Band title={t('workspacePane.yourWorkspace')}>
        {own ? (
          <SettingRow setting="members" title={own.name} hint={t(YOURE_HERE[own.role])}>
            <SettingsButton
              onClick={() => onShowWorkspace?.(own.id)}
              disabled={!onShowWorkspace}
              data-testid="workspace-show-own"
            >
              {t('library.open')}
            </SettingsButton>
          </SettingRow>
        ) : (
          <SettingRow
            setting="members"
            title={t('workspacePane.noOwn')}
            hint={t('workspacePane.noOwnHint')}
          />
        )}
      </Band>
    </SettingsPage>
  );
}
