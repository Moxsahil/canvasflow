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
  DropdownMenuSeparator,
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

        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={4}
          container={portalContainer}
          className="min-w-56 rounded-lg"
        >
          {/* The same block the trigger shows: an open menu should never make
              you wonder which account it belongs to. */}
          <DropdownMenuLabel className="p-0 font-normal">
            <span className="flex items-center gap-2 px-1 py-1.5 text-sm">
              <Identity name={name} email={email} />
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(['profile', 'signOut'] as const).map((id) => {
            const { label, icon: Icon } = MENU_ITEMS[id];
            const action = actions?.[id];
            return (
              <DropdownMenuItem
                key={id}
                disabled={!action}
                onSelect={action}
                data-testid={`menu-item-${id}`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
                {!action && <span className="ml-auto text-xs opacity-60">Soon</span>}
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
