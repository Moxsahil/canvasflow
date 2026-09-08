import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  identityDetailClasses,
  identityRowClasses,
  InitialBadge,
} from '@/components/ui/initial-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { MENU_ITEMS, type MenuActions } from './menu-items';

export interface SidebarUser {
  name: string;
  email: string | null;
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

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          title={name}
          aria-label={`${name} — account actions`}
          data-testid="menu-account"
          className={identityRowClasses}
        >
          <Identity name={name} email={email} className={identityDetailClasses} />
          <ChevronsUpDown className={cn('ml-auto size-4 shrink-0', identityDetailClasses)} />
        </DropdownMenuTrigger>

        {/* Opens straight up the sidebar rather than out over the canvas: the
            account row is the last thing in the rail, so there is room above it
            and none below, and a menu that leaves the sidebar reads as
            belonging to the board instead of to the account.

            It takes the trigger's width so the two line up as one column, with
            a floor for the collapsed rail, where the trigger is icon-sized. */}
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={4}
          container={portalContainer}
          className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        >
          {/* The address alone, and no rule under it. The trigger directly
              below already shows the avatar and the name, so repeating them
              here says nothing — the address is the one part of the identity
              the rail does not have room for. It reads as a caption over the
              items rather than as a row of its own, which is why it is quiet
              and unseparated. */}
          <DropdownMenuLabel className="truncate px-2 py-1.5 text-xs font-normal opacity-60">
            {email ?? name}
          </DropdownMenuLabel>
          {(['settings', 'signOut'] as const).map((id) => {
            const { label, icon: Icon } = MENU_ITEMS[id];
            const action = actions?.[id];
            return (
              <DropdownMenuItem
                key={id}
                disabled={!action}
                onSelect={action ?? undefined}
                data-testid={`menu-item-${id}`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
                {/* Only an unbuilt feature is "Soon" — see MenuActions. */}
                {action === undefined && <span className="ml-auto text-xs opacity-60">Soon</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function Identity({
  name,
  email,
  className,
}: {
  name: string;
  email: string | null;
  className?: string;
}) {
  return (
    <>
      <InitialBadge label={name} />
      <span className={cn('grid min-w-0 flex-1 text-left text-sm leading-tight', className)}>
        <span className="truncate font-medium">{name}</span>
        {email && <span className="truncate text-xs opacity-70">{email}</span>}
      </span>
    </>
  );
}
