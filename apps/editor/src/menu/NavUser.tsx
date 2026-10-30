import { Fragment, type ReactNode } from 'react';
import { PLAN_NAMES, type WorkspacePlan } from '@canvasflow/types';
import { Check, ChevronsUpDown, Monitor, Moon, Sun, UserRound } from 'lucide-react';
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
  InlineDropdownMenuChoiceItem,
  InlineDropdownMenuRadioGroup,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuSub,
  InlineDropdownMenuSubContent,
  InlineDropdownMenuSubTrigger,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { ariaKeyShortcut, formatShortcut } from '../help/platform';
import { env } from '../lib/env';
import { isTestLocale, listedLanguages, useI18n, useT, type TranslationKey } from '../i18n';
import { PreferencesMenu } from '../preferences/PreferencesMenu';
import type { PreferencesState } from '../preferences/usePreferences';
import type { ThemePreference } from '../theme';
import {
  liveAction,
  LEARN_MORE_GROUPS,
  MENU_ITEMS,
  type LearnMoreItem,
  type MenuActions,
  type MenuItemId,
} from './menu-items';

const THEME_OPTIONS = [
  { value: 'system', labelKey: 'theme.system', icon: Monitor },
  { value: 'light', labelKey: 'theme.light', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
] as const satisfies ReadonlyArray<{
  value: ThemePreference;
  labelKey: TranslationKey;
  icon: unknown;
}>;

export interface SidebarUser {
  name: string;
  email: string | null;
  /** Shown under the name in place of the address once they have one. */
  username?: string | null;
  /** Their photo, already resolved to a URL this browser may load. */
  avatarUrl?: string | null;
}

interface NavUserProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  preferences: PreferencesState;
  /** Null before the token decodes, and for anyone the token doesn't name. */
  user: SidebarUser | null;
  actions?: MenuActions;
  portalContainer: HTMLElement | null;
  /** The plan of the workspace the sidebar is showing, beside the name. */
  plan?: WorkspacePlan | null;
}

/**
 * The account at the foot of the sidebar: who you are, and what you can do
 * about it. Two lines of identity, so the row says which account this is
 * rather than only that there is one.
 *
 * On the board kept in this browser there is no account in it. The row says
 * so, and offers one — or, to someone already signed in, their own boards.
 */
export function NavUser({
  user,
  actions,
  theme,
  onThemeChange,
  preferences,
  portalContainer,
  plan = null,
}: NavUserProps) {
  const t = useT();
  const toBoards = typeof actions?.yourBoards === 'function';
  const accountless = !user && (toBoards || typeof actions?.signIn === 'function');
  const name = accountless
    ? t(toBoards ? 'local.account.signedIn' : 'local.account.notSignedIn')
    : user?.name?.trim() || t('menu.account');
  const email = user?.email ?? null;
  // The username is what collaborators find you by, so it is the second line
  // once there is one; the address is still in the menu's caption above.
  const detail = accountless
    ? t(toBoards ? 'local.account.toBoards' : 'local.account.offer')
    : user?.username
      ? `@${user.username}`
      : email;

  return (
    <SidebarMenuItem>
      <InlineDropdownMenu>
        <InlineDropdownMenuTrigger
          title={name}
          aria-label={t('menu.accountActions', { name })}
          data-testid="menu-account"
          className={identityRowClasses}
        >
          <Identity
            name={name}
            plan={null}
            detail={accountless ? detail : null}
            avatarUrl={user?.avatarUrl ?? null}
            // No name to take letters from: "Not signed in" is not one.
            icon={accountless ? <UserRound className="size-4" aria-hidden="true" /> : undefined}
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
          <div className="flex w-full items-center gap-2 px-2 py-1.5">
            <InitialBadge label={name} src={user?.avatarUrl ?? null} person />
            <div className="grid min-w-0 leading-tight">
              <span className="truncate text-xs font-medium">{name}</span>
              <span className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                {plan ? t('billing.planTitle', { plan: PLAN_NAMES[plan] }) : (email ?? '')}
              </span>
            </div>
          </div>
          <InlineDropdownMenuSeparator />
          {!accountless ? (
            <AccountRow id="settings" actions={actions} />
          ) : toBoards ? (
            <AccountRow id="yourBoards" actions={actions} />
          ) : (
            <>
              <AccountRow id="signIn" actions={actions} />
              <AccountRow id="signUp" actions={actions} />
            </>
          )}

          {/* These open beside the menu, out over the canvas: up the rail there
              is only the menu itself, and below it nothing at all. */}
          <PreferencesMenu preferences={preferences} portalContainer={portalContainer} />
          <ThemeSub value={theme} onChange={onThemeChange} portalContainer={portalContainer} />
          <LanguageSub portalContainer={portalContainer} />

          <InlineDropdownMenuSub>
            <InlineDropdownMenuSubTrigger data-testid="menu-item-learnMore">
              {t('menu.learnMore')}
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

          {!accountless && (
            <>
              <InlineDropdownMenuSeparator />
              <AccountRow id="signOut" actions={actions} />
            </>
          )}
        </InlineDropdownMenuContent>
      </InlineDropdownMenu>
    </SidebarMenuItem>
  );
}

