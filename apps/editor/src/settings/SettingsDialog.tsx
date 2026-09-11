import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountPane } from './AccountPane';
import { BillingPane } from './BillingPane';
import { NotificationsPane } from './NotificationsPane';
import { PrivacyPane } from './PrivacyPane';
import { ProfilePane } from './ProfilePane';
import { WorkspacePane } from './WorkspacePane';
import { SearchIcon } from './settings-icons';
import { surfaceThemeVars, type SurfaceTheme } from '../ui/surface-palette';
import type { ProfileState } from '../profile';
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settings-sections';

/**
 * The design is set in Inter. Nothing in the app loads it, so this names it
 * first and falls back to the platform's own UI face rather than shipping a
 * webfont for one dialog.
 */
const FONT_STACK = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

interface SettingsDialogProps {
  /** Seeds the profile fields. Null until the token decodes. */
  user: { name: string; email: string | null } | null;
  /** The account's saved profile. Owned by the editor, because presence reads it too. */
  account: ProfileState;
  /** The theme on screen — the dialog carries its own palette for each. */
  theme: SurfaceTheme;
  onClose: () => void;
}

/**
 * The settings dialog: a rail of sections beside the pane for the one selected.
 *
 * Mounted only while open, so every field starts from the account again rather
 * than from whatever was typed and abandoned last time.
 *
 * It carries its own surface rather than the editor's — the design states its
 * colours flatly, and this is the one window in the app that is not chrome
 * around the canvas. Both themes of that surface live in settings-palette.
 */
export function SettingsDialog({ user, account, theme, onClose }: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSectionId>('profile');
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes from anywhere inside, including the fields.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Focus moves into the dialog so the keyboard is not left behind on the
  // canvas, where the editor's own shortcuts would still be listening.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter((entry) => entry.label.toLowerCase().includes(needle));
  }, [query]);

  return (
    // The palette is declared here rather than on the panel, so the backdrop is
    // painted from the same table as everything it sits behind.
    <div
      style={{ ...surfaceThemeVars(theme), fontFamily: FONT_STACK }}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--surface-backdrop)] p-6"
      // Closing on the backdrop is bound to mousedown rather than click, so a
      // drag that starts inside a field and ends outside it does not count.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        data-testid="settings-dialog"
        data-theme-variant={theme}
        className="flex h-[660px] max-h-full w-[920px] max-w-full items-start overflow-hidden rounded-[16px] border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-[var(--surface-shadow)] outline-none"
      >
        <nav
          aria-label="Settings sections"
          className="flex h-full w-[232px] shrink-0 flex-col gap-[3px] overflow-hidden border-r border-[var(--surface-border)] bg-[var(--surface-rail)] px-[10px] pb-[12px] pt-[14px]"
        >
          <div className="flex w-full shrink-0 items-center gap-[8px] rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface-card)] px-[10px] py-[8px] focus-within:border-[var(--surface-accent)]">
            <span className="shrink-0 text-[var(--surface-fg-faint)]">
              <SearchIcon />
            </span>
            <input
              type="text"
              value={query}
              aria-label="Search settings"
              placeholder="Search settings"
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--surface-fg)] placeholder:text-[var(--surface-fg-faint)] focus:outline-none"
            />
          </div>

          <div className="h-[10px] w-full shrink-0" />

          {sections.map(({ id, label, icon: Icon }) => {
            const active = id === section;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setSection(id)}
                data-testid={`settings-nav-${id}`}
                className={`flex w-full shrink-0 items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] ${
                  active ? 'bg-[var(--surface-nav-active)]' : 'hover:bg-[var(--surface-nav-hover)]'
                }`}
              >
                <span
                  className={`shrink-0 ${
                    active ? 'text-[var(--surface-accent)]' : 'text-[var(--surface-fg-faint)]'
                  }`}
                >
                  <Icon />
                </span>
                <span
                  className={`text-[12.5px] whitespace-nowrap ${
                    active
                      ? 'font-medium text-[var(--surface-fg)]'
                      : 'text-[var(--surface-fg-muted)]'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        {section === 'profile' && (
          <ProfilePane user={user} account={account} theme={theme} onClose={onClose} />
        )}
        {section === 'account' && <AccountPane onClose={onClose} />}
        {section === 'workspace' && <WorkspacePane onClose={onClose} />}
        {section === 'notifications' && <NotificationsPane onClose={onClose} />}
        {section === 'billing' && <BillingPane onClose={onClose} />}
        {section === 'privacy' && <PrivacyPane onClose={onClose} />}
      </div>
    </div>
  );
}
