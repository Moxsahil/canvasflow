import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountPane } from './AccountPane';
import { BillingPane } from './BillingPane';
import { NotificationsPane } from './NotificationsPane';
import { PrivacyPane } from './PrivacyPane';
import { ProfilePane } from './ProfilePane';
import { SettingsDialog } from './SettingsDialog';
import { WorkspacePane } from './WorkspacePane';
import { CURSOR_COLORS, SETTINGS_SECTIONS } from './settings-sections';

const noop = () => {};

/**
 * One pane on its own. The dialog shows the selected one and keeps that choice
 * to itself, so a pane is reached here directly rather than through a click the
 * server renderer cannot make.
 */
function renderPane(id: string) {
  const panes: Record<string, JSX.Element> = {
    profile: <ProfilePane user={null} onClose={noop} />,
    account: <AccountPane onClose={noop} />,
    workspace: <WorkspacePane onClose={noop} />,
    notifications: <NotificationsPane onClose={noop} />,
    billing: <BillingPane onClose={noop} />,
    privacy: <PrivacyPane onClose={noop} />,
  };
  return renderToString(panes[id]!);
}

function render(
  user: { name: string; email: string | null } | null = {
    name: 'Sahil Barak',
    email: 'sahil@example.com',
  },
  theme: 'light' | 'dark' = 'dark',
) {
  return renderToString(<SettingsDialog user={user} theme={theme} onClose={noop} />);
}

describe('SettingsDialog', () => {
  it('rails all six sections, with Profile the one selected', () => {
    const html = render();
    for (const { label } of SETTINGS_SECTIONS) {
      expect(html).toContain(label.replace('&', '&amp;'));
    }
    // The current section is marked on the row, not just coloured in.
    expect(html).toContain('aria-current="page"');
  });

  it('opens on the Profile pane', () => {
    const html = render();
    expect(html).toContain('How you appear to collaborators on shared boards.');
    expect(html).toContain('Display name');
    expect(html).toContain('Cursor colour');
  });

  it('gives every section a pane, none of them a placeholder', () => {
    // One pane renders at a time, so each is checked on its own — the point is
    // that no section is left saying it has not been built.
    for (const [id, marker] of [
      ['account', 'Sign-in methods, active sessions, and account deletion.'],
      ['workspace', 'Members, roles, and workspace-level settings.'],
      ['notifications', 'Choose what CanvasFlow emails you about.'],
      ['billing', 'Plan, seats, usage, and invoice history.'],
      ['privacy', 'Export your boards or close your account.'],
    ] as const) {
      const pane = renderPane(id);
      expect(pane, id).toContain(marker);
      expect(pane, id).not.toContain('not built yet');
    }
  });

  it('carries the same footer on every pane', () => {
    for (const id of ['profile', 'account', 'workspace', 'notifications', 'billing', 'privacy']) {
      expect(renderPane(id), id).toContain('Changes save to your account, not this board.');
    }
  });

  it('starts the notification switches where the design left them', () => {
    const pane = renderPane('notifications');
    // Two of the five are on: the ones about someone else reaching you.
    expect(pane.match(/aria-checked="true"/g)).toHaveLength(2);
    expect(pane.match(/aria-checked="false"/g)).toHaveLength(3);
  });

  it('fills the storage meter to the reading beside it', () => {
    const pane = renderPane('billing');
    expect(pane).toContain('48 MB of 100 MB');
    expect(pane).toContain('width:48%');
  });

  it('seeds the display name from the account, and its initial from the name', () => {
    const html = render();
    expect(html).toContain('value="Sahil Barak"');
    expect(html).toContain('>S</div>');
  });

  it('falls back to a placeholder name before the token decodes', () => {
    const html = render(null);
    expect(html).toContain('value="Account"');
  });

  it('carries a whole palette for each theme, not a dark one with patches', () => {
    // The design is stated in dark; light mirrors it by role. Both are declared
    // on the root, so nothing inside needs to know which theme it is painting.
    const dark = render(undefined, 'dark');
    expect(dark).toContain('--surface-panel:#1a1a19');
    expect(dark).toContain('--surface-card:#131313');
    expect(dark).toContain('--surface-fg:#f2f2f2');

    const light = render(undefined, 'light');
    expect(light).toContain('--surface-panel:#ffffff');
    expect(light).toContain('--surface-card:#fafaf9');
    expect(light).toContain('--surface-fg:#1a1a19');

    // The accent means "selected/primary/you" in both, so it does not move.
    expect(dark).toContain('--surface-accent:#3b82f6');
    expect(light).toContain('--surface-accent:#3b82f6');
  });

  it('offers the design’s eight cursor colours, the first one checked', () => {
    const html = render();
    for (const color of CURSOR_COLORS) {
      expect(html).toContain(`aria-label="${color}"`);
    }
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
});
