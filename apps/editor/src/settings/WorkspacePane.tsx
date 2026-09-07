import { useState } from 'react';
import {
  Card,
  GroupLabel,
  Row,
  RowText,
  SecondaryButton,
  SettingsPane,
  TextField,
  ValueText,
} from './settings-ui';

/** Workspace: what the workspace is called, and who is in it. */
export function WorkspacePane({ onClose }: { onClose: () => void }) {
  const [workspaceName, setWorkspaceName] = useState("Sahil Barak's workspace");

  return (
    <SettingsPane
      title="Workspace"
      subtitle="Members, roles, and workspace-level settings."
      onClose={onClose}
    >
      <GroupLabel>Workspace</GroupLabel>
      <Card>
        <Row>
          <RowText title="Workspace name" hint="Appears in the board header and share links" />
          <TextField
            label="Workspace name"
            value={workspaceName}
            onChange={setWorkspaceName}
            placeholder="Workspace name"
          />
        </Row>
        <Row>
          <RowText title="Your role" hint="Full access to every board" />
          <ValueText>Owner</ValueText>
        </Row>
      </Card>

      <GroupLabel>People</GroupLabel>
      <Card>
        <Row>
          <RowText title="Members" hint="4 members, 1 invite pending" />
          <SecondaryButton>Manage</SecondaryButton>
        </Row>
        <Row>
          <RowText title="Default board access" hint="Applies to newly created boards" />
          <ValueText>Invite only</ValueText>
        </Row>
        <Row>
          <RowText title="Leave workspace" hint="You'll lose access to all shared boards" />
          <SecondaryButton>Leave</SecondaryButton>
        </Row>
      </Card>
    </SettingsPane>
  );
}
