import { Fragment, useMemo, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuBadge,
  ContextMenuChoiceItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuToggleItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import { ariaKeyShortcut } from '../help/platform';
import { BoardTitle } from '../workspace/board-presentation';
import type { WorkspaceBoards } from '../workspace/useBoardSwitcher';
import {
  CONTEXT_MENU_ITEMS,
  contextMenuFor,
  type ContextMenuActions,
  type ContextMenuChecks,
  type ContextMenuItemId,
  type ContextMenuTarget,
  type ContextSubmenu,
} from './context-menu-items';

/**
 * The boards Move to lists: every one in this board's workspace, as the board
 * switcher already has them.
 */
export interface MoveToBoards {
  /** Captions the list. Null until the workspace list has loaded. */
  workspaceName: string | null;
  /** Listed with the rest, but disabled — a board cannot be moved into itself. */
  currentBoardId: string;
  /** Undefined until the switcher has asked for them. */
  boards: WorkspaceBoards | undefined;
  /**
   * Moves the selection to another board. Absent until that is built, and the
   * rows read "Soon" meanwhile.
   */
  onMove?: (boardId: string) => void;
}

interface CanvasContextMenuProps {
  /** What the right-click landed on, settled on the press — see `contextPressAt`. */
  target: ContextMenuTarget;
  /** Takes every row that edits the board out of the menu. */
  readOnly: boolean;
  actions: ContextMenuActions;
  checks: ContextMenuChecks;
  /**
   * A row's label where it depends on what is selected — Add link reads Edit
   * link on a shape that has one. Rows not named here keep their own.
   */
  labels?: Partial<Record<ContextMenuItemId, string>>;
  /**
   * The menu closing, about to hand focus back to where it came from. Default
   * prevented by a row that opened a field and wants the cursor in it.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /** Null for someone with no workspace to list, a share-link guest. */
  moveTo: MoveToBoards | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The editor root, whose theme the popup paints with. */
  container: HTMLElement | null;
  /** The surface a right-click opens the menu on. Must take a ref and props. */
  children: ReactNode;
}

/**
 * The menu a right-click on the board opens: one for a selection, another for
 * empty board.
 */
export function CanvasContextMenu({
  target,
  readOnly,
  actions,
  checks,
  labels,
  onCloseAutoFocus,
  moveTo,
  open,
  onOpenChange,
  container,
  children,
}: CanvasContextMenuProps) {
  const groups = useMemo(() => contextMenuFor(target, { readOnly }), [target, readOnly]);

  return (
    <ContextMenu open={open} onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        container={container}
        collisionPadding={8}
        loop
        onCloseAutoFocus={onCloseAutoFocus}
        aria-label={target === 'selection' ? 'Selection' : 'Canvas'}
        data-testid={`context-menu-${target}`}
      >
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 && <ContextMenuSeparator />}
            {group.map((entry) =>
              typeof entry === 'string' ? (
                <Row
                  key={entry}
                  id={entry}
                  actions={actions}
                  checks={checks}
                  label={labels?.[entry]}
                />
              ) : (
                <Submenu
                  key={entry.submenu}
                  submenu={entry}
                  actions={actions}
                  checks={checks}
                  moveTo={moveTo}
                  container={container}
                />
              ),
            )}
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function Soon() {
  return <ContextMenuBadge>Soon</ContextMenuBadge>;
}

interface RowProps {
  id: ContextMenuItemId;
  actions: ContextMenuActions;
  checks: ContextMenuChecks;
  /** In place of the row's own label. */
  label?: string;
}

function Row({ id, actions, checks, label: labelOverride }: RowProps) {
  const meta = CONTEXT_MENU_ITEMS[id];
  const { icon: Icon, shortcut, destructive, toggle, choice, hint } = meta;
  const label = labelOverride ?? meta.label;
  const action = actions[id];
  // Only an unbuilt row says "Soon". A built one that does not apply to what
  // is selected is disabled and says nothing, so it never reads as missing.
  const badge = action === undefined ? <Soon /> : null;
  const keyshortcuts = action && shortcut ? ariaKeyShortcut(shortcut) : undefined;

  // Picked through the radio group around it, which runs the action.
  if (choice) {
    return (
      <ContextMenuChoiceItem
        value={id}
        icon={Icon && <Icon />}
        disabled={!action}
        title={hint}
        data-testid={`context-menu-${id}`}
      >
        {label}
      </ContextMenuChoiceItem>
    );
  }

  if (toggle) {
    return (
      <ContextMenuToggleItem
        checked={checks[id] ?? false}
        disabled={!action}
        onToggle={action ?? undefined}
        badge={badge}
        aria-keyshortcuts={keyshortcuts}
        data-testid={`context-menu-${id}`}
      >
        {label}
      </ContextMenuToggleItem>
    );
  }

  return (
    <ContextMenuItem
      disabled={!action}
      onSelect={action ?? undefined}
      className={destructive ? menuDangerRowClasses : undefined}
      icon={Icon && <Icon />}
      badge={badge}
      aria-keyshortcuts={keyshortcuts}
      data-testid={`context-menu-${id}`}
    >
      {label}
    </ContextMenuItem>
  );
}

function Submenu({
  submenu,
  actions,
  checks,
  moveTo,
  container,
}: {
  submenu: ContextSubmenu;
  actions: ContextMenuActions;
  checks: ContextMenuChecks;
  moveTo: MoveToBoards | null;
  container: HTMLElement | null;
}) {
  const rows = submenu.items.map((id) => (
    <Row key={id} id={id} actions={actions} checks={checks} />
  ));
  // A submenu of choices is one radio group: the row in effect is the one
  // ticked, and picking a row runs its action.
  const picksOne = submenu.items.some((id) => CONTEXT_MENU_ITEMS[id].choice);

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger data-testid={`context-menu-${submenu.submenu}`}>
        {submenu.label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent
        container={container}
        collisionPadding={8}
        loop
        className={submenu.compact ? 'min-w-36' : undefined}
      >
        {picksOne ? (
          <ContextMenuRadioGroup
            value={submenu.items.find((id) => checks[id]) ?? ''}
            onValueChange={(id) => actions[id as ContextMenuItemId]?.()}
          >
            {rows}
          </ContextMenuRadioGroup>
        ) : (
          rows
        )}
        {submenu.listsBoards && moveTo && <BoardRows moveTo={moveTo} />}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/**
 * The workspace's boards, under a caption naming it, each with its colour tag
 * before its name. The open board carries a tick at the end as well, as it
 * does in the board switcher.
 */
function BoardRows({ moveTo }: { moveTo: MoveToBoards }) {
  const { workspaceName, currentBoardId, boards, onMove } = moveTo;

  let rows: ReactNode;
  if (boards === undefined || boards.status === 'loading') {
    rows = <ContextMenuItem disabled>Loading boards…</ContextMenuItem>;
  } else if (boards.status === 'error') {
    rows = <ContextMenuItem disabled>Couldn’t load the boards</ContextMenuItem>;
  } else {
    rows = boards.boards.map((board) => {
      const current = board.id === currentBoardId;
      return (
        <ContextMenuItem
          key={board.id}
          disabled={current || !onMove}
          onSelect={onMove && !current ? () => onMove(board.id) : undefined}
          icon={current ? <Check /> : undefined}
          badge={current || onMove ? null : <Soon />}
          data-testid={`context-menu-board-${board.id}`}
        >
          <BoardTitle title={board.title} color={board.color} />
          {current && <span className="sr-only"> (current board)</span>}
        </ContextMenuItem>
      );
    });
  }

  return (
    <>
      <ContextMenuSeparator />
      {workspaceName && <ContextMenuLabel>{workspaceName}</ContextMenuLabel>}
      {rows}
    </>
  );
}
