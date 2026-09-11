import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountPane } from './AccountPane';
import { BillingPane } from './BillingPane';
import { NotificationsPane } from './NotificationsPane';
import { PrivacyPane } from './PrivacyPane';
import { ProfilePane } from './ProfilePane';
import { SettingsDialog } from './SettingsDialog';
import { WorkspacePane } from './WorkspacePane';
import { SETTINGS_SECTIONS } from './settings-sections';
import { PRESENCE_PALETTE } from '@canvasflow/canvas-engine';
import type { AvatarState, Profile, ProfileState } from '../profile';

const noop = () => {};

/** A profile that has already loaded, for the panes that read one. */
const SAVED: Profile = {
  id: 'u1',
  name: 'Sahil Saved',
  email: 'sahil@example.com',
  avatarUrl: null,
  isGuest: false,
  cursorColor: 'teal',
  avatarVersion: null,
  avatarUploaded: false,
};

function accountStub(profile: Profile | null = null): ProfileState {
  return {
    profile,
    loading: false,
    saving: false,
    error: null,
    save: async () => true,
    reload: async () => {},
  };
}

/** A photo that has resolved, or none at all. */
function avatarStub(url: string | null = null): AvatarState {
  return {
    url,
    busy: false,
    error: null,
    upload: async () => true,
    remove: async () => true,
  };
}

/**
 * One pane on its own. The dialog shows the selected one and keeps that choice
 * to itself, so a pane is reached here directly rather than through a click the
 * server renderer cannot make.
 */
function renderPane(id: string) {
  const panes: Record<string, JSX.Element> = {
    profile: (
      <ProfilePane
        user={null}
        account={accountStub()}
        avatar={avatarStub()}
        theme="dark"
        onClose={noop}
      />
    ),
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
  account: ProfileState = accountStub(),
  avatar: AvatarState = avatarStub(),
) {
  return renderToString(
    <SettingsDialog user={user} account={account} avatar={avatar} theme={theme} onClose={noop} />,
  );
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

  it('seeds the display name from the account, and its initials from the name', () => {
    const html = render();
    expect(html).toContain('value="Sahil Barak"');
    // One letter per name, as the share dialog's access list abbreviates people.
    expect(html).toContain('>SB</div>');
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

  it('offers the board’s own palette, with nothing marked until a colour is picked', () => {
    // The swatches are the colours collaborators actually see, so they come
    // from the presence palette rather than a second list kept beside it.
    const html = render();
    for (const entry of PRESENCE_PALETTE) {
      expect(html).toContain(`aria-label="${entry.name}"`);
    }
    // No choice yet means the colour still comes from the account id, and
    // marking a swatch would claim otherwise.
    expect(html).not.toContain('aria-checked="true"');
  });

  it('seeds the fields from the saved profile, not the token', () => {
    const html = render(undefined, 'dark', accountStub(SAVED));
    expect(html).toContain('value="Sahil Saved"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });

  it('disables the live fields for a guest, who has no profile to save to', () => {
    const html = render();
    expect(html).toContain('disabled=""');
  });

  it('shows initials until a photo resolves, and the photo once it does', () => {
    expect(render()).toContain('>SB</div>');

    const withPhoto = render(undefined, 'dark', accountStub(SAVED), avatarStub('blob:photo'));
    expect(withPhoto).toContain('src="blob:photo"');
  });

  it('offers Remove only when there is a photo to remove', () => {
    // Both buttons render either way; what changes is whether Remove can be
    // pressed, and an enabled Remove over an initial would remove nothing.
    const withPhoto = render(undefined, 'dark', accountStub(SAVED), avatarStub('blob:photo'));
    const withoutPhoto = render(undefined, 'dark', accountStub(SAVED));

    expect(withPhoto).toContain('Remove');
    expect(withoutPhoto).toContain('Remove');
    expect(withoutPhoto.match(/disabled=""/g)?.length).toBeGreaterThan(
      withPhoto.match(/disabled=""/g)?.length ?? 0,
    );
  });
});
