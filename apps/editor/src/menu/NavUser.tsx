import { Fragment } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import {
  identityDetailClasses,
  identityRowClasses,
  InitialBadge,
} from '@/components/ui/initial-badge';
import {
  InlineDropdownMenu,
  InlineDropdownMenuBadge,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuLabel,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuSub,
  InlineDropdownMenuSubContent,
  InlineDropdownMenuSubTrigger,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { ariaKeyShortcut } from '../help/platform';
import { env } from '../lib/env';
import {
  CURRENT_LANGUAGE,
  LANGUAGES,
  LEARN_MORE_GROUPS,
  MENU_ITEMS,
  type LearnMoreItem,
  type MenuActions,
  type MenuItemId,
} from './menu-items';

export interface SidebarUser {
  name: string;
  email: string | null;
  /** Shown under the name in place of the address once they have one. */
  username?: string | null;
  /** Their photo, already resolved to a URL this browser may load. */
  avatarUrl?: string | null;
}

interface NavUserProps {
  /** Null before the token decodes, and for anyone the token doesn't name. */
  user: SidebarUser | null;
  actions?: MenuActions;
  portalContainer: HTMLElement | null;
}

/**
 * The account at the foot of the sidebar: who you are, and what you can do
 * about it. Two lines of identity, so the row says which account this is
 * rather than only that there is one.
 */
export function NavUser({ user, actions, portalContainer }: NavUserProps) {
  const name = user?.name?.trim() || 'Account';
  const email = user?.email ?? null;
  // The username is what collaborators find you by, so it is the second line
  // once there is one; the address is still in the menu's caption above.
  const detail = user?.username ? `@${user.username}` : email;

  return (
    <SidebarMenuItem>
      <InlineDropdownMenu>
        <InlineDropdownMenuTrigger
          title={name}
          aria-label={`${name} — account actions`}
          data-testid="menu-account"
          className={identityRowClasses}
        >
          <Identity
            name={name}
            detail={detail}
            avatarUrl={user?.avatarUrl ?? null}
            className={identityDetailClasses}
          />
          <ChevronsUpDown className={cn('ml-auto size-4 shrink-0', identityDetailClasses)} />
        </InlineDropdownMenuTrigger>

        {/* Opens straight up the sidebar rather than out over the canvas: the
            account row is the last thing in the rail, so there is room above it
            and none below, and a menu that leaves the sidebar reads as
            belonging to the board instead of to the account.

            It takes the trigger's width so the two line up as one column, with
            a floor for the collapsed rail, where the trigger is icon-sized. */}
        <InlineDropdownMenuContent
          side="top"
          align="start"
          sideOffset={4}
          container={portalContainer}
          className="w-(--radix-dropdown-menu-trigger-width) max-w-none min-w-56"
        >
          {/* The address alone, and no rule under it. The trigger directly
              below already shows the avatar and the name, so repeating them
              here says nothing — the address is the one part of the identity
              the rail does not have room for. It reads as a caption over the
              items rather than as a row of its own, which is why it is quiet
              and unseparated. */}
          <InlineDropdownMenuLabel>{email ?? name}</InlineDropdownMenuLabel>
          <AccountRow id="settings" actions={actions} />

          {/* Both open beside the menu, out over the canvas: up the rail there
              is only the menu itself, and below it nothing at all. */}
          <InlineDropdownMenuSub>
            <InlineDropdownMenuSubTrigger data-testid="menu-item-language">
              Language
            </InlineDropdownMenuSubTrigger>
            <InlineDropdownMenuSubContent container={portalContainer} collisionPadding={8}>
              {LANGUAGES.map((language) => {
                const current = language.code === CURRENT_LANGUAGE;
                return (
                  <InlineDropdownMenuItem
                    key={language.code}
                    // Nothing to switch to until the app is translated, and
                    // choosing the language already on is no choice at all.
                    disabled
                    lang={language.code}
                    icon={current ? <Check aria-hidden="true" /> : undefined}
                    badge={current ? null : <Soon />}
                    data-testid={`menu-language-${language.code}`}
                  >
                    {language.label}
                    {current && <span className="sr-only"> (current language)</span>}
                  </InlineDropdownMenuItem>
                );
              })}
            </InlineDropdownMenuSubContent>
          </InlineDropdownMenuSub>

          <InlineDropdownMenuSub>
            <InlineDropdownMenuSubTrigger data-testid="menu-item-learnMore">
              Learn more
            </InlineDropdownMenuSubTrigger>
            <InlineDropdownMenuSubContent container={portalContainer} collisionPadding={8}>
              {LEARN_MORE_GROUPS.map((group, index) => (
                <Fragment key={index}>
                  {index > 0 && <InlineDropdownMenuSeparator />}
                  {group.map((item) => (
                    <LearnMoreRow key={item.id} item={item} actions={actions} />
                  ))}
                </Fragment>
              ))}
            </InlineDropdownMenuSubContent>
          </InlineDropdownMenuSub>

          <InlineDropdownMenuSeparator />
          <AccountRow id="signOut" actions={actions} />
        </InlineDropdownMenuContent>
      </InlineDropdownMenu>
    </SidebarMenuItem>
  );
}

function Soon() {
  return <InlineDropdownMenuBadge>Soon</InlineDropdownMenuBadge>;
}

/** A row the sidebar's vocabulary already names, live exactly when it has a handler. */
function AccountRow({ id, actions }: { id: MenuItemId; actions?: MenuActions }) {
  const { label, icon: Icon, destructive } = MENU_ITEMS[id];
  const action = actions?.[id];
  return (
    <InlineDropdownMenuItem
      disabled={!action}
      className={cn(destructive && menuDangerRowClasses)}
      onSelect={action ?? undefined}
      icon={<Icon aria-hidden="true" />}
      // Only an unbuilt feature is "Soon" — see MenuActions.
      badge={action === undefined ? <Soon /> : null}
      data-testid={`menu-item-${id}`}
    >
      {label}
    </InlineDropdownMenuItem>
  );
}

/**
 * A page of the web app, opened in a new tab so the board stays where it is,
 * or one of the menu's own actions. Either may not exist yet, and reads
 * "Soon" until it does.
 */
function LearnMoreRow({ item, actions }: { item: LearnMoreItem; actions?: MenuActions }) {
  const { label, icon: Icon, path, action: actionId } = item;

  let run: (() => void) | null | undefined;
  if (actionId) {
    run = actions?.[actionId];
  } else if (path) {
    const href = new URL(path, env.VITE_WEB_URL).toString();
    run = () => window.open(href, '_blank', 'noopener,noreferrer');
  }

  const shortcut = actionId ? MENU_ITEMS[actionId].shortcut : undefined;

  return (
    <InlineDropdownMenuItem
      disabled={!run}
      onSelect={run ?? undefined}
      icon={Icon && <Icon aria-hidden="true" />}
      badge={run === undefined ? <Soon /> : null}
      aria-keyshortcuts={run && shortcut ? ariaKeyShortcut(shortcut) : undefined}
      data-testid={`menu-learn-${item.id}`}
    >
      {label}
      {path && <span className="sr-only"> (opens in a new tab)</span>}
    </InlineDropdownMenuItem>
  );
}

function Identity({
  name,
  detail,
  avatarUrl,
  className,
}: {
  name: string;
  /** The line under the name: their username, else their address. */
  detail: string | null;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <>
      {/* A person, so: a circle, two letters, and the quiet fill — the board
          and workspace rows above keep the square accent badge. */}
      <InitialBadge label={name} src={avatarUrl} person />
      <span className={cn('grid min-w-0 flex-1 text-left text-sm leading-tight', className)}>
        <span className="truncate font-medium">{name}</span>
        {detail && <span className="truncate text-xs opacity-70">{detail}</span>}
      </span>
    </>
  );
}
