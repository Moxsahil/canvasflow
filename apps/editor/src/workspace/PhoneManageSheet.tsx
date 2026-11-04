import { useEffect, useState } from 'react';
import { PLAN_NAMES } from '@canvasflow/types';
import { useT } from '../i18n';
import { Icon, Tile } from '../settings/phone/icons';
import { Group, Hint, Row, T } from '../settings/phone/shell';
import { ShortSheet } from '../settings/phone/ShortSheet';
import type { SurfaceTheme } from '../ui/surface-palette';
import { boardSwatch } from './board-colors';
import { formatUpdatedAt } from './board-presentation';
import { ROLE_KEYS } from './role-words';
import { liveBoards, type BoardSwitcherState, type ManageTarget } from './useBoardSwitcher';
import type { BoardSummary, WorkspaceSummary } from './workspace-api';

type Page = 'list' | `ws:${string}` | `boards:${string}` | `board:${string}`;

function pageFor(target: ManageTarget): Page {
  return target.kind === 'boards' ? `boards:${target.workspaceId}` : 'list';
}

/**
 * Manage workspaces on a phone: the workspaces you belong to; one of them —
 * its name, its boards, switching to it, deleting it; its boards; and one
 * board — renaming or deleting it. The same errands, and the same rules for
 * who may do them, as the desktop window.
 */
