import { useState } from 'react';
import {
  Band,
  InlineTextField,
  SettingRow,
  SettingsButton,
  SettingsPage,
  ValueText,
} from './settings-ui';

/** Workspace: what the workspace is called, and who is in it. */
export function WorkspacePane() {
  const [workspaceName, setWorkspaceName] = useState("Sahil Barak's workspace");

  return (
    <SettingsPage lead="Members, roles, and workspace-level settings.">
      <Band title="Workspace" description="Its name, and your part in it.">
        {/* Nothing stores the name from here yet, so the band does not say
            "Saved" when it is kept. */}
        <InlineTextField
          setting="workspace-name"
          label="Workspace name"
          hint="Appears in the board header and share links"
          value={workspaceName}
          placeholder="Workspace name"
          maxLength={60}
          announce={false}
          onSave={(next) => {
            if (!next) return false;
            setWorkspaceName(next);
            return true;
          }}
        />
        <SettingRow setting="role" title="Your role" hint="Full access to every board">
          <ValueText>Owner</ValueText>
        </SettingRow>
      </Band>

      <Band title="People" description="Who is in, and who new boards let in.">
        <SettingRow setting="members" title="Members" hint="4 members, 1 invite pending">
          <SettingsButton>Manage</SettingsButton>
        </SettingRow>
        <SettingRow
          setting="board-access"
          title="Default board access"
          hint="Applies to newly created boards"
        >
          <ValueText>Invite only</ValueText>
        </SettingRow>
        <SettingRow
          setting="leave-workspace"
          title="Leave workspace"
          hint="You'll lose access to all shared boards"
        >
          <SettingsButton variant="danger">Leave</SettingsButton>
        </SettingRow>
      </Band>
    </SettingsPage>
  );
}
