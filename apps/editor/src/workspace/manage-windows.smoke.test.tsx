import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeleteWarningDialog } from './DeleteWarningDialog';
import { ManageDialog } from './ManageDialog';
import { RenameBoardDialog } from './RenameBoardDialog';
import type { BoardSwitcherState, ManageTarget, WorkspaceBoards } from './useBoardSwitcher';
import type { BoardSummary, WorkspaceSummary } from './workspace-api';

const noop = () => {};
const done = async () => {};

const workspace = (
  id: string,
  name: string,
  boardCount: number,
  role: WorkspaceSummary['role'] = 'owner',
): WorkspaceSummary => ({ id, name, slug: id, plan: 'free', logoUrl: null, role, boardCount });

const board = (id: string, title: string): BoardSummary => ({
  id,
  workspaceId: 'home',
  title,
  visibility: 'workspace',
  color: 'green',
  updatedAt: '2026-09-22T10:00:00.000Z',
});

function state(manageTarget: ManageTarget | null, lists: Record<string, WorkspaceBoards> = {}) {
  return {
    boardId: 'open',
    title: 'Onboarding flow',
    color: 'green',
    workspaceId: 'home',
    workspaces: [workspace('home', 'Northwind', 2), workspace('side', 'Side project', 1, 'admin')],
    available: true,
    browsedWorkspaceId: null,
    browseWorkspace: noop,
    loadWorkspaceBoards: noop,
    boardsFor: (id: string) => lists[id],
    openBoard: noop,
    createBoard: noop,
    createWorkspace: noop,
    renameBoard: done,
    renameTarget: null,
    canRename: true,
    beginRename: noop,
    endRename: noop,
    deleteBoard: done,
    renameWorkspace: done,
    deleteWorkspace: done,
    manageTarget,
    beginManage: noop,
    endManage: noop,
    busy: false,
    error: null,
    dismissError: noop,
  } as BoardSwitcherState;
}

describe('ManageDialog', () => {
  it('renders nothing while closed', () => {
    expect(renderToString(<ManageDialog state={state(null)} theme="dark" />)).toBe('');
  });

  it('lists the workspaces as rows, each with a menu and a way into its boards', () => {
    const html = renderToString(
      <ManageDialog state={state({ kind: 'workspaces' })} theme="dark" />,
    );
    expect(html).toContain('data-testid="manage-dialog"');
    expect(html).toContain('Workspaces');
    expect(html).toContain('Rename or delete the workspaces you belong to.');
    expect(html).toContain('2 boards · Owner');
    expect(html).toContain('1 board · Admin');
    expect(html).toContain('aria-label="More for Northwind"');
    expect(html).toContain('aria-label="Boards in Side project"');
    expect(html).toContain('Only the owner can delete a workspace.');
    expect(html).toContain('Done');
  });

  it("shows a workspace's boards with the open one tagged, and a way back", () => {
    const html = renderToString(
      <ManageDialog
        state={state(
          { kind: 'boards', workspaceId: 'home' },
          {
            home: {
              status: 'ready',
              boards: [board('open', 'Onboarding flow'), board('b2', 'Q4 roadmap')],
            },
          },
        )}
        theme="dark"
      />,
    );
    expect(html).toContain('Northwind');
    expect(html).toContain('All workspaces');
    expect(html).toContain('Q4 roadmap');
    expect(html).toContain('>Open<');
    expect(html).toContain('aria-label="More for Q4 roadmap"');
    expect(html).toContain('2 boards · you are the owner');
  });

  it('says so while the boards are loading', () => {
    const html = renderToString(
      <ManageDialog state={state({ kind: 'boards', workspaceId: 'side' })} theme="light" />,
    );
    expect(html).toContain('Loading boards…');
    expect(html).toContain('you are an admin');
  });
});

describe('DeleteWarningDialog', () => {
  const render = (props: Partial<Parameters<typeof DeleteWarningDialog>[0]> = {}) =>
    renderToString(
      <DeleteWarningDialog
        open
        onOpenChange={noop}
        title="Delete “Northwind”?"
        description="This deletes the workspace."
        confirmLabel="Delete workspace"
        busy={false}
        error={null}
        onConfirm={noop}
        theme="dark"
        {...props}
      />,
    );

  it('asks for the name to be typed, and holds Delete until it is', () => {
    const html = render({ confirmText: 'Northwind' });
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('To confirm, type');
    const button = html.split('<button').find((part) => part.includes('Delete workspace')) ?? '';
    expect(button.slice(0, button.indexOf('>'))).toContain('disabled');
  });

  it('shows a refusal in the foot, and Deleting… while busy', () => {
    expect(render({ error: 'Only the owner can delete this.' })).toContain(
      'Only the owner can delete this.',
    );
    expect(render({ busy: true })).toContain('Deleting…');
  });
});

describe('RenameBoardDialog', () => {
  it('offers the name and the seven colours, with Save held until something changes', () => {
    const html = renderToString(
      <RenameBoardDialog
        target={{ boardId: 'b2', title: 'Q4 roadmap', color: 'green' }}
        onOpenChange={noop}
        onSubmit={done}
        busy={false}
        theme="dark"
      />,
    );
    expect(html).toContain('Rename board');
    expect(html).toContain('aria-label="Board name"');
    expect(html.match(/type="radio"/g)).toHaveLength(7);
    const save = html.split('<button').find((part) => part.includes('>Save<')) ?? '';
    expect(save.slice(0, save.indexOf('>'))).toContain('disabled');
  });
});
