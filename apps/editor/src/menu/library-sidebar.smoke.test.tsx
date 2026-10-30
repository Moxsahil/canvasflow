import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher';
import type { BoardSummary, BoardSwitcherState, WorkspaceSummary } from '../workspace';
import type { WorkspaceBoards } from '../workspace/useBoardSwitcher';
import { BoardCard } from './BoardCard';
import { BoardList } from './BoardList';
import type { MenuActions } from './menu-items';

const noop = () => {};
const done = async () => {};

const workspace = (id: string, name: string, boardCount: number): WorkspaceSummary => ({
  id,
  name,
  slug: id,
  plan: 'free',
  logoUrl: null,
  role: 'owner',
  boardCount,
});

const board = (id: string, title: string, workspaceId = 'home'): BoardSummary => ({
  id,
  workspaceId,
  title,
  visibility: 'workspace',
  color: 'green',
  updatedAt: '2026-09-22T10:00:00.000Z',
  ownerId: 'me',
  archivedAt: null,
});

const HOME_BOARDS = [board('open', 'Onboarding flow'), board('other', 'Q4 roadmap')];

function state(
  overrides: Partial<BoardSwitcherState> = {},
  lists?: Record<string, WorkspaceBoards>,
): BoardSwitcherState {
  const entries: Record<string, WorkspaceBoards> = lists ?? {
    home: { status: 'ready', boards: HOME_BOARDS },
    side: { status: 'ready', boards: [board('elsewhere', 'Side sketches', 'side')] },
  };
  const merged: Omit<BoardSwitcherState, 'listedId'> = {
    boardId: 'open',
    title: 'Onboarding flow',
    color: 'green',
    workspaceId: 'home',
    workspaces: [workspace('home', 'Northwind', 2), workspace('side', 'Side project', 1)],
    available: true,
    local: false,
    browsedWorkspaceId: null,
    browseWorkspace: noop,
    loadWorkspaceBoards: noop,
    boardsFor: (id) => entries[id],
    openBoard: noop,
    createBoard: noop,
    addBoard: () => Promise.reject(new Error('not in this test')),
    createWorkspace: noop,
    renameBoard: done,
    renameTarget: null,
    canRename: true,
    beginRename: noop,
    endRename: noop,
    deleteBoard: done,
    renameWorkspace: done,
    deleteWorkspace: done,
    archived: false,
    canManageBoard: () => true,
    pinBoard: noop,
    unpinBoard: noop,
    reorderPins: noop,
    archiveBoard: done,
    unarchiveBoard: done,
    manageTarget: null,
    beginManage: noop,
    endManage: noop,
    busy: false,
    error: null,
    dismissError: noop,
    openBoardIsShared: false,
    sharedBoards: [],
    ...overrides,
  };
  return {
    ...merged,
    // What the sidebar lists follows from the rest, unless a test says otherwise.
    listedId:
      overrides.listedId !== undefined
        ? overrides.listedId
        : (merged.browsedWorkspaceId ?? merged.workspaceId),
  };
}

const render = (node: ReactNode) =>
  renderToString(<SidebarProvider defaultOpen>{node}</SidebarProvider>);

/** The opening tag of the element carrying `data-testid`, attribute order aside. */
function tagWith(html: string, testId: string): string {
  const part = html.split('<').find((it) => it.includes(`data-testid="${testId}"`)) ?? '';
  return part.slice(0, part.indexOf('>'));
}

