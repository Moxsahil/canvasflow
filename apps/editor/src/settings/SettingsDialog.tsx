import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountPane } from './AccountPane';
import { BillingPane } from './BillingPane';
import { NotificationsPane } from './NotificationsPane';
import { PrivacyPane } from './PrivacyPane';
import { ProfilePane } from './ProfilePane';
import { WorkspacePane, type WorkspaceSettingsSource } from './WorkspacePane';
import { surfaceThemeVars, type SurfaceTheme } from '../ui/surface-palette';
import type { AvatarState, ProfileState } from '../profile';
import {
  SETTINGS_SECTIONS,
  searchSettings,
  sectionLabel,
  type SettingEntry,
  type SettingsSectionId,
} from './settings-sections';
import { SettingsFrameContext } from './settings-frame';
import { BACKDROP, CloseButton, SLIDE, WINDOW } from './settings-ui';
import type { DeletionInput } from './account-deletion-api';
import { warmAccountSecurity } from './account-security-api';

/**
 * The design is set in Inter. Nothing in the app loads it, so this names it
 * first and falls back to the platform's own UI face rather than shipping a
 * webfont for one window.
 */
const FONT_STACK = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

const LOADING_WORKSPACE: WorkspaceSettingsSource = { status: 'loading' };

/** How much shorter the header gets once it folds away to just its tabs. */
const TUCK = 60;

