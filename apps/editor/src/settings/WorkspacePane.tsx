import { useState } from 'react';
import type { WorkspaceRole, WorkspaceSummary } from '../workspace/workspace-api';
import { useWorkspaceMembers } from '../workspace/useWorkspaceMembers';
import { MembersDialog, ROLE_LABELS } from './WorkspaceDialogs';
import {
  Band,
  ComingSoonTag,
  InlineTextField,
  SettingRow,
  SettingsButton,
  SettingsPage,
  ValueText,
} from './settings-ui';

const LEAD = 'Members, roles, and workspace-level settings.';

const MAX_WORKSPACE_NAME = 60;

/** Which workspace the tab is about: none (a guest), not known yet, or this one. */
export type WorkspaceSettingsSource =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; workspace: WorkspaceSummary };

const ROLE_HINTS: Record<WorkspaceRole, string> = {
  owner: 'Full control, including deleting the workspace',
  admin: 'Can rename the workspace',
  member: 'Can open, make and edit its boards',
};

/** The people who may rename it. The server holds the same rule and is what decides. */
function canRename(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}

function memberCount(count: number): string {
  return count === 1 ? 'Just you' : `${count} members`;
}

interface WorkspacePaneProps {
  source: WorkspaceSettingsSource;
  /** Who is signed in, to mark them in the member list. */
  userId?: string | null;
  /** Resolves once the server has kept the name, and rejects with why it did not. */
  onRename?: (workspaceId: string, name: string) => Promise<void>;
}

/**
 * Workspace: the one the sidebar is showing — what it is called, where you
 * stand in it, and who else is in it.
 */
export function WorkspacePane({ source, userId = null, onRename }: WorkspacePaneProps) {
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
  const members = useWorkspaceMembers(workspace?.id ?? null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [showingMembers, setShowingMembers] = useState(false);

  const role = workspace?.role ?? null;

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
    members.status === 'ready'
      ? memberCount(members.members.length)
      : members.status === 'error'
        ? members.error
        : 'Loading…';

  return (
    <SettingsPage
      lead={LEAD}
      dialog={
        showingMembers &&
        workspace &&
        members.status === 'ready' && (
          <MembersDialog
            key="members"
            workspaceName={workspace.name}
            members={members.members}
            userId={userId}
            onClose={() => setShowingMembers(false)}
          />
        )
      }
    >
      <Band title="Workspace">
        {workspace && role && canRename(role) ? (
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
            disabled={members.status !== 'ready'}
            onClick={() => setShowingMembers(true)}
          >
            View
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="board-access"
          title="Default board access"
          hint="Everyone in the workspace can open and edit its boards"
        >
          <ValueText>Can edit</ValueText>
        </SettingRow>
        <SettingRow
          setting="leave-workspace"
          title="Leave workspace"
          badge={<ComingSoonTag />}
          hint={
            role === 'owner'
              ? "You'll hand ownership to someone else first"
              : "You'll lose access to its boards"
          }
        >
          <SettingsButton variant="danger" disabled>
            Leave
          </SettingsButton>
        </SettingRow>
      </Band>
    </SettingsPage>
  );
}