export function PhoneManageSheet({
  state,
  theme,
  target,
  error,
  onRename,
  onSwitch,
  onDeleteWorkspace,
  onDeleteBoard,
}: {
  state: BoardSwitcherState;
  theme: SurfaceTheme;
  target: ManageTarget;
  error: string | null;
  onRename: (workspaceId: string, name: string) => void;
  onSwitch: (workspaceId: string) => void;
  onDeleteWorkspace: (workspace: WorkspaceSummary) => void;
  onDeleteBoard: (board: BoardSummary) => void;
}) {
  const t = useT();
  const [stack, setStack] = useState<Page[]>(() => [pageFor(target)]);
  const page = stack[stack.length - 1]!;
  const go = (next: Page) => setStack((was) => [...was, next]);
  const back = stack.length > 1 ? () => setStack((was) => was.slice(0, -1)) : undefined;
  const workspaces = state.workspaces ?? [];
  const { loadWorkspaceBoards } = state;

  const boardsOf = page.startsWith('boards:') ? page.slice(7) : null;
  useEffect(() => {
    if (boardsOf) loadWorkspaceBoards(boardsOf);
  }, [boardsOf, loadWorkspaceBoards]);

  let title = t('manage.workspaces');
  let sub: string | undefined = t('manage.workspacesHint');
  let body: React.ReactNode;

  if (page.startsWith('ws:')) {
    const workspace = workspaces.find((it) => it.id === page.slice(3));
    title = workspace?.name ?? t('manage.workspaces');
    sub = workspace ? t(ROLE_KEYS[workspace.role]) : undefined;
    body = workspace ? (
      <WorkspacePage
        key={workspace.id}
        workspace={workspace}
        current={workspace.id === state.listedId}
        error={error}
        onRename={(name) => onRename(workspace.id, name)}
        onBoards={() => go(`boards:${workspace.id}`)}
        onSwitch={() => onSwitch(workspace.id)}
        onDelete={() => onDeleteWorkspace(workspace)}
      />
    ) : null;
  } else if (boardsOf) {
    const workspace = workspaces.find((it) => it.id === boardsOf);
    const entry = liveBoards(state.boardsFor(boardsOf));
    title = t('boards.title');
    sub = workspace?.name;
    body =
      entry === undefined || entry.status === 'loading' ? (
        <Hint>{t('manage.loadingBoards')}</Hint>
      ) : entry.status === 'error' ? (
        <Hint error>{entry.error}</Hint>
      ) : entry.boards.length === 0 ? (
        <Hint>{t('boards.none')}</Hint>
      ) : (
        <div className="st-g">
          {entry.boards.map((board) => (
            <Row
              key={board.id}
              onClick={() => go(`board:${board.id}`)}
              end={board.id === state.boardId ? t('manage.openNow') : undefined}
              testId={`phone-manage-board-${board.id}`}
            >
              <span className="st-dot" style={{ background: boardSwatch(board.color) }} />
              <T>
                {board.title}
                <small>{t('board.edited', { when: formatUpdatedAt(board.updatedAt) })}</small>
              </T>
            </Row>
          ))}
        </div>
      );
  } else if (page.startsWith('board:')) {
    const id = page.slice(6);
    const board = workspaces
      .map((it) => liveBoards(state.boardsFor(it.id)))
      .flatMap((entry) => (entry?.status === 'ready' ? entry.boards : []))
      .find((it) => it.id === id);
    title = board?.title ?? t('boards.thisBoard');
    sub = board ? t('board.edited', { when: formatUpdatedAt(board.updatedAt) }) : undefined;
    body = board ? (
      <>
        <Group>
          {board.id !== state.boardId && (
            <Row onClick={() => state.openBoard(board.id)}>
              <Tile name="home" color="#0a84ff" />
              <T>{t('ps.manage.openBoard')}</T>
            </Row>
          )}
          <Row onClick={() => state.beginRename(board.id)}>
            <Tile name="pencil" color="#30b0c7" />
            <T>{t('common.renameEllipsis')}</T>
          </Row>
        </Group>
        <div className="st-g" style={{ marginTop: 20 }}>
          <Row red chevron={false} onClick={() => onDeleteBoard(board)}>
            {t('common.deleteEllipsis')}
          </Row>
        </div>
      </>
    ) : null;
  } else {
    body = (
      <>
        <div className="st-g" style={{ '--hl': '62px' } as React.CSSProperties}>
          {workspaces.map((workspace) => (
            <Row
              key={workspace.id}
              onClick={() => go(`ws:${workspace.id}`)}
              end={workspace.id === state.listedId ? <Icon name="check" size={18} /> : undefined}
              testId={`phone-manage-ws-${workspace.id}`}
            >
              <span className="ws-logo s">
                {workspace.logoUrl ? (
                  <img src={workspace.logoUrl} alt="" />
                ) : (
                  initials(workspace.name)
                )}
              </span>
              <T>
                {workspace.name}
                <small>
                  {`${PLAN_NAMES[workspace.plan]} · ${t('boards.count', { count: workspace.boardCount })} · ${t(ROLE_KEYS[workspace.role])}`}
                </small>
              </T>
            </Row>
          ))}
        </div>
        <Hint>{t('manage.onlyOwnerDeletes')}</Hint>
      </>
    );
  }

  return (
    <ShortSheet
      title={title}
      sub={sub}
      theme={theme}
      page={page}
      onBack={back}
      onClose={state.endManage}
      testId="phone-manage"
    >
      {body}
    </ShortSheet>
  );
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

function WorkspacePage({
  workspace,
  current,
  error,
  onRename,
  onBoards,
  onSwitch,
  onDelete,
}: {
  workspace: WorkspaceSummary;
  current: boolean;
  error: string | null;
  onRename: (name: string) => void;
  onBoards: () => void;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(workspace.name);
  // Mirrors the routes: an admin may rename, only the owner may delete.
  const canRename = workspace.role === 'owner' || workspace.role === 'admin';
  const canDelete = workspace.role === 'owner';
  const save = () => {
    const name = draft.trim();
    if (!name) setDraft(workspace.name);
    else if (name !== workspace.name) onRename(name);
  };

  return (
    <>
      <div className="st-hero" style={{ padding: '0 0 14px' }}>
        <span className="ws-logo" style={{ margin: '0 auto' }}>
          {workspace.logoUrl ? (
            <img src={workspace.logoUrl} alt="" />
          ) : (
            initials(draft || workspace.name)
          )}
        </span>
      </div>
      <Group noIcons>
        <label className="st-r st-field">
          <span className="t">{t('workspace.name')}</span>
          <input
            value={draft}
            maxLength={60}
            autoComplete="off"
            readOnly={!canRename}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
            data-testid="phone-manage-ws-name"
          />
        </label>
        <Row onClick={onBoards} end={String(workspace.boardCount)}>
          <T>{t('boards.title')}</T>
        </Row>
      </Group>
      {error && <Hint error>{error}</Hint>}
      {!current && (
        <div className="st-g" style={{ marginTop: 16 }}>
          <Row onClick={onSwitch} testId="phone-manage-switch">
            <Tile name="home" color="#0a84ff" />
            <T>{t('ps.manage.switch')}</T>
          </Row>
        </div>
      )}
      {canDelete && (
        <>
          <div className="st-g" style={{ marginTop: 20 }}>
            <Row red chevron={false} onClick={onDelete} testId="phone-manage-delete">
              {t('manage.deleteWorkspace')}
            </Row>
          </div>
          <Hint>{t('ps.manage.deleteHint', { count: workspace.boardCount })}</Hint>
        </>
      )}
    </>
  );
}
