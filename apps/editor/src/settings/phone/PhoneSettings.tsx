import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PRESENCE_PALETTE } from '@canvasflow/canvas-engine';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  PLAN_ALLOWANCES,
  PLAN_NAMES,
  PLAN_PRICES,
  can,
  formatPlanPrice,
  type CursorColor,
  type NotificationKind,
  type NotificationSettings,
  type WorkspacePlan,
} from '@canvasflow/types';
import { env } from '@/lib/env';
import { initialsOf } from '@/lib/initials';
import { privacyUrl, termsUrl } from '@/lib/legal-links';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import {
  cachedBilling,
  loadBilling,
  watchBilling,
  type BillingEntry,
} from '../../billing/billing-cache';
import { openBillingPortal } from '../../billing/billing-api';
import { fetchDiagramUsage } from '../../diagrams/diagram-client';
import { listedLanguages, useI18n, useT, type TranslationKey } from '../../i18n';
import type { PreferencesState } from '../../preferences/usePreferences';
import type { AvatarState, ProfileState } from '../../profile';
import { resendVerification } from '../../profile/verification-status';
import {
  ACCENTS,
  ACCENT_IDS,
  setAccent,
  setReduceMotion,
  useAccent,
  useReduceMotion,
} from '../../theme/accent';
import type { ResolvedTheme, ThemePreference } from '../../theme';
import type { SurfaceTheme } from '../../ui/surface-palette';
import { leaveWorkspace } from '../../workspace/people-api';
import { useWorkspacePeople } from '../../workspace/useWorkspacePeople';
import {
  AddPasswordDialog,
  ChangePasswordDialog,
  ConnectedAccountsDialog,
  SessionsDialog,
} from '../AccountDialogs';
import { formatStorageSize, providerNames } from '../account-format';
import {
  knownAccountSecurity,
  loadAccountSecurity,
  type AccountSecurity,
} from '../account-security-api';
import {
  fetchDeletionPreview,
  type DeletionInput,
  type DeletionPreview,
} from '../account-deletion-api';
import { DeleteAccountDialog } from '../DeleteAccountDialog';
import { CURSOR_COLOUR_NAMES } from '../ProfilePane';
import type { OpenBoard } from '../export-boards';
import {
  knownNotificationSettings,
  loadNotificationSettings,
  saveNotificationSettings,
} from '../notifications-api';
import { PhotoDialog } from '../PhotoDialog';
import { useBoardsExport, useStorageUsage } from '../PrivacyPane';
import { settingsAddress } from '../settings-link';
import type { SettingsSectionId } from '../settings-sections';
import { ConfirmDialog, HandOverDialog, MembersDialog } from '../WorkspaceDialogs';
import type { WorkspaceSettingsSource } from '../WorkspacePane';
import { Icon, Tile } from './icons';
import './phone-settings.css';

type Page =
  | 'root'
  | 'account'
  | 'appearance'
  | 'language'
  | 'workspace'
  | 'notifications'
  | 'billing'
  | 'privacy';

const PAGE_TITLES: Record<Page, TranslationKey> = {
  root: 'menu.settings',
  account: 'ps.page.account',
  appearance: 'ps.page.appearance',
  language: 'menu.language',
  workspace: 'ps.page.workspace',
  notifications: 'ps.page.notifications',
  billing: 'ps.page.billing',
  privacy: 'ps.page.privacy',
};

const SECTION_PAGES: Record<SettingsSectionId, Page> = {
  profile: 'account',
  account: 'account',
  workspace: 'workspace',
  notifications: 'notifications',
  billing: 'billing',
  privacy: 'privacy',
};

/** What search finds: a label, the page it is on, and words it answers to. */
const SEARCH_INDEX: readonly [TranslationKey, Page | '@shortcuts', TranslationKey][] = [
  ['ps.page.account', 'account', 'ps.find.account'],
  ['ps.page.appearance', 'appearance', 'ps.find.appearance'],
  ['settings.row.cursor-colour', 'account', 'ps.find.cursor'],
  ['ps.accent', 'appearance', 'ps.find.accent'],
  ['ps.reduceMotion', 'appearance', 'ps.find.motion'],
  ['menu.language', 'language', 'ps.find.language'],
  ['ps.page.workspace', 'workspace', 'ps.find.workspace'],
  ['ps.invite', 'workspace', 'ps.find.invite'],
  ['ps.page.notifications', 'notifications', 'ps.find.notifications'],
  ['ps.page.billing', 'billing', 'ps.find.billing'],
  ['ps.page.privacy', 'privacy', 'ps.find.privacy'],
  ['ps.exportAll', 'privacy', 'ps.find.export'],
  ['ps.deleteAccount', 'account', 'ps.find.delete'],
  ['ps.shortcuts', '@shortcuts', 'ps.find.shortcuts'],
];

const ACCENT_LABELS: Record<(typeof ACCENT_IDS)[number], TranslationKey> = {
  blue: 'ps.accent.blue',
  violet: 'ps.accent.violet',
  green: 'ps.accent.green',
  orange: 'ps.accent.orange',
  pink: 'ps.accent.pink',
  slate: 'ps.accent.slate',
};

const ROLE_LABELS: Record<'owner' | 'admin' | 'member', TranslationKey> = {
  owner: 'ps.role.owner',
  admin: 'ps.role.admin',
  member: 'ps.role.member',
};

/** How far the sheet is pulled down, in CSS pixels, before letting go closes it. */
const DISMISS_DRAG = 120;

type Dialog =
  | { kind: 'photo'; file: File }
  | { kind: 'password' }
  | { kind: 'addPassword' }
  | { kind: 'accounts' }
  | { kind: 'sessions' }
  | { kind: 'delete' }
  | { kind: 'members' }
  | { kind: 'leave' }
  | { kind: 'handover' }
  | null;

