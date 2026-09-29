import { renderToString } from 'react-dom/server';
import { TERMS_VERSION } from '@canvasflow/types';
import { describe, expect, it } from 'vitest';
import { AccountPane } from './AccountPane';
import { BillingPane } from './BillingPane';
import { NotificationsPane } from './NotificationsPane';
import { PrivacyPane } from './PrivacyPane';
import { ProfilePane } from './ProfilePane';
import { SettingsDialog } from './SettingsDialog';
import { WorkspacePane } from './WorkspacePane';
import { SETTINGS_INDEX, SETTINGS_SECTIONS, searchSettings } from './settings-sections';
import { PRESENCE_PALETTE } from '@canvasflow/canvas-engine';
import type { AvatarState, Profile, ProfileState } from '../profile';

const noop = () => {};

/** A profile that has already loaded, for the pages that read one. */
const SAVED: Profile = {
  id: 'u1',
  name: 'Sahil Saved',
  email: 'sahil@example.com',
  avatarUrl: null,
  isGuest: false,
  cursorColor: 'teal',
  avatarVersion: null,
  avatarUploaded: false,
  emailVerified: true,
  termsVersion: null,
};

function accountStub(profile: Profile | null = null): ProfileState {
  return {
    profile,
    loading: false,
    saving: false,
    error: null,
    save: async () => true,
    reload: async () => {},
    acceptTerms: async () => {},
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

const USER = { name: 'Sahil Barak', email: 'sahil@example.com' };

/**
 * One tab's page on its own. The window shows the selected one and keeps that
 * choice to itself, so a page is reached here directly rather than through a
 * click the server renderer cannot make.
 */
function renderPane(id: string) {
  const panes: Record<string, JSX.Element> = {
    profile: <ProfilePane user={null} account={accountStub()} avatar={avatarStub()} theme="dark" />,
    account: <AccountPane token={null} user={USER} account={accountStub(SAVED)} />,
    workspace: <WorkspacePane />,
    notifications: <NotificationsPane />,
    billing: <BillingPane />,
    privacy: <PrivacyPane deleteAccount={async () => {}} />,
  };
  return renderToString(panes[id]!);
}

function render(
  user: { name: string; email: string | null } | null = USER,
  theme: 'light' | 'dark' = 'dark',
  account: ProfileState = accountStub(),
  avatar: AvatarState = avatarStub(),
) {
  return renderToString(
    <SettingsDialog
      user={user}
      token={null}
      account={account}
      avatar={avatar}
      theme={theme}
      onClose={noop}
    />,
  );
}

describe('SettingsDialog', () => {
  it('puts the six sections in a row of tabs, with Profile selected', () => {
    const html = render();
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(SETTINGS_SECTIONS.length);
    for (const { id, label } of SETTINGS_SECTIONS) {
      expect(html).toContain(label.replace('&', '&amp;'));
      expect(html).toContain(`data-testid="settings-tab-${id}"`);
    }
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true"[^>]*data-testid="settings-tab-profile"/);
    expect(html).toContain('role="tabpanel"');
  });

  it('opens on Profile, with its groups as bands rather than boxes', () => {
    const html = render();
    expect(html).toContain('How you appear to collaborators on shared boards.');
    for (const band of ['Identity', 'Presence']) {
      expect(html).toContain(`aria-label="${band}"`);
    }
    expect(html).toContain('Your photo, your name and the handle people @mention.');
    expect(html).toContain('Display name');
    expect(html).toContain('Cursor colour');
  });

  it('has no footer and no rail: everything saves where it is changed', () => {
    const html = render();
    expect(html).not.toContain('Save changes');
    expect(html).not.toContain('Changes save to your account, not this board.');
    expect(html).not.toContain('aria-current="page"');
    expect(html).not.toContain('--surface-rail');
  });

  it('gives every section a page of its own', () => {
    for (const { id, lead } of SETTINGS_SECTIONS) {
      const pane = renderPane(id);
      expect(pane, id).toContain(lead);
      expect(pane, id).not.toContain('not built yet');
    }
  });

  it('keeps the address under Sign-in, beside the other ways in', () => {
    const pane = renderPane('account');
    expect(pane).toContain('aria-label="Sign-in"');
    expect(pane).toContain('aria-label="Sessions"');
    expect(pane).toContain('sahil@example.com');
    expect(pane).toContain('Verified');
    expect(pane).not.toContain('Display name');
  });

  it('has a row for every setting search can find', () => {
    const pages = SETTINGS_SECTIONS.map(({ id }) => renderPane(id)).join('');
    for (const entry of SETTINGS_INDEX) {
      expect(pages, entry.id).toContain(`data-setting="${entry.id}"`);
    }
  });

  it('searches titles, groups and other words for a setting', () => {
    expect(searchSettings('').length).toBe(0);
    expect(searchSettings('digest').map((entry) => entry.id)).toEqual([
      'weekly-digest',
      'product-updates',
    ]);
    expect(searchSettings('2fa').map((entry) => entry.id)).toEqual(['two-factor']);
    expect(searchSettings('delete').map((entry) => entry.id)).toContain('delete-account');
    // A guest has no account to delete, so it is not offered.
    expect(searchSettings('delete', { isGuest: true }).map((entry) => entry.id)).not.toContain(
      'delete-account',
    );
    expect(searchSettings('e').length).toBeLessThanOrEqual(6);
  });

  it('links to both legal pages from Data & Privacy, and says which terms were agreed to', () => {
    const agreed = renderToString(
      <PrivacyPane profile={{ ...SAVED, termsVersion: TERMS_VERSION }} />,
    );
    expect(agreed).toContain('aria-label="Legal"');
    expect(agreed).toContain('href="http://localhost:3000/terms"');
    expect(agreed).toContain('href="http://localhost:3000/privacy"');
    expect(agreed.match(/target="_blank"/g)).toHaveLength(2);
    expect(agreed).toContain('You agreed to the version of');

    // Nothing on record: the terms notice does the asking, so this only says
    // when they last changed.
    const unrecorded = renderToString(<PrivacyPane />);
    expect(unrecorded).toContain('Last updated');
    expect(unrecorded).not.toContain('You agreed');
  });

  it('offers an account Delete account, and says how long there is to change one’s mind', () => {
    const pane = renderPane('privacy');
    expect(pane).toContain('Danger zone');
    expect(pane).toContain('Deletes your account and the boards you own.');
    expect(pane).toContain('You’ll have 7 days to change your mind.');
    expect(pane).not.toContain('This cannot be undone');
  });

  it('shows a guest no Delete account, since a guest has no account to delete', () => {
    const pane = renderToString(<PrivacyPane isGuest deleteAccount={async () => {}} />);
    expect(pane).not.toContain('Danger zone');
    expect(pane).not.toContain('Delete account');
  });

  it('opens with the Delete account dialog up when the person is back from signing in again', () => {
    const dialog = renderToString(
      <SettingsDialog
        user={USER}
        token={null}
        account={accountStub()}
        avatar={avatarStub()}
        theme="dark"
        userId="u1"
        resumeDeletion
        deleteAccount={async () => {}}
        onClose={noop}
      />,
    );
    expect(dialog).toMatch(/aria-selected="true"[^>]*data-testid="settings-tab-privacy"/);
    // A dialog of its own over the window, with the page still there behind it.
    expect(dialog).toMatch(/role="dialog" aria-modal="true" aria-label="Delete your account\?"/);
    expect(dialog).toContain('aria-label="Your data"');
    expect(dialog).toContain(
      'Your account is locked and you’re signed out everywhere straight away.',
    );
    expect(dialog).toContain('mailto:support@canvasflowapp.com');
    expect(dialog).toContain('Type your email address to confirm');
    expect(dialog).not.toContain('Checking what would be deleted');
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
    expect(render(null)).toContain('value="Account"');
  });

  it('carries a whole palette for each theme, not a dark one with patches', () => {
    const dark = render(undefined, 'dark');
    expect(dark).toContain('--surface-panel:#1a1a19');
    expect(dark).toContain('--surface-wash:#222221');
    expect(dark).toContain('--surface-fg:#f2f2f2');

    const light = render(undefined, 'light');
    expect(light).toContain('--surface-panel:#ffffff');
    expect(light).toContain('--surface-wash:#f4f4f2');
    expect(light).toContain('--surface-fg:#1a1a19');

    // The accent means "selected/primary/you" in both, so it does not move.
    expect(dark).toContain('--surface-accent:#3b82f6');
    expect(light).toContain('--surface-accent:#3b82f6');
  });

  it('offers the board’s own palette, with nothing marked until a colour is picked', () => {
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

  it('marks the unbuilt rows rather than letting them look ready', () => {
    const profile = render(undefined, 'dark', accountStub(SAVED));
    expect(profile.match(/Coming soon/g)).toHaveLength(1);
    expect(profile).toContain('aria-label="Username"');
    expect(renderPane('account').match(/Coming soon/g)).toHaveLength(1);
  });

  it('disables the live fields for a guest, who has no profile to save to', () => {
    expect(render()).toContain('disabled=""');
  });

  it('shows initials until a photo resolves, and the photo once it does', () => {
    expect(render()).toContain('>SB</div>');
    const withPhoto = render(undefined, 'dark', accountStub(SAVED), avatarStub('blob:photo'));
    expect(withPhoto).toContain('src="blob:photo"');
  });

  it('offers Remove only when there is a photo to remove', () => {
    const withPhoto = render(undefined, 'dark', accountStub(SAVED), avatarStub('blob:photo'));
    const withoutPhoto = render(undefined, 'dark', accountStub(SAVED));

    expect(withPhoto).toContain('Remove');
    expect(withoutPhoto).toContain('Remove');
    expect(withoutPhoto.match(/disabled=""/g)?.length).toBeGreaterThan(
      withPhoto.match(/disabled=""/g)?.length ?? 0,
    );
  });
});
