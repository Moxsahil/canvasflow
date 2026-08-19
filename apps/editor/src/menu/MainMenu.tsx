import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatShortcut } from '../help/platform';
import type { ThemePreference } from '../theme';
import { CanvasBackgroundControl } from './CanvasBackgroundControl';
import { MenuRailItem } from './MenuRailItem';
import { ThemeControl } from './ThemeControl';
import {
  ACCOUNT_MENU_GROUPS,
  MENU_ITEMS,
  RAIL_GROUPS,
  type MenuActions,
  type MenuItemId,
} from './menu-items';
import {
  RAIL_WIDTH_COLLAPSED,
  railContentVariants,
  railLabelVariants,
  railTransition,
  railVariants,
} from './menu-motion';

interface MainMenuProps {
  /** Shown next to the board badge once the rail is open. */
  boardName: string;
  /** Signed-in user, for the account row. Falls back to a generic label. */
  userLabel?: string | null;
  canvasBackground: string;
  onCanvasBackgroundChange: (color: string) => void;
  /** Theme preference, including `system` — see theme/useAppTheme. */
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  /** Only the items with a handler here are usable; the rest read as "Soon". */
  actions?: MenuActions;
}

/**
 * The editor's main menu: a collapsed icon rail pinned to the left edge that
 * expands on hover (or on keyboard focus) to show labels, grouped the way a
 * canvas app's menu is — board/file actions, canvas actions, help, then
 * appearance and account at the bottom.
 *
 * The rail stays expanded while one of its popups is open, because Radix
 * portals popup content out of the rail's subtree, so opening one would
 * otherwise fire mouseleave and collapse the rail out from under the pointer.
 */
export function MainMenu({
  boardName,
  userLabel,
  canvasBackground,
  onCanvasBackgroundChange,
  theme,
  onThemeChange,
  actions,
}: MainMenuProps) {
  const railRef = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [openPopups, setOpenPopups] = useState(0);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Popups portal into the editor root rather than <body>: every colour in
  // them is a token declared on .cf-editor, so a body-level popup would paint
  // with unresolved var()s (and would ignore the dark theme).
  useEffect(() => {
    setPortalContainer(railRef.current?.closest<HTMLElement>('.cf-editor') ?? null);
  }, []);

  const trackPopup = useCallback((open: boolean) => {
    setOpenPopups((count) => Math.max(0, count + (open ? 1 : -1)));
  }, []);

  const expanded = hovered || focusWithin || openPopups > 0;
  const boardInitial = boardName.trim().charAt(0).toUpperCase() || 'B';
  const accountLabel = userLabel?.trim() || 'Account';

  return (
    <motion.nav
      ref={railRef}
      aria-label="Main menu"
      initial={false}
      animate={expanded ? 'open' : 'closed'}
      variants={railVariants}
      transition={railTransition}
      style={{ width: RAIL_WIDTH_COLLAPSED }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      // Only collapse when focus actually leaves the rail — React's onBlur also
      // fires when focus moves between two rows inside it.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
      className="absolute left-0 top-0 z-(--zIndex-layerUI) flex h-full flex-col overflow-hidden border-r border-(--default-border-color) bg-(--island-bg-color) text-(--text-primary-color)"
    >
      <motion.div variants={railContentVariants} className="flex h-full flex-col">
        {/* Board identity. Not a menu: its actions are rows in the rail, where
            they can be seen without first clicking a board id. */}
        <div
          className="flex h-[54px] shrink-0 items-center border-b border-(--default-border-color) p-2"
          title={boardName}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center">
            <Avatar className="h-5 w-5 rounded-(--border-radius-md)">
              <AvatarFallback>{boardInitial}</AvatarFallback>
            </Avatar>
          </span>
          <motion.span
            variants={railLabelVariants}
            aria-hidden="true"
            className="flex min-w-0 flex-1 items-center pr-2"
          >
            <span className="truncate text-sm font-medium">{boardName}</span>
          </motion.span>
        </div>

        <ScrollArea className="min-h-0 flex-1 p-2">
          {RAIL_GROUPS.map((group, index) => (
            <Fragment key={group.join('-')}>
              {index > 0 && <Separator className="my-1" />}
              <ul className="flex flex-col gap-1">
                {group.map((id) => (
                  <MenuRailItem key={id} meta={MENU_ITEMS[id]} onSelect={actions?.[id]} />
                ))}
              </ul>
            </Fragment>
          ))}
        </ScrollArea>

        {/* Appearance and account, mirroring where a canvas app keeps them. */}
        <ul className="flex flex-col gap-1 border-t border-(--default-border-color) p-2">
          <CanvasBackgroundControl
            value={canvasBackground}
            onChange={onCanvasBackgroundChange}
            expanded={expanded}
            portalContainer={portalContainer}
            onOpenChange={trackPopup}
          />
          <ThemeControl
            value={theme}
            onChange={onThemeChange}
            expanded={expanded}
            portalContainer={portalContainer}
            onOpenChange={trackPopup}
          />
          <MenuRailItem meta={MENU_ITEMS.preferences} onSelect={actions?.preferences} />
          <li>
            <DropdownMenu onOpenChange={trackPopup}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={`${accountLabel} — account actions`}
                  aria-label={`${accountLabel} — account actions`}
                  data-testid="menu-account"
                  className="flex h-8 w-full items-center overflow-hidden rounded-(--border-radius-md) transition-colors hover:bg-(--button-hover-bg) focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)]"
                >
                  <span className="flex w-8 shrink-0 items-center justify-center">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback>{accountLabel.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </span>
                  <motion.span
                    variants={railLabelVariants}
                    aria-hidden="true"
                    className="flex min-w-0 flex-1 items-center gap-1 pr-2"
                  >
                    <span className="truncate text-sm font-medium">{accountLabel}</span>
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-(--keybinding-color)" />
                  </motion.span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" container={portalContainer}>
                <MenuDropdownGroups groups={ACCOUNT_MENU_GROUPS} actions={actions} />
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </motion.div>
    </motion.nav>
  );
}

interface MenuDropdownGroupsProps {
  groups: readonly (readonly MenuItemId[])[];
  actions?: MenuActions;
}

/** The same registry entries the rail uses, rendered as popup rows. */
function MenuDropdownGroups({ groups, actions }: MenuDropdownGroupsProps) {
  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group.join('-')}>
          {index > 0 && <DropdownMenuSeparator />}
          {group.map((id) => {
            const { label, icon: Icon, shortcut, destructive } = MENU_ITEMS[id];
            const action = actions?.[id];
            return (
              <DropdownMenuItem
                key={id}
                disabled={!action}
                onSelect={action}
                data-testid={`menu-item-${id}`}
                className={cn(destructive && 'text-(--color-danger)')}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
                {action ? (
                  shortcut && (
                    <DropdownMenuShortcut>{formatShortcut(shortcut)}</DropdownMenuShortcut>
                  )
                ) : (
                  <Badge variant="outline" className="ml-auto">
                    Soon
                  </Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}