interface SettingsDialogProps {
  /** Seeds the profile fields. Null until the token decodes. */
  user: { name: string; email: string | null } | null;
  /** Passed through to the panes, which reach the gateway with it. */
  token: string | null;
  /** The account's saved profile. Owned by the editor, because presence reads it too. */
  account: ProfileState;
  /** The photo behind that profile, which the sidebar shows as well. */
  avatar: AvatarState;
  /** The theme on screen — the window carries its own palette for each. */
  theme: SurfaceTheme;
  /** Who is signed in, for deleting the account. Null until the token decodes. */
  userId?: string | null;
  isGuest?: boolean;
  /**
   * Open at Data & Privacy with Delete account already showing: the person is
   * back from signing in again to do it.
   */
  resumeDeletion?: boolean;
  /** Ask for the account to be deleted, and leave once it is. */
  deleteAccount?: (input: DeletionInput) => Promise<void>;
  /** The workspace the sidebar is showing, for the Workspace tab. */
  workspace?: WorkspaceSettingsSource;
  /** Resolves once the name is kept; rejects with why it was not. */
  renameWorkspace?: (workspaceId: string, name: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Settings: the six sections as tabs across the top, one page at a time.
 *
 * The six sections are folder tabs in a tinted band. Each page is a stack of
 * groups — a caption with a rule, then rows that start with an icon — and
 * saves as it goes: a switch the moment it flips, a text field when its tick
 * is pressed. There is no footer and nothing waiting to be
 * saved when the window closes.
 *
 * Mounted only while open, so every field starts from the account again rather
 * than from whatever was typed and abandoned last time. It carries its own
 * surface rather than the editor's; both themes of it live in surface-palette.
 */
export function SettingsDialog({
  user,
  token,
  account,
  avatar,
  theme,
  userId = null,
  isGuest = false,
  resumeDeletion = false,
  deleteAccount,
  workspace = LOADING_WORKSPACE,
  renameWorkspace,
  onClose,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSectionId>(resumeDeletion ? 'privacy' : 'profile');
  const [direction, setDirection] = useState(1);
  // Only the first time Data & Privacy shows: leaving it and coming back is
  // an ordinary visit, not a return from signing in.
  const [deletionPending, setDeletionPending] = useState(resumeDeletion);
  const [tucked, setTucked] = useState(false);
  const [query, setQuery] = useState('');
  // Results show while the search has focus; the typed words stay when it loses it.
  const [resultsOpen, setResultsOpen] = useState(false);
  const [landing, setLanding] = useState<{ id: string; at: number } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tuckedRef = useRef(false);
  const escapes = useRef<Array<() => void>>([]);
  // Dialogs opened over the window, and where focus goes once the last one closes.
  const [modals, setModals] = useState(0);
  const modalsRef = useRef(0);
  const refocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const results = useMemo(() => searchSettings(query, { isGuest }), [query, isGuest]);
  const searching = query.trim().length > 0 && resultsOpen;

  const surface = useMemo(() => ({ ...surfaceThemeVars(theme), fontFamily: FONT_STACK }), [theme]);

  const frame = useMemo(
    () => ({
      surface,
      holdModal(opener: HTMLElement | null) {
        modalsRef.current += 1;
        setModals(modalsRef.current);
        return () => {
          modalsRef.current -= 1;
          refocus.current = opener;
          setModals(modalsRef.current);
        };
      },
      onPageScroll(scroller: HTMLElement) {
        // Tucks only when the page would still scroll with the header shorter.
        // Otherwise the page loses its scroll, the header grows back, and the
        // two take turns.
        const was = tuckedRef.current;
        const room = scroller.scrollHeight - scroller.clientHeight + (was ? TUCK : 0);
        const next = scroller.scrollTop > 8 && room > TUCK + 12;
        if (next !== was) {
          tuckedRef.current = next;
          setTucked(next);
        }
      },
      pushEscape(handler: () => void) {
        escapes.current.push(handler);
        return () => {
          const index = escapes.current.lastIndexOf(handler);
          if (index >= 0) escapes.current.splice(index, 1);
        };
      },
    }),
    [surface],
  );

  // While a dialog is up the window behind it is out of reach, to the keyboard
  // and to screen readers as well as the pointer. Once the last one goes, focus
  // returns to the button that opened it.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (modals > 0) {
      panel.setAttribute('inert', '');
      return;
    }
    panel.removeAttribute('inert');
    const target = refocus.current;
    refocus.current = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [modals]);

  // Escape backs out of whatever is newest — results, an edit, a dialog — and
  // closes the window once nothing is left. Captured and stopped, so it never
  // also reaches the canvas behind. `/` goes to search from anywhere that is
  // not already taking typing.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        const top = escapes.current[escapes.current.length - 1];
        if (top) top();
        else onCloseRef.current();
        return;
      }
      if (event.key === '/' && modalsRef.current === 0 && !isTyping(event.target)) {
        event.preventDefault();
        focusSearchRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Focus moves into the window so the keyboard is not left behind on the
  // canvas, where the editor's own shortcuts would still be listening.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Account & Security is read ahead, in case the editor has not yet: by the
  // time its tab is chosen, the answer is usually here.
  useEffect(() => {
    if (!isGuest) warmAccountSecurity(token);
    // Once, as the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The search sits in the part of the header that folds away on scroll; going
  // to it brings the page back to the top, and the header down with it.
  const focusSearch = useCallback(() => {
    if (tuckedRef.current) {
      const scroller = bodyRef.current?.querySelector<HTMLElement>('[data-settings-scroll]');
      if (scroller) scroller.scrollTop = 0;
      tuckedRef.current = false;
      setTucked(false);
      requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }
    searchRef.current?.focus();
  }, []);
  const focusSearchRef = useRef(focusSearch);
  focusSearchRef.current = focusSearch;

  const signedInAs = isGuest
    ? 'Joined as a guest'
    : (account.profile?.email ?? user?.email)
      ? `Signed in as ${account.profile?.email ?? user?.email}`
      : null;

  const clearSearch = useCallback(() => setQuery(''), []);
  useEffect(() => {
    if (!searching) return;
    return frame.pushEscape(clearSearch);
  }, [searching, frame, clearSearch]);

  const go = useCallback(
    (next: SettingsSectionId) => {
      if (next === section) return;
      const order = SETTINGS_SECTIONS.map((entry) => entry.id);
      setDirection(order.indexOf(next) > order.indexOf(section) ? 1 : -1);
      setDeletionPending(false);
      setSection(next);
      tuckedRef.current = false;
      setTucked(false);
    },
    [section],
  );

  const pick = (entry: SettingEntry) => {
    setQuery('');
    go(entry.section);
    setLanding({ id: entry.id, at: Date.now() });
  };

  // A search result opens its tab, then brings its row into view and lights it.
  // Waits for the page to finish coming in, since it is not there before that.
  useEffect(() => {
    if (!landing) return;
    const timer = setTimeout(() => {
      const row = bodyRef.current?.querySelector<HTMLElement>(
        `[data-panel="${section}"] [data-setting="${landing.id}"]`,
      );
      const scroller = row?.closest<HTMLElement>('[data-settings-scroll]');
      if (!row || !scroller) return;
      const top =
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        scroller.clientHeight / 2 +
        row.offsetHeight / 2;
      scroller.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      row.setAttribute('data-flash', '');
      setTimeout(() => row.removeAttribute('data-flash'), 900);
    }, 280);
    return () => clearTimeout(timer);
  }, [landing, section]);

  const handleTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const order = SETTINGS_SECTIONS.map((entry) => entry.id);
    const at = order.indexOf(section);
    const next =
      event.key === 'ArrowRight'
        ? order[(at + 1) % order.length]
        : event.key === 'ArrowLeft'
          ? order[(at + order.length - 1) % order.length]
          : event.key === 'Home'
            ? order[0]
            : event.key === 'End'
              ? order[order.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    go(next);
    panelRef.current
      ?.querySelector<HTMLButtonElement>(`[data-testid="settings-tab-${next}"]`)
      ?.focus();
  };

  const pane = (() => {
    switch (section) {
      case 'profile':
        return <ProfilePane user={user} account={account} avatar={avatar} theme={theme} />;
      case 'account':
        return <AccountPane token={token} user={user} account={account} />;
      case 'workspace':
        return <WorkspacePane source={workspace} userId={userId} onRename={renameWorkspace} />;
      case 'notifications':
        return <NotificationsPane />;
      case 'billing':
        return <BillingPane />;
      case 'privacy':
        return (
          <PrivacyPane
            profile={account.profile}
            token={token}
            signedInEmail={user?.email ?? null}
            userId={userId}
            isGuest={isGuest}
            startDeleting={deletionPending}
            deleteAccount={deleteAccount}
          />
        );
    }
  })();

  return (
    <MotionConfig reducedMotion="user">
      {/* The palette is declared here rather than on the window, so the
          backdrop is painted from the same table as everything it sits behind. */}
      <motion.div
        variants={BACKDROP}
        initial="hidden"
        animate="shown"
        exit="gone"
        style={surface}
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--surface-backdrop)] p-6 backdrop-blur-[3px]"
        // Closing on the backdrop is bound to mousedown rather than click, so a
        // drag that starts inside a field and ends outside it does not count.
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.div
          variants={WINDOW}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          tabIndex={-1}
          data-testid="settings-dialog"
          data-theme-variant={theme}
          className="flex h-[600px] max-h-full w-[720px] max-w-full flex-col overflow-hidden rounded-[16px] border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--surface-fg)] shadow-[var(--surface-shadow)] outline-none"
        >
          {/* A tinted band. The open tab takes the page's colour and runs into
              it, so it reads as a folder pulled forward. Once the page scrolls
              the band folds to just the tabs, with search and × beside them. */}
          <header className="relative z-[3] shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-band)] px-[16px] pt-[16px]">
            <div
              className={cn(
                'flex items-center gap-[10px] px-[4px] transition-[max-height,opacity,padding] duration-200',
                tucked
                  ? 'invisible max-h-0 overflow-hidden pb-0 opacity-0'
                  : 'max-h-[64px] pb-[14px]',
              )}
            >
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em]">Settings</h2>
                {signedInAs && (
                  <p className="mt-[2px] truncate text-[12px] text-[var(--surface-fg-muted)]">
                    {signedInAs}
                  </p>
                )}
              </div>

              <div
                className="relative w-[210px] shrink-0"
                onFocus={() => setResultsOpen(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setResultsOpen(false);
                  }
                }}
              >
                <label className="flex h-[30px] items-center gap-[8px] rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface-panel)] px-[10px] text-[var(--surface-fg-faint)] transition-colors focus-within:border-[var(--surface-accent)]">
                  <Search className="size-[14px] shrink-0" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    aria-label="Search settings"
                    placeholder="Search settings"
                    autoComplete="off"
                    spellCheck={false}
                    aria-controls="settings-search-results"
                    aria-expanded={searching}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setResultsOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && results[0]) {
                        event.preventDefault();
                        pick(results[0]);
                      }
                      if (event.key === 'ArrowDown' && results[0]) {
                        event.preventDefault();
                        panelRef.current
                          ?.querySelector<HTMLButtonElement>('[data-search-hit]')
                          ?.focus();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--surface-fg)] outline-none placeholder:text-[var(--surface-fg-faint)] [&::-webkit-search-cancel-button]:hidden"
                  />
                </label>
                {searching && (
                  <div
                    id="settings-search-results"
                    className="absolute right-0 top-[calc(100%+6px)] z-[8] grid w-[300px] gap-[2px] rounded-[10px] border border-[var(--surface-border)] bg-[var(--surface-panel)] p-[4px] shadow-[var(--surface-shadow)]"
                  >
                    {results.length === 0 ? (
                      <p className="px-[10px] py-[12px] text-center text-[12px] text-[var(--surface-fg-muted)]">
                        No setting matches that.
                      </p>
                    ) : (
                      results.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          data-search-hit
                          // Keeps focus where it is, so the list is still there
                          // when the click lands.
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => pick(entry)}
                          onKeyDown={(event) => {
                            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                            event.preventDefault();
                            const hits = Array.from(
                              panelRef.current?.querySelectorAll<HTMLButtonElement>(
                                '[data-search-hit]',
                              ) ?? [],
                            );
                            const at = hits.indexOf(event.currentTarget);
                            const next = at + (event.key === 'ArrowDown' ? 1 : -1);
                            if (next < 0) searchRef.current?.focus();
                            else hits[Math.min(next, hits.length - 1)]?.focus();
                          }}
                          className="grid gap-[1px] rounded-[7px] px-[10px] py-[7px] text-left outline-none hover:bg-[var(--surface-wash)] focus-visible:bg-[var(--surface-wash)]"
                        >
                          <span className="text-[12.5px] text-[var(--surface-fg)]">
                            {entry.title}
                          </span>
                          <small className="text-[11px] text-[var(--surface-fg-muted)]">
                            {sectionLabel(entry.section)} · {entry.group}
                          </small>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <CloseButton label="Close settings" onClick={onClose} />
            </div>

            <div className="flex items-end gap-[8px]">
              <div
                role="tablist"
                aria-label="Settings sections"
                className="-mb-px flex items-end gap-px"
              >
                {SETTINGS_SECTIONS.map(({ id, label }) => {
                  const selected = id === section;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      id={`settings-tab-${id}`}
                      aria-selected={selected}
                      aria-controls={`settings-panel-${id}`}
                      tabIndex={selected ? 0 : -1}
                      data-testid={`settings-tab-${id}`}
                      onClick={() => go(id)}
                      onKeyDown={handleTabKey}
                      className={cn(
                        'relative rounded-t-[9px] border border-b-0 px-[11px] text-[12.5px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:ring-inset',
                        selected
                          ? 'h-[36px] border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--surface-fg)] after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-[var(--surface-panel)]'
                          : 'h-[34px] border-transparent text-[var(--surface-fg-muted)] hover:bg-[color-mix(in_srgb,var(--surface-panel)_55%,transparent)] hover:text-[var(--surface-fg)]',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span
                className={cn(
                  'ml-auto flex gap-[2px] self-center pb-[2px] transition-opacity duration-200',
                  tucked ? 'opacity-100' : 'invisible opacity-0',
                )}
              >
                <button
                  type="button"
                  aria-label="Search settings"
                  title="Search settings"
                  onClick={focusSearch}
                  className="flex size-[28px] items-center justify-center rounded-[7px] text-[var(--surface-fg-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:outline-none"
                >
                  <Search className="size-[16px]" aria-hidden="true" />
                </button>
                <CloseButton label="Close settings" onClick={onClose} />
              </span>
            </div>
          </header>

          <SettingsFrameContext.Provider value={frame}>
            <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
              <AnimatePresence initial={false} custom={direction}>
                <motion.div
                  key={section}
                  custom={direction}
                  variants={SLIDE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  role="tabpanel"
                  id={`settings-panel-${section}`}
                  aria-labelledby={`settings-tab-${section}`}
                  data-panel={section}
                  className="absolute inset-0"
                >
                  {pane}
                </motion.div>
              </AnimatePresence>
            </div>
          </SettingsFrameContext.Provider>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
