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
  return {
    boardId: 'open',
    title: 'Onboarding flow',
    color: 'green',
    workspaceId: 'home',
    workspaces: [workspace('home', 'Northwind', 2), workspace('side', 'Side project', 1)],
    available: true,
    browsedWorkspaceId: null,
    browseWorkspace: noop,
    loadWorkspaceBoards: noop,
    boardsFor: (id) => entries[id],
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
    manageTarget: null,
    beginManage: noop,
    endManage: noop,
    busy: false,
    error: null,
    dismissError: noop,
    ...overrides,
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
    expect(html).toContain('data-testid="manage-boards"');
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

  it('puts the five common actions on the card, each with its name, and the rest behind More', () => {
    const html = render(<BoardCard state={state()} actions={actions} portalContainer={null} />);
    for (const id of ['open', 'saveTo', 'exportImage', 'renameBoard', 'copyLink']) {
      expect(tagWith(html, `menu-${id}`)).toContain('aria-label=');
    }
    expect(html).toContain('data-testid="menu-board-more"');
    expect(html).toContain('data-testid="menu-board-actions"');
  });

  it("disables an action that doesn't apply, without taking it off the card", () => {
    const html = render(<BoardCard state={state()} actions={actions} portalContainer={null} />);
    expect(tagWith(html, 'menu-renameBoard')).toContain('aria-disabled="true"');
    expect(tagWith(html, 'menu-open')).toContain('aria-disabled="false"');
  });
});

describe('WorkspaceSwitcher', () => {
  it('names the workspace the list shows, with its board count', () => {
    const html = render(<WorkspaceSwitcher state={state()} portalContainer={null} />);
    expect(html).toContain('Northwind');
    expect(html).toContain('2 boards');
  });

  it('follows the list to a workspace picked from it', () => {
    const html = render(
      <WorkspaceSwitcher state={state({ browsedWorkspaceId: 'side' })} portalContainer={null} />,
    );
    expect(html).toContain('Side project');
    expect(html).toContain('1 board');
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