export interface PhoneSettingsProps {
  user: { name: string; email: string | null } | null;
  token: string | null;
  account: ProfileState;
  avatar: AvatarState;
  /** The theme on screen now, for the sheet's own light and dark. */
  theme: SurfaceTheme;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  onThemeChange: (theme: ThemePreference) => void;
  preferences: PreferencesState;
  userId?: string | null;
  isGuest?: boolean;
  resumeDeletion?: boolean;
  initialSection?: SettingsSectionId;
  deleteAccount?: (input: DeletionInput) => Promise<void>;
  workspace?: WorkspaceSettingsSource;
  renameWorkspace?: (workspaceId: string, name: string) => Promise<void>;
  upgradeWorkspace?: (workspaceId: string) => void;
  openBoard?: OpenBoard | null;
  analytics?: boolean | null;
  chooseAnalytics?: (allow: boolean) => Promise<boolean>;
  /** The open board, which the AI diagrams count is read against. */
  boardId: string;
  onSignOut?: () => void;
  onShowShortcuts?: () => void;
  onClose: () => void;
  container: HTMLElement | null;
}

/**
 * Settings on a phone: a sheet that rises to nearly the top of the screen,
 * with a page for each part of the account, the workspace and the app, and
 * search across them. Every switch and field is the one the desktop's
 * Settings changes; what the app does not do yet says "Soon".
 */
export function PhoneSettings(props: PhoneSettingsProps) {
  const { onClose, container, theme, initialSection } = props;
  const t = useT();
  const [stack, setStack] = useState<Page[]>(() =>
    initialSection ? ['root', SECTION_PAGES[initialSection]] : ['root'],
  );
  const [push, setPush] = useState<'' | 'in' | 'back'>('');
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const page = stack[stack.length - 1]!;
  const sub = page !== 'root';

  const go = (next: Page) => {
    setPush('in');
    setStack((was) => [...was, next]);
    setScrolled(false);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const back = () => {
    setPush('back');
    setStack((was) => (was.length > 1 ? was.slice(0, -1) : was));
    setScrolled(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const endDrag = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > DISMISS_DRAG) onClose();
    else setDrag(0);
  };

  const body = <Pages {...props} page={page} go={go} query={query} setQuery={setQuery} />;

  return createPortal(
    <>
      <div className="cf-ps-scrim" onClick={onClose} aria-hidden="true" />
      <section
        className={cn(
          'cf-ps',
          theme === 'light' && 'light',
          scrolled && 'scrolled',
          drag ? 'dragging' : 'settle',
        )}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t(PAGE_TITLES[page])}
        data-testid="phone-settings"
      >
        <div
          className="st-top"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="grab" />
          <div className="st-bar">
            {sub ? (
              <button type="button" className="st-ib" onClick={back} aria-label={t('common.back')}>
                <Icon name="chevleft" size={19} />
              </button>
            ) : (
              <span />
            )}
            <span className="st-bar-t">{t(PAGE_TITLES[page])}</span>
            <button
              type="button"
              className="st-ib r"
              onClick={onClose}
              aria-label={t('ps.close')}
              data-testid="phone-settings-close"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <div
          key={stack.length}
          ref={bodyRef}
          className={cn('st-body', push && `push-${push}`)}
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 36)}
        >
          {sub && <h1 className="st-h1">{t(PAGE_TITLES[page])}</h1>}
          {body}
        </div>
      </section>
    </>,
    container ?? document.body,
  );
}

// --- rows -----------------------------------------------------------------

function Row({
  children,
  end,
  chevron = true,
  onClick,
  red = false,
  soon = false,
  testId,
}: {
  children: ReactNode;
  end?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  red?: boolean;
  soon?: boolean;
  testId?: string;
}) {
  const t = useT();
  const showEnd = soon || end !== undefined || (chevron && onClick);
  return (
    <button
      type="button"
      className={cn('st-r', red && 'red', soon && 'dim')}
      onClick={soon ? undefined : onClick}
      disabled={soon || !onClick}
      aria-disabled={soon || undefined}
      data-testid={testId}
    >
      {children}
      {showEnd && (
        <span className="end">
          {soon ? (
            <span className="st-soon">{t('common.soon')}</span>
          ) : (
            <>
              {end !== undefined && end !== '' && <span>{end}</span>}
              {chevron && onClick && <Icon name="chevright" size={16} />}
            </>
          )}
        </span>
      )}
    </button>
  );
}

function SwitchRow({
  label,
  hint,
  on,
  onToggle,
  soon = false,
  testId,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle?: () => void;
  soon?: boolean;
  testId?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn('st-r', soon && 'dim')}
      role="switch"
      aria-checked={on}
      onClick={soon ? undefined : onToggle}
      disabled={soon || !onToggle}
      data-testid={testId}
    >
      <span className="t">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="end">
        {soon ? (
          <span className="st-soon">{t('common.soon')}</span>
        ) : (
          <span className={cn('st-sw', on && 'on')} />
        )}
      </span>
    </button>
  );
}

const Label = ({ children }: { children: ReactNode }) => <div className="st-sl">{children}</div>;
const Group = ({ children, noIcons = false }: { children: ReactNode; noIcons?: boolean }) => (
  <div className={cn('st-g', noIcons && 'noi')}>{children}</div>
);
const Hint = ({ children, error = false }: { children: ReactNode; error?: boolean }) => (
  <div className={cn('st-hint', error && 'err')}>{children}</div>
);
const T = ({ children }: { children: ReactNode }) => <span className="t">{children}</span>;

function Avatar({ name, url, size }: { name: string; url: string | null; size?: 's' | 'xl' }) {
  return (
    <span className={cn('st-av', size)}>{url ? <img src={url} alt="" /> : initialsOf(name)}</span>
  );
}

// --- data -------------------------------------------------------------------