/** The theme: three choices, of which one is always in effect. */
function ThemeSub({
  value,
  onChange,
  portalContainer,
}: {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
  portalContainer: HTMLElement | null;
}) {
  const t = useT();
  return (
    <InlineDropdownMenuSub>
      <InlineDropdownMenuSubTrigger
        data-testid="menu-item-theme"
        title={t('theme.toggleHint', { shortcut: formatShortcut('alt+shift+d') })}
      >
        {t('theme.title')}
      </InlineDropdownMenuSubTrigger>
      <InlineDropdownMenuSubContent container={portalContainer} collisionPadding={8}>
        <InlineDropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as ThemePreference)}
        >
          {THEME_OPTIONS.map(({ value: option, labelKey, icon: Icon }) => (
            <InlineDropdownMenuChoiceItem
              key={option}
              value={option}
              icon={<Icon aria-hidden="true" />}
              data-testid={`menu-theme-${option}`}
            >
              {t(labelKey)}
            </InlineDropdownMenuChoiceItem>
          ))}
        </InlineDropdownMenuRadioGroup>
      </InlineDropdownMenuSubContent>
    </InlineDropdownMenuSub>
  );
}

/**
 * Every language the app is meant to come in. Those with words to show can be
 * switched to; the rest read "Soon" until they are translated.
 */
function LanguageSub({ portalContainer }: { portalContainer: HTMLElement | null }) {
  const { locale, available, setLocale, t } = useI18n();
  return (
    <InlineDropdownMenuSub>
      <InlineDropdownMenuSubTrigger data-testid="menu-item-language">
        {t('menu.language')}
        <span className="ml-auto pl-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          {listedLanguages().find((language) => language.code === locale)?.label}
        </span>
      </InlineDropdownMenuSubTrigger>
      <InlineDropdownMenuSubContent container={portalContainer} collisionPadding={8}>
        {listedLanguages().map((language) => {
          const current = language.code === locale;
          const ready = available.includes(language.code);
          return (
            <InlineDropdownMenuItem
              key={language.code}
              // Choosing the language already on is no choice at all.
              disabled={current || !ready}
              onSelect={() => setLocale(language.code)}
              // The test languages are labelled in English.
              lang={isTestLocale(language.code) ? 'en' : language.code}
              icon={current ? <Check aria-hidden="true" /> : undefined}
              badge={current || ready ? null : <Soon />}
              data-testid={`menu-language-${language.code}`}
            >
              {language.label}
              {current && <span className="sr-only"> {t('menu.language.current')}</span>}
            </InlineDropdownMenuItem>
          );
        })}
      </InlineDropdownMenuSubContent>
    </InlineDropdownMenuSub>
  );
}

function Soon() {
  const t = useT();
  return <InlineDropdownMenuBadge>{t('common.soon')}</InlineDropdownMenuBadge>;
}

/** A row the sidebar's vocabulary already names, live exactly when it has a handler. */
function AccountRow({ id, actions }: { id: MenuItemId; actions?: MenuActions }) {
  const t = useT();
  const { labelKey, icon: Icon, destructive } = MENU_ITEMS[id];
  const action = liveAction(actions?.[id]);
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
      {t(labelKey)}
    </InlineDropdownMenuItem>
  );
}

/**
 * A page of the web app, opened in a new tab so the board stays where it is,
 * or one of the menu's own actions. Either may not exist yet, and reads
 * "Soon" until it does.
 */
function LearnMoreRow({ item, actions }: { item: LearnMoreItem; actions?: MenuActions }) {
  const t = useT();
  const { labelKey, icon: Icon, path, action: actionId } = item;

  let run: (() => void) | null | undefined;
  if (actionId) {
    run = liveAction(actions?.[actionId]);
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
      {t(labelKey)}
      {path && <span className="sr-only"> {t('common.opensInNewTab')}</span>}
    </InlineDropdownMenuItem>
  );
}

function Identity({
  name,
  plan = null,
  detail,
  avatarUrl,
  icon,
  className,
}: {
  name: string;
  /** A pill between the name and the chevron: coloured once paid for, outlined on Free. */
  plan?: WorkspacePlan | null;
  /** The line under the name: their username, else their address. */
  detail: string | null;
  avatarUrl?: string | null;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <>
      {/* A person, so: a circle, two letters, and the quiet fill — the board
          and workspace rows above keep the square accent badge. */}
      <InitialBadge label={name} src={avatarUrl} icon={icon} person />
      <span
        className={cn(
          'grid min-w-0 text-left text-sm leading-tight',
          plan ? 'shrink' : 'flex-1',
          className,
        )}
      >
        <span className="truncate font-medium">{name}</span>
        {detail && <span className="truncate text-xs opacity-70">{detail}</span>}
      </span>
      {/* The plan, centred in the space between the name and the chevron: in
          the accent once paid for, quiet on Free. */}
      {plan && (
        <span className={cn('flex min-w-fit flex-1 justify-center', className)}>
          <span
            data-testid="account-plan"
            className={cn(
              'rounded-full px-1.5 text-[10px] leading-4 font-medium',
              plan === 'free'
                ? 'border border-sidebar-border text-sidebar-foreground/70'
                : 'bg-sidebar-primary text-sidebar-primary-foreground',
            )}
          >
            {PLAN_NAMES[plan]}
          </span>
        </span>
      )}
    </>
  );
}