describe('BoardList', () => {
  it("lists the open board's workspace, one row per board, marking the open one", () => {
    const html = render(<BoardList state={state()} portalContainer={null} theme="dark" />);
    expect(html).toContain('Onboarding flow');
    expect(html).toContain('Q4 roadmap');
    expect(tagWith(html, 'sidebar-board-open')).toContain('aria-current="page"');
    expect(tagWith(html, 'sidebar-board-other')).not.toContain('aria-current');
    expect(html).toContain('aria-label="More actions for Q4 roadmap"');
  });

  it('lists the workspace picked in the header instead, when there is one', () => {
    const html = render(
      <BoardList
        state={state({ browsedWorkspaceId: 'side' })}
        portalContainer={null}
        theme="dark"
      />,
    );
    expect(html).toContain('Side sketches');
    expect(html).not.toContain('Q4 roadmap');
  });

  it('offers finding, creating and managing boards', () => {
    const html = render(<BoardList state={state()} portalContainer={null} theme="dark" />);
    expect(html).toContain('data-testid="sidebar-find-board"');
    expect(html).toContain('data-testid="sidebar-new-board"');
    expect(html).not.toContain('data-testid="manage-boards"');
  });

  it('holds the rows open while the list loads, and says so when there is none', () => {
    expect(
      render(
        <BoardList
          state={state({}, { home: { status: 'loading' } })}
          portalContainer={null}
          theme="dark"
        />,
      ),
    ).toContain('data-sidebar="menu-skeleton"');
    expect(
      render(
        <BoardList
          state={state({}, { home: { status: 'ready', boards: [] } })}
          portalContainer={null}
          theme="dark"
        />,
      ),
    ).toContain('No boards yet.');
  });

  it('puts your pins in their own section above Boards, in the order you set', () => {
    const lists: Record<string, WorkspaceBoards> = {
      home: {
        status: 'ready',
        boards: [
          board('open', 'Onboarding flow'),
          { ...board('second', 'Second pin'), pin: 'a1' },
          { ...board('first', 'First pin'), pin: 'a0' },
        ],
      },
    };
    const html = render(<BoardList state={state({}, lists)} portalContainer={null} theme="dark" />);
    const pinned = html.indexOf('data-testid="sidebar-pinned-boards"');
    expect(pinned).toBeGreaterThan(-1);
    // Pinned first, by order key rather than by when they changed…
    expect(html.indexOf('First pin')).toBeGreaterThan(pinned);
    expect(html.indexOf('First pin')).toBeLessThan(html.indexOf('Second pin'));
    // …then the Boards heading, and the boards nobody pinned under it.
    expect(html.indexOf('Second pin')).toBeLessThan(html.indexOf('Your boards<'));
    expect(html.indexOf('Your boards<')).toBeLessThan(html.indexOf('Onboarding flow'));
  });

  it('shows no Pinned section until something is pinned', () => {
    const html = render(<BoardList state={state()} portalContainer={null} theme="dark" />);
    expect(html).not.toContain('sidebar-pinned-boards');
  });

  it('folds archived boards away under one row at the foot, pins and all', () => {
    const lists: Record<string, WorkspaceBoards> = {
      home: {
        status: 'ready',
        boards: [
          board('open', 'Onboarding flow'),
          { ...board('old', 'Old plan'), pin: 'a0', archivedAt: '2026-10-10T00:00:00.000Z' },
        ],
      },
    };
    const html = render(<BoardList state={state({}, lists)} portalContainer={null} theme="dark" />);
    expect(tagWith(html, 'sidebar-archived-toggle')).toContain('aria-expanded="false"');
    expect(html).not.toContain('Old plan');
    // An archived pin is not shown as pinned.
    expect(html).not.toContain('sidebar-pinned-boards');
  });

  it('says there are no boards when every one is archived, with the archive a click away', () => {
    const lists: Record<string, WorkspaceBoards> = {
      home: {
        status: 'ready',
        boards: [{ ...board('open', 'Onboarding flow'), archivedAt: '2026-10-10T00:00:00.000Z' }],
      },
    };
    const html = render(
      <BoardList state={state({ archived: true }, lists)} portalContainer={null} theme="dark" />,
    );
    expect(html).toContain('data-testid="sidebar-archived-toggle"');
    expect(html).toContain('No boards yet.');
  });

  it('lists nothing for a guest, who has no workspace', () => {
    const html = render(
      <BoardList
        state={state({ available: false, workspaceId: null })}
        portalContainer={null}
        theme="dark"
      />,
    );
    expect(html).not.toContain('sidebar-board-');
    expect(html).not.toContain('Find a board');
  });
});

describe('BoardCard', () => {
  const actions: MenuActions = {
    open: noop,
    saveTo: noop,
    exportImage: noop,
    renameBoard: null,
    copyLink: noop,
  };

  it('names the open board, and when it last changed', () => {
    const html = render(<BoardCard state={state()} actions={actions} portalContainer={null} />);
    expect(html).toContain('Onboarding flow');
    expect(html).toContain('Edited ');
  });

  it('keeps the card to the board itself, with its actions behind one menu', () => {
    const html = render(<BoardCard state={state()} actions={actions} portalContainer={null} />);
    expect(html).toContain('data-testid="menu-board-more"');
    expect(html).toContain('data-testid="menu-board-actions"');
    for (const id of ['open', 'saveTo', 'exportImage', 'renameBoard', 'copyLink']) {
      expect(html).not.toContain(`data-testid="menu-${id}"`);
    }
  });
});

describe('WorkspaceSwitcher', () => {
  it('names the workspace the list shows, with its board count', () => {
    const html = render(<WorkspaceSwitcher state={state()} portalContainer={null} />);
    expect(html).toContain('Northwind');
  });

  it('follows the list to a workspace picked from it', () => {
    const html = render(
      <WorkspaceSwitcher state={state({ browsedWorkspaceId: 'side' })} portalContainer={null} />,
    );
    expect(html).toContain('Side project');
  });

  it('shows a guest the board they were let into, with no menu behind it', () => {
    const html = render(
      <WorkspaceSwitcher
        state={state({ available: false, workspaces: null, workspaceId: null })}
        portalContainer={null}
      />,
    );
    expect(html).toContain('Onboarding flow');
    expect(html).not.toContain('data-testid="workspace-switcher"');
  });
});