function useBilling(workspaceId: string | null): BillingEntry | null {
  const [entry, setEntry] = useState<BillingEntry | null>(() =>
    workspaceId ? cachedBilling(workspaceId) : null,
  );
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setEntry(cachedBilling(workspaceId));
    loadBilling(workspaceId).then(
      (loaded) => {
        if (!cancelled) setEntry(loaded);
      },
      () => {},
    );
    const stop = watchBilling((id, next) => {
      if (id === workspaceId && !cancelled) setEntry(next);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [workspaceId]);
  return entry;
}

function useSecurity(token: string | null): AccountSecurity | null {
  const [security, setSecurity] = useState<AccountSecurity | null>(knownAccountSecurity);
  useEffect(() => {
    let cancelled = false;
    loadAccountSecurity(token).then(
      (loaded) => {
        if (!cancelled) setSecurity(loaded);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [token]);
  return security;
}

function useDiagramUsage(token: string | null, boardId: string) {
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchDiagramUsage(token, boardId, controller.signal).then(
      (result) => {
        if ('used' in result) setUsage({ used: result.used, limit: result.limit });
      },
      () => {},
    );
    return () => controller.abort();
  }, [token, boardId]);
  return usage;
}

function useNotifications(token: string | null) {
  const [settings, setSettings] = useState<NotificationSettings>(
    () => knownNotificationSettings() ?? DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadNotificationSettings(token).then(
      (loaded) => {
        if (!cancelled) setSettings(loaded);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [token]);
  const toggle = (kind: NotificationKind) => {
    const before = settings;
    const next = { ...settings, [kind]: !settings[kind] };
    setSettings(next);
    setError(null);
    saveNotificationSettings(token, { [kind]: next[kind] }).catch((caught: unknown) => {
      setSettings(before);
      setError(caught instanceof Error ? caught.message : null);
    });
  };
  return { settings, toggle, error };
}

// --- pages ------------------------------------------------------------------

function Pages(
  props: PhoneSettingsProps & {
    page: Page;
    go: (page: Page) => void;
    query: string;
    setQuery: (query: string) => void;
  },
) {
  const {
    page,
    go,
    query,
    setQuery,
    token,
    account,
    avatar,
    user,
    themePreference,
    onThemeChange,
    preferences,
    userId = null,
    isGuest = false,
    resumeDeletion = false,
    deleteAccount,
    workspace: source = { status: 'none' },
    renameWorkspace,
    upgradeWorkspace,
    openBoard = null,
    analytics = null,
    chooseAnalytics,
    boardId,
    onSignOut,
    onShowShortcuts,
    onClose,
  } = props;
  const t = useT();
  const { setOpenMobile } = useSidebar();
  const { locale, setLocale } = useI18n();
  const accent = useAccent();
  const reduceMotion = useReduceMotion();
  const [dialog, setDialog] = useState<Dialog>(() =>
    resumeDeletion && !isGuest ? { kind: 'delete' } : null,
  );

  const profile = account.profile;
  const name = profile?.name || user?.name || t('menu.account');
  const email = profile?.email ?? user?.email ?? '';
  const workspace = source.status === 'ready' ? source.workspace : null;
  const workspaceId = workspace?.id ?? null;
  const plan: WorkspacePlan = workspace?.plan ?? 'free';
  const allowance = PLAN_ALLOWANCES[plan];
  const storage = useStorageUsage(token).usage;
  const exporter = useBoardsExport(token, openBoard);
  const billing = useBilling(workspaceId);
  const diagrams = useDiagramUsage(token, boardId);
  const people = useWorkspacePeople(workspaceId);
  const memberCount =
    people.status === 'ready' ? people.members.length : (billing?.billing.members ?? null);
  const role = workspace?.role ?? null;
  const languages = listedLanguages();
  const languageLabel = languages.find((language) => language.code === locale)?.label ?? locale;
  const themeLabel = t(
    themePreference === 'system'
      ? 'ps.theme.automatic'
      : themePreference === 'light'
        ? 'theme.light'
        : 'theme.dark',
  );
  const storageUsedBytes = storage?.totalBytes ?? 0;
  const storageGb = storage?.allowanceGb ?? allowance.storageGb;
  const storageShare = Math.min(100, (storageUsedBytes / (storageGb * 1024 ** 3)) * 100);

  const dialogs = (
    <AccountAndWorkspaceDialogs
      dialog={dialog}
      setDialog={setDialog}
      token={token}
      avatar={avatar}
      email={email}
      userId={userId}
      deleteAccount={deleteAccount}
      workspace={workspace}
      people={people}
      role={role}
    />
  );

  if (page === 'account') {
    return (
      <>
        <AccountPage
          account={account}
          avatar={avatar}
          token={token}
          name={name}
          email={email}
          isGuest={isGuest}
          canDelete={!isGuest && deleteAccount !== undefined}
          theme={props.theme}
          onDialog={setDialog}
        />
        {dialogs}
      </>
    );
  }

  if (page === 'appearance') {
    const mock = (bg: string, fg: string, bar: string) => (
      <div className="mock" style={{ background: bg }}>
        <i className="bar" style={{ background: bar }} />
        <i style={{ background: fg, width: '80%' }} />
        <i style={{ background: fg, width: '60%' }} />
        <i className="acc" />
        <i style={{ background: fg, width: '70%' }} />
      </div>
    );
    const light = mock('#f4f4f7', '#d9d9e0', '#fff');
    const dark = mock('#141417', '#2c2c32', '#202024');
    const card = (value: ThemePreference, label: string, inner: ReactNode) => (
      <button
        key={value}
        type="button"
        className={cn('tc', themePreference === value && 'on')}
        onClick={() => onThemeChange(value)}
        role="radio"
        aria-checked={themePreference === value}
        data-testid={`ps-theme-${value}`}
      >
        <span className="tc-prev">{inner}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="radio" />
          {label}
        </span>
      </button>
    );
    return (
      <>
        <div className="st-sl" style={{ paddingTop: 4 }}>
          {t('theme.title')}
        </div>
        <div className="themes" role="radiogroup" aria-label={t('theme.title')}>
          {card('light', t('theme.light'), light)}
          {card('dark', t('theme.dark'), dark)}
          {card(
            'system',
            t('ps.theme.auto'),
            <>
              <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 50% 0 0)' }}>
                {light}
              </div>
              <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 0 0 50%)' }}>
                {dark}
              </div>
            </>,
          )}
        </div>
        <Hint>{t('ps.theme.autoHint')}</Hint>
        <Label>{t('ps.accent')}</Label>
        <Group>
          <div className="swatches" role="radiogroup" aria-label={t('ps.accent')}>
            {ACCENT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={cn('swatch', accent === id && 'on')}
                style={{ '--c': ACCENTS[id].strong } as React.CSSProperties}
                onClick={() => setAccent(id)}
                role="radio"
                aria-checked={accent === id}
                aria-label={t(ACCENT_LABELS[id])}
                data-testid={`ps-accent-${id}`}
              />
            ))}
          </div>
        </Group>
        <Hint>{t('ps.accentHint')}</Hint>
        <Label>{t('ps.motionAndCanvas')}</Label>
        <Group noIcons>
          <SwitchRow
            label={t('ps.reduceMotion')}
            hint={t('ps.reduceMotionHint')}
            on={reduceMotion}
            onToggle={() => setReduceMotion(!reduceMotion)}
            testId="ps-reduce-motion"
          />
          <SwitchRow
            label={t('preferences.showGrid')}
            hint={t('ps.showGridHint')}
            on={preferences.values.showGrid}
            onToggle={() => preferences.set('showGrid', !preferences.values.showGrid)}
          />
          <SwitchRow
            label={t('preferences.snapToObjects')}
            hint={t('ps.snapHint')}
            on={preferences.values.snapToObjects}
            onToggle={() => preferences.set('snapToObjects', !preferences.values.snapToObjects)}
          />
        </Group>
      </>
    );
  }

  if (page === 'language') {
    return (
      <Group noIcons>
        {languages.map((language) => (
          <Row
            key={language.code}
            chevron={false}
            onClick={() => setLocale(language.code)}
            end={
              language.code === locale ? (
                <span className="st-chk">
                  <Icon name="check" size={20} />
                </span>
              ) : undefined
            }
          >
            <T>{language.label}</T>
          </Row>
        ))}
      </Group>
    );
  }

  if (page === 'workspace') {
    return (
      <>
        <WorkspacePage
          workspace={workspace}
          memberCount={memberCount}
          people={people}
          role={role}
          userId={userId}
          renameWorkspace={renameWorkspace}
          onDialog={setDialog}
        />
        {dialogs}
      </>
    );
  }

  if (page === 'notifications') return <NotificationsPage token={token} email={email} />;

  if (page === 'billing') {
    return (
      <BillingPage
        plan={plan}
        workspaceId={workspaceId}
        billing={billing}
        members={memberCount}
        upgradeWorkspace={upgradeWorkspace}
      />
    );
  }

  if (page === 'privacy') {
    const boardBytes = storage?.boardBytes ?? 0;
    const imageBytes = storage?.imageBytes ?? 0;
    const libraryBytes = storage?.libraryBytes ?? 0;
    const whole = storageGb * 1024 ** 3;
    const width = (bytes: number) => `${Math.min(100, (bytes / whole) * 100)}%`;
    return (
      <>
        <div className="st-card" style={{ padding: 16 }}>
          <div className="st-plan-h" style={{ marginBottom: 0 }}>
            <span>
              <b>{storage ? formatStorageSize(storageUsedBytes) : '…'}</b>
              <span>{t('ps.ofUsed', { size: `${storageGb} GB` })}</span>
            </span>
          </div>
          <div className="stack-bar">
            <i style={{ width: width(boardBytes), background: '#4d84fd' }} />
            <i style={{ width: width(imageBytes), background: '#f59e0b' }} />
            <i style={{ width: width(libraryBytes), background: '#a78bfa' }} />
          </div>
          <div className="legend">
            <span style={{ '--c': '#4d84fd' } as React.CSSProperties}>
              {t('ps.legend.boards', { size: formatStorageSize(boardBytes) })}
            </span>
            <span style={{ '--c': '#f59e0b' } as React.CSSProperties}>
              {t('ps.legend.images', { size: formatStorageSize(imageBytes) })}
            </span>
            <span style={{ '--c': '#a78bfa' } as React.CSSProperties}>
              {t('ps.legend.libraries', { size: formatStorageSize(libraryBytes) })}
            </span>
          </div>
        </div>
        <div className="st-g" style={{ marginTop: 16 }}>
          <Row
            onClick={exporter.progress ? undefined : exporter.start}
            end={
              exporter.progress
                ? t('ps.exporting', {
                    done: exporter.progress.done,
                    total: exporter.progress.total,
                  })
                : '.zip'
            }
            testId="ps-export"
          >
            <Tile name="download" color="#0a84ff" />
            <T>{t('ps.exportAll')}</T>
          </Row>
          <Row
            // The boards list is where archived boards are kept, folded away.
            onClick={() => {
              onClose();
              setOpenMobile(true);
            }}
          >
            <Tile name="archive" color="#8e8e93" />
            <T>{t('ps.archivedBoards')}</T>
          </Row>
        </div>
        {exporter.hint && <Hint>{exporter.hint}</Hint>}
        <Label>{t('ps.privacy')}</Label>
        <Group noIcons>
          <SwitchRow
            label={t('settings.row.analytics')}
            hint={t('ps.analyticsHint')}
            on={analytics === true}
            onToggle={chooseAnalytics ? () => void chooseAnalytics(analytics !== true) : undefined}
            testId="ps-analytics"
          />
          <SwitchRow label={t('ps.crashReports')} hint={t('ps.crashReportsHint')} on={false} soon />
          <SwitchRow label={t('ps.findable')} hint={t('ps.findableHint')} on={false} soon />
        </Group>
        <div className="st-g" style={{ marginTop: 20 }}>
          <Row onClick={() => window.open(privacyUrl(), '_blank', 'noopener,noreferrer')}>
            <T>{t('settings.row.privacy-policy')}</T>
          </Row>
          <Row onClick={() => window.open(termsUrl(), '_blank', 'noopener,noreferrer')}>
            <T>{t('settings.row.terms')}</T>
          </Row>
        </div>
      </>
    );
  }

  // --- the first page ---
  const needle = query.trim().toLowerCase();
  const hits = needle
    ? SEARCH_INDEX.filter(([label, , words]) =>
        `${t(label)} ${t(words)}`.toLowerCase().includes(needle),
      )
    : [];
  const highlight = (label: string) => {
    const at = label.toLowerCase().indexOf(needle);
    if (at < 0) return label;
    return (
      <>
        {label.slice(0, at)}
        <mark>{label.slice(at, at + needle.length)}</mark>
        {label.slice(at + needle.length)}
      </>
    );
  };

  return (
    <>
      <h1 className="st-h1">{t('menu.settings')}</h1>
      <label className="st-search">
        <Icon name="search" size={17} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('settings.search')}
          aria-label={t('settings.search')}
          autoComplete="off"
          data-testid="ps-search"
        />
      </label>
      {needle ? (
        hits.length === 0 ? (
          <div className="st-empty">{t('ps.noMatch', { query: query.trim() })}</div>
        ) : (
          <Group noIcons>
            {hits.map(([label, target]) => (
              <Row
                key={label}
                onClick={
                  target === '@shortcuts'
                    ? onShowShortcuts
                    : () => {
                        setQuery('');
                        go(target);
                      }
                }
              >
                <T>
                  {highlight(t(label))}
                  <small>
                    {target === '@shortcuts'
                      ? t('ps.support')
                      : `${t('menu.settings')} › ${t(PAGE_TITLES[target])}`}
                  </small>
                </T>
              </Row>
            ))}
          </Group>
        )
      ) : (
        <>
          <button
            type="button"
            className="st-card st-prof"
            onClick={() => go('account')}
            data-testid="ps-profile"
          >
            <Avatar name={name} url={avatar.url ?? profile?.avatarUrl ?? null} />
            <span className="t">
              <b>{name}</b>
              <span>{email}</span>
            </span>
            <span className="st-chev">
              <Icon name="chevright" size={18} />
            </span>
          </button>

          {workspace && (
            <div className="st-card st-plan">
              <div className="st-plan-h">
                <span>
                  <b>{t('ps.planName', { plan: PLAN_NAMES[plan] })}</b>
                  <span>{workspace.name}</span>
                </span>
                <button type="button" className="st-link" onClick={() => go('billing')}>
                  {t('ps.compare')} <Icon name="chevright" size={14} />
                </button>
              </div>
              <div className="meter">
                <div className="meter-h">
                  <span>{t('ps.storage')}</span>
                  <span>
                    {t('ps.ofSize', {
                      used: storage ? formatStorageSize(storageUsedBytes) : '…',
                      size: `${storageGb} GB`,
                    })}
                  </span>
                </div>
                <div className="meter-bar">
                  <i style={{ width: `${storageShare}%` }} />
                </div>
              </div>
              <div className="meter">
                <div className="meter-h">
                  <span>{t('ps.aiDiagrams')}</span>
                  <span>
                    {t('ps.ofCount', {
                      used: diagrams?.used ?? '…',
                      limit: diagrams?.limit ?? allowance.diagramsPerMonth,
                    })}
                  </span>
                </div>
                <div className="meter-bar">
                  <i
                    style={{
                      width: `${diagrams ? Math.min(100, (diagrams.used / Math.max(1, diagrams.limit)) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <button type="button" className="st-btn" onClick={() => go('billing')}>
                {plan === 'free' ? t('ps.upgradeToPro') : t('ps.managePlan')}
              </button>
            </div>
          )}

          <Label>{t('ps.preferences')}</Label>
          <Group>
            <Row onClick={() => go('appearance')} end={themeLabel} testId="ps-row-appearance">
              <Tile name="palette" color="#af52de" />
              <T>{t('ps.page.appearance')}</T>
            </Row>
            <Row onClick={() => go('language')} end={languageLabel}>
              <Tile name="globe" color="#0a84ff" />
              <T>{t('menu.language')}</T>
            </Row>
            <Row soon>
              <Tile name="home" color="#30b0c7" />
              <T>{t('ps.startOn')}</T>
            </Row>
          </Group>

          {workspace && (
            <>
              <Label>{t('ps.page.workspace')}</Label>
              <Group>
                <Row
                  onClick={() => go('workspace')}
                  end={memberCount === null ? '' : t('ps.members', { count: memberCount })}
                >
                  <Tile name="users" color="#ff9f0a" />
                  <T>{workspace.name}</T>
                </Row>
                <Row onClick={() => go('notifications')} end={t('ps.on')}>
                  <Tile name="bell" color="#ff3b30" />
                  <T>{t('ps.page.notifications')}</T>
                </Row>
              </Group>
            </>
          )}

          <Label>{t('ps.account')}</Label>
          <Group>
            {workspace && (
              <Row onClick={() => go('billing')} end={PLAN_NAMES[plan]}>
                <Tile name="card" color="#34c759" />
                <T>{t('ps.page.billing')}</T>
              </Row>
            )}
            <Row
              onClick={() => go('privacy')}
              end={storage ? formatStorageSize(storageUsedBytes) : ''}
            >
              <Tile name="shield" color="#636366" />
              <T>{t('ps.page.privacy')}</T>
            </Row>
          </Group>

          <Label>{t('ps.support')}</Label>
          <Group>
            <Row onClick={onShowShortcuts}>
              <Tile name="keyboard" color="#5e5ce6" />
              <T>{t('ps.shortcuts')}</T>
            </Row>
            <Row soon>
              <Tile name="help" color="#0a84ff" />
              <T>{t('ps.helpAndFeedback')}</T>
            </Row>
            <Row soon>
              <Tile name="gift" color="#ff2d55" />
              <T>{t('ps.whatsNew')}</T>
            </Row>
          </Group>

          {onSignOut && (
            <div className="st-g" style={{ marginTop: 20 }}>
              <Row red chevron={false} onClick={onSignOut} testId="ps-sign-out">
                {t('menu.signOut')}
              </Row>
            </div>
          )}
          <div className="st-foot">CanvasFlow</div>
        </>
      )}
    </>
  );
}

// --- account ----------------------------------------------------------------

function AccountPage({
  account,
  avatar,
  token,
  name,
  email,
  isGuest,
  canDelete,
  theme,
  onDialog,
}: {
  account: ProfileState;
  avatar: AvatarState;
  token: string | null;
  name: string;
  email: string;
  isGuest: boolean;
  canDelete: boolean;
  theme: SurfaceTheme;
  onDialog: (dialog: Dialog) => void;
}) {
  const t = useT();
  const profile = account.profile;
  const security = useSecurity(isGuest ? null : token);
  const [draftName, setDraftName] = useState(profile?.name ?? name);
  const [draftUsername, setDraftUsername] = useState(profile?.username ?? '');
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Changes save as you type: the name a beat after the last key, the
  // username once the field is left, since a username has to be free.
  const typeName = (value: string) => {
    setDraftName(value);
    clearTimeout(saveTimer.current);
    const trimmed = value.trim();
    if (!trimmed || trimmed === profile?.name) return;
    saveTimer.current = setTimeout(() => {
      void account.save({ name: trimmed }).then((saved) => {
        setNote(
          saved ? null : { text: account.error ?? t('common.somethingWentWrong'), error: true },
        );
      });
    }, 600);
  };
  const saveUsername = () => {
    const value = draftUsername.trim().replace(/^@/, '').toLowerCase();
    if (!value || value === profile?.username) return;
    void account.save({ username: value }).then((saved) => {
      if (!saved) {
        setNote({ text: account.error ?? t('common.somethingWentWrong'), error: true });
        setDraftUsername(profile?.username ?? '');
      } else setNote(null);
    });
  };

  const google = security?.providers.includes('google') ?? false;
  const sessions = security?.sessions.length ?? null;
  const verified = profile?.emailVerified ?? true;

  return (
    <>
      <div className="st-hero">
        <Avatar name={draftName || name} url={avatar.url ?? profile?.avatarUrl ?? null} size="xl" />
        <b>{draftName || name}</b>
        {profile?.username && <span>@{profile.username}</span>}
        <br />
        {!isGuest && (
          <button type="button" className="st-link" onClick={() => picker.current?.click()}>
            {t('ps.changePhoto')}
          </button>
        )}
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onDialog({ kind: 'photo', file });
          }}
        />
      </div>
      <Group noIcons>
        <label className="st-r st-field">
          <span className="t">{t('ps.name')}</span>
          <input
            value={draftName}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => typeName(event.target.value)}
            data-testid="ps-name"
          />
        </label>
        {!isGuest && (
          <label className="st-r st-field">
            <span className="t">{t('settings.row.username')}</span>
            <input
              value={draftUsername}
              maxLength={24}
              autoComplete="off"
              autoCapitalize="none"
              onChange={(event) => setDraftUsername(event.target.value)}
              onBlur={saveUsername}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
              data-testid="ps-username"
            />
          </label>
        )}
        <Row
          chevron={!verified}
          end={email}
          onClick={
            verified || !email || !token
              ? undefined
              : () =>
                  void resendVerification(token).then(
                    () => setNote({ text: t('ps.verifySent', { email }), error: false }),
                    () => setNote({ text: t('common.somethingWentWrong'), error: true }),
                  )
          }
        >
          <T>{t('ps.email')}</T>
        </Row>
      </Group>
      <Hint error={note?.error}>{note?.text ?? t('ps.nameHint')}</Hint>

      {!isGuest && <CursorColourGroup account={account} theme={theme} />}

      {!isGuest && (
        <>
          <Label>{t('settings.group.signIn')}</Label>
          <Group>
            <Row
              onClick={security ? () => onDialog({ kind: 'accounts' }) : undefined}
              end={security ? (google ? t('ps.connected') : t('ps.notConnected')) : ''}
            >
              <Tile name="globe" color="#4285f4" />
              <T>{providerNames(['google'])}</T>
            </Row>
            <Row
              onClick={
                security
                  ? () => onDialog({ kind: security.hasPassword ? 'password' : 'addPassword' })
                  : undefined
              }
              end={security ? (security.hasPassword ? t('ps.change') : t('ps.add')) : ''}
            >
              <Tile name="lock" color="#636366" />
              <T>{t('settings.row.password')}</T>
            </Row>
            <Row
              onClick={security ? () => onDialog({ kind: 'sessions' }) : undefined}
              end={sessions === null ? '' : t('ps.devices', { count: sessions })}
            >
              <Tile name="shield" color="#30b0c7" />
              <T>{t('ps.activeSessions')}</T>
            </Row>
          </Group>
        </>
      )}

      {canDelete && (
        <div className="st-g" style={{ marginTop: 20 }}>
          <Row red chevron={false} onClick={() => onDialog({ kind: 'delete' })} testId="ps-delete">
            {t('ps.deleteAccount')}
          </Row>
        </div>
      )}
    </>
  );
}

// --- workspace --------------------------------------------------------------

function WorkspacePage({
  workspace,
  memberCount,
  people,
  role,
  userId,
  renameWorkspace,
  onDialog,
}: {
  workspace: { id: string; name: string; plan: WorkspacePlan; logoUrl: string | null } | null;
  memberCount: number | null;
  people: ReturnType<typeof useWorkspacePeople>;
  role: Parameters<typeof can>[0] | null;
  userId: string | null;
  renameWorkspace?: (workspaceId: string, name: string) => Promise<void>;
  onDialog: (dialog: Dialog) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(workspace?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  if (!workspace) return <div className="st-empty">{t('workspacePane.none')}</div>;
  const canRename = role !== null && can(role, 'rename') && renameWorkspace !== undefined;
  const canInvite = role !== null && can(role, 'invite');

  const save = () => {
    const value = draft.trim();
    if (!value || value === workspace.name || !renameWorkspace) return;
    setError(null);
    renameWorkspace(workspace.id, value).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : t('common.somethingWentWrong'));
      setDraft(workspace.name);
    });
  };

  return (
    <>
      <div className="st-hero" style={{ paddingBottom: 14 }}>
        <span className="ws-logo">
          {workspace.logoUrl ? <img src={workspace.logoUrl} alt="" /> : initialsOf(workspace.name)}
        </span>
        <b>{draft || workspace.name}</b>
        <span>
          {t('ps.planName', { plan: PLAN_NAMES[workspace.plan] })}
          {memberCount !== null && ` · ${t('ps.members', { count: memberCount })}`}
        </span>
      </div>
      <Group noIcons>
        <label className="st-r st-field">
          <span className="t">{t('workspace.name')}</span>
          <input
            value={draft}
            maxLength={40}
            autoComplete="off"
            readOnly={!canRename}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
          />
        </label>
        <Row soon>
          <T>{t('ps.logo')}</T>
        </Row>
      </Group>
      {error && <Hint error>{error}</Hint>}
      <div
        className="st-sl"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        {t('settings.row.members')}
        {canInvite && people.status === 'ready' && (
          <button type="button" className="st-link" onClick={() => onDialog({ kind: 'members' })}>
            <Icon name="plus" size={15} /> {t('ps.invite')}
          </button>
        )}
      </div>
      <div className="st-g" style={{ '--hl': '64px' } as React.CSSProperties}>
        {people.status === 'ready' ? (
          people.members.map((member) => (
            <Row
              key={member.userId}
              chevron={false}
              onClick={() => onDialog({ kind: 'members' })}
              end={<span className="role-pill">{t(ROLE_LABELS[member.role])}</span>}
            >
              <Avatar name={member.name} url={member.photo} size="s" />
              <T>
                {member.userId === userId ? t('ps.you', { name: member.name }) : member.name}
                {(member.email ?? member.username) && (
                  <small>{member.email ?? `@${member.username}`}</small>
                )}
              </T>
            </Row>
          ))
        ) : (
          <div className="st-empty" style={{ padding: 20 }}>
            {people.status === 'error' ? people.error : '…'}
          </div>
        )}
      </div>
      {role !== null && (
        <div className="st-g" style={{ marginTop: 20 }}>
          <Row
            red
            chevron={false}
            onClick={() => onDialog({ kind: role === 'owner' ? 'handover' : 'leave' })}
            testId="ps-leave"
          >
            {t('settings.row.leave-workspace')}
          </Row>
        </div>
      )}
    </>
  );
}

/** The cursor colour, as on the desktop Profile: saved the moment one is picked. */
function CursorColourGroup({ account, theme }: { account: ProfileState; theme: SurfaceTheme }) {
  const t = useT();
  const saved = account.profile?.cursorColor ?? null;
  const [picked, setPicked] = useState<CursorColor | null>(saved);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Follows the account when it changes elsewhere, but never mid-save.
  useEffect(() => {
    if (!busy) setPicked(saved);
  }, [saved, busy]);

  const choose = async (next: CursorColor) => {
    if (next === picked || busy) return;
    const before = picked;
    setPicked(next);
    setBusy(true);
    setFailed(false);
    const kept = await account.save({ cursorColor: next });
    setBusy(false);
    if (!kept) {
      setPicked(before);
      setFailed(true);
    }
  };

  return (
    <>
      <Label>{t('settings.group.presence')}</Label>
      <Group>
        <div
          className="swatches cursor"
          role="radiogroup"
          aria-label={t('settings.row.cursor-colour')}
        >
          {PRESENCE_PALETTE.map((entry) => (
            <button
              key={entry.name}
              type="button"
              className={cn('swatch', picked === entry.name && 'on')}
              style={{ '--c': theme === 'dark' ? entry.dark : entry.light } as React.CSSProperties}
              onClick={() => void choose(entry.name)}
              disabled={account.profile === null}
              role="radio"
              aria-checked={picked === entry.name}
              aria-label={t(CURSOR_COLOUR_NAMES[entry.name])}
              data-testid={`ps-cursor-${entry.name}`}
            />
          ))}
        </div>
      </Group>
      <Hint error={failed}>{failed ? t('profile.colourFailed') : t('profile.colourHint')}</Hint>
    </>
  );
}

// --- notifications ----------------------------------------------------------

function NotificationsPage({ token, email }: { token: string | null; email: string }) {
  const t = useT();
  const { settings, toggle, error } = useNotifications(token);
  const real = (kind: NotificationKind, label: TranslationKey, hint: TranslationKey) => (
    <SwitchRow
      key={kind}
      label={t(label)}
      hint={t(hint)}
      on={settings[kind]}
      onToggle={() => toggle(kind)}
      testId={`ps-notify-${kind}`}
    />
  );
  return (
    <>
      <button type="button" className="st-card st-pause dim" disabled aria-disabled="true">
        <Tile name="bell" color="#ff3b30" />
        <span className="t">
          <b>{t('ps.pauseAll')}</b>
          <span>{t('ps.pauseAllHint')}</span>
        </span>
        <span className="st-soon">{t('common.soon')}</span>
      </button>
      <Label>{t('settings.group.email')}</Label>
      <Group noIcons>
        {real('accessChanges', 'settings.row.access-changes', 'notifications.accessChangesHint')}
        {real(
          'commentMentions',
          'settings.row.comment-mentions',
          'notifications.commentMentionsHint',
        )}
        {real('inviteAccepted', 'settings.row.invite-accepted', 'notifications.inviteAcceptedHint')}
        <SwitchRow
          label={t('ps.notify.replies')}
          hint={t('ps.notify.repliesHint')}
          on={false}
          soon
        />
        <SwitchRow label={t('ps.notify.edits')} hint={t('ps.notify.editsHint')} on={false} soon />
      </Group>
      <Label>{t('settings.group.digest')}</Label>
      <Group noIcons>
        {real('weeklyDigest', 'settings.row.weekly-digest', 'notifications.weeklyDigestHint')}
        {real('productUpdates', 'settings.row.product-updates', 'notifications.productUpdatesHint')}
      </Group>
      {error && <Hint error>{error}</Hint>}
      <Label>{t('ps.notify.delivery')}</Label>
      <Group noIcons>
        <SwitchRow label={t('ps.notify.push')} hint={t('ps.notify.pushHint')} on={false} soon />
        <SwitchRow label={t('ps.email')} hint={t('ps.notify.emailHint', { email })} on soon />
      </Group>
    </>
  );
}

// --- billing ----------------------------------------------------------------

function BillingPage({
  plan,
  workspaceId,
  billing,
  members,
  upgradeWorkspace,
}: {
  plan: WorkspacePlan;
  workspaceId: string | null;
  billing: BillingEntry | null;
  members: number | null;
  upgradeWorkspace?: (workspaceId: string) => void;
}) {
  const t = useT();
  const [yearly, setYearly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = PLAN_ALLOWANCES[plan];
  const pro = PLAN_PRICES.pro!;
  const team = PLAN_PRICES.team!;
  const saving = Math.round((1 - pro.yearly / pro.monthly) * 100);
  const history = billing?.history ?? null;
  const card = history?.card ?? null;

  const portal = async () => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await openBillingPortal(workspaceId, settingsAddress('billing')));
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : t('billing.portalFailed'));
    }
  };

  const features = useMemo(
    () => ({
      pro: [
        t('ps.feature.storage', { size: PLAN_ALLOWANCES.pro.storageGb }),
        t('ps.feature.diagrams', { count: PLAN_ALLOWANCES.pro.diagramsPerMonth }),
        t('ps.feature.history', { days: PLAN_ALLOWANCES.pro.historyDays ?? 0 }),
        t('ps.feature.noBadge'),
      ],
      team: [
        t('ps.feature.everythingInPro'),
        t('ps.feature.teamWorkspace'),
        t('ps.feature.storage', { size: PLAN_ALLOWANCES.team.storageGb }),
        t('ps.feature.fullHistory'),
      ],
    }),
    [t],
  );

  return (
    <>
      <div className="st-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="st-plan-h" style={{ marginBottom: 6 }}>
          <span>
            <b>{PLAN_NAMES[plan]}</b>
            <span>{t('ps.currentPlan')}</span>
          </span>
          <span className="role-pill">{t('ps.current')}</span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--s-mut)' }}>
          {[
            t('ps.feature.storage', { size: current.storageGb }),
            t('ps.feature.diagrams', { count: current.diagramsPerMonth }),
            members !== null ? t('ps.members', { count: members }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {plan === 'free' && (
        <>
          <div className="st-seg" role="radiogroup" aria-label={t('ps.billingCycle')}>
            <button
              type="button"
              className={cn(!yearly && 'on')}
              onClick={() => setYearly(false)}
              role="radio"
              aria-checked={!yearly}
            >
              {t('ps.monthly')}
            </button>
            <button
              type="button"
              className={cn(yearly && 'on')}
              onClick={() => setYearly(true)}
              role="radio"
              aria-checked={yearly}
            >
              {t('ps.yearly')} <em>−{saving}%</em>
            </button>
          </div>
          <div className="pcs">
            <div className="st-card pc on">
              <span className="pc-tag">{t('ps.mostPopular')}</span>
              <div className="pc-h">
                <b>{PLAN_NAMES.pro}</b>
                <span className="pc-price">
                  {formatPlanPrice(yearly ? pro.yearly : pro.monthly)}
                  <small>{t('ps.perMonth')}</small>
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--s-mut)', marginTop: 2 }}>
                {yearly
                  ? t('ps.billedYearly', { amount: formatPlanPrice(pro.yearly * 12) })
                  : t('ps.billedMonthly')}
              </div>
              <ul>
                {features.pro.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={15} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="st-card pc">
              <div className="pc-h">
                <b>{PLAN_NAMES.team}</b>
                <span className="pc-price">
                  {formatPlanPrice(yearly ? team.yearly : team.monthly)}
                  <small>{t('ps.perMember')}</small>
                </span>
              </div>
              <ul>
                {features.team.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={15} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className="st-btn"
        style={{ marginTop: 16 }}
        disabled={!workspaceId || busy}
        onClick={() => {
          if (!workspaceId) return;
          if (plan === 'free') upgradeWorkspace?.(workspaceId);
          else void portal();
        }}
        data-testid="ps-upgrade"
      >
        {plan === 'free' ? t('ps.upgradeToPro') : t('ps.managePlan')}
      </button>
      {error && <Hint error>{error}</Hint>}

      {history && (
        <>
          <Label>{t('ps.billing')}</Label>
          <Group>
            <Row
              onClick={() => void portal()}
              end={history.invoices.length ? String(history.invoices.length) : t('ps.noneYet')}
            >
              <Tile name="card" color="#34c759" />
              <T>{t('ps.invoices')}</T>
            </Row>
            <Row
              onClick={() => void portal()}
              end={card ? `${card.brand} •••• ${card.last4}` : t('ps.notSet')}
            >
              <Tile name="card" color="#5e5ce6" />
              <T>{t('ps.paymentMethod')}</T>
            </Row>
          </Group>
        </>
      )}
    </>
  );
}

// --- dialogs ----------------------------------------------------------------

function AccountAndWorkspaceDialogs({
  dialog,
  setDialog,
  token,
  avatar,
  email,
  userId,
  deleteAccount,
  workspace,
  people,
  role,
}: {
  dialog: Dialog;
  setDialog: (dialog: Dialog) => void;
  token: string | null;
  avatar: AvatarState;
  email: string;
  userId: string | null;
  deleteAccount?: (input: DeletionInput) => Promise<void>;
  workspace: { id: string; name: string; plan: WorkspacePlan } | null;
  people: ReturnType<typeof useWorkspacePeople>;
  role: Parameters<typeof can>[0] | null;
}) {
  const t = useT();
  const security = useSecurity(token);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const wantsPreview = dialog?.kind === 'delete';

  useEffect(() => {
    if (!wantsPreview) return;
    let cancelled = false;
    setPreviewError(null);
    fetchDeletionPreview(token).then(
      (loaded) => {
        if (!cancelled) setPreview(loaded);
      },
      (caught: unknown) => {
        if (!cancelled) {
          setPreviewError(
            caught instanceof Error ? caught.message : t('common.somethingWentWrongRetry'),
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wantsPreview, token, attempt, t]);

  const close = () => setDialog(null);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'photo':
      return (
        <PhotoDialog
          file={dialog.file}
          busy={avatar.busy}
          error={avatar.error}
          onCancel={close}
          onUse={(blob, mimeType) => {
            void avatar.upload(blob, mimeType).then((uploaded) => {
              if (uploaded) close();
            });
          }}
        />
      );
    case 'password':
      return <ChangePasswordDialog token={token} email={email} onClose={close} onChanged={close} />;
    case 'addPassword':
      return security ? (
        <AddPasswordDialog token={token} security={security} onClose={close} />
      ) : null;
    case 'accounts':
      return security ? <ConnectedAccountsDialog security={security} onClose={close} /> : null;
    case 'sessions':
      return security ? <SessionsDialog security={security} onClose={close} /> : null;
    case 'delete':
      return deleteAccount ? (
        <DeleteAccountDialog
          token={token}
          userId={userId}
          preview={preview}
          loadError={previewError}
          fallbackEmail={email}
          onRetry={() => setAttempt((n) => n + 1)}
          onClose={close}
          deleteAccount={deleteAccount}
        />
      ) : null;
    case 'members':
      return workspace && people.status === 'ready' ? (
        <MembersDialog
          workspaceName={workspace.name}
          workspaceId={workspace.id}
          people={people}
          userId={userId}
          viewerRole={role}
          plan={workspace.plan}
          onClose={close}
        />
      ) : null;
    case 'handover':
      return workspace && people.status === 'ready' ? (
        <HandOverDialog
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          members={people.members}
          userId={userId}
          onOffered={close}
          onClose={close}
        />
      ) : null;
    case 'leave':
      return workspace ? (
        <ConfirmDialog
          title={t('workspacePane.leaveTitle', { name: workspace.name })}
          description={t('ps.leaveBody')}
          confirmLabel={t('settings.row.leave-workspace')}
          danger
          onClose={close}
          onConfirm={async () => {
            await leaveWorkspace(workspace.id);
            // Off this workspace's boards, onto the most recent one left — or
            // a fresh workspace of their own if this was the only one.
            window.location.assign(new URL('/open', env.VITE_WEB_URL).toString());
          }}
        />
      ) : null;
  }
}
