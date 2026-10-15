import { renderToString } from 'react-dom/server';
import { TERMS_VERSION } from '@canvasflow/types';
import { describe, expect, it } from 'vitest';
import { AccountPane } from './AccountPane';
import { BillingPane } from './BillingPane';
import { NotificationsPane } from './NotificationsPane';
import { PrivacyPane } from './PrivacyPane';
import { ProfilePane } from './ProfilePane';
import { SettingsDialog } from './SettingsDialog';
import { WorkspacePane, type WorkspaceSettingsSource } from './WorkspacePane';
import { MembersDialog } from './WorkspaceDialogs';
import type { WorkspacePeople } from '../workspace/people-api';
import { t } from '../i18n';
import { SETTINGS_INDEX, SETTINGS_SECTIONS, searchSettings } from './settings-sections';
import { PRESENCE_PALETTE } from '@canvasflow/canvas-engine';
import type { AvatarState, Profile, ProfileState } from '../profile';

const noop = () => {};

/** A profile that has already loaded, for the pages that read one. */
const SAVED: Profile = {
  id: 'u1',
  name: 'Sahil Saved',
  username: 'sahil.saved',
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

/** A workspace the sidebar has loaded, with the caller in it as `role`. */
function workspaceSource(
  role: 'owner' | 'admin' | 'member' = 'owner',
): Extract<WorkspaceSettingsSource, { status: 'ready' }> {
  return {
    status: 'ready',
    workspace: {
      id: 'w1',
      name: 'Studio Boards',
      slug: 'studio-boards',
      plan: 'free',
      logoUrl: null,
      role,
      boardCount: 3,
    },
  };
}

/**
 * One tab's page on its own. The window shows the selected one and keeps that
 * choice to itself, so a page is reached here directly rather than through a
 * click the server renderer cannot make.
 */
function renderPane(id: string) {
  const panes: Record<string, JSX.Element> = {
    profile: <ProfilePane user={null} account={accountStub()} avatar={avatarStub()} theme="dark" />,
    account: <AccountPane token={null} user={USER} account={accountStub(SAVED)} />,
    workspace: <WorkspacePane source={workspaceSource()} onRename={async () => {}} />,
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
    for (const { id, labelKey } of SETTINGS_SECTIONS) {
      expect(html).toContain(t(labelKey).replace('&', '&amp;'));
      expect(html).toContain(`data-testid="settings-tab-${id}"`);
    }
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true"[^>]*data-testid="settings-tab-profile"/);
    expect(html).toContain('role="tabpanel"');
  });

  it('opens on Profile, its groups named by a caption alone, its rows led by icons', () => {
    const html = render();
    expect(html).toContain('How you appear to collaborators on shared boards.');
    for (const band of ['Identity', 'Presence']) {
      expect(html).toContain(`aria-label="${band}"`);
    }
    expect(html).not.toContain('Your photo, your name and the handle people @mention.');
    expect(html).not.toContain('How other people pick you out on a board.');
    expect(html).toContain('Display name');
    expect(html).toContain('Cursor colour');
    expect(html).toContain('lucide-type');
    expect(html).toContain('lucide-at-sign');
  });

  it('has no footer and no rail: everything saves where it is changed', () => {
    const html = render();
    expect(html).not.toContain('Save changes');
    expect(html).not.toContain('Changes save to your account, not this board.');
    expect(html).not.toContain('aria-current="page"');
    expect(html).not.toContain('--surface-rail');
  });

  it('gives every section a page of its own', () => {
    for (const { id, leadKey } of SETTINGS_SECTIONS) {
      const pane = renderPane(id);
      expect(pane, id).toContain(t(leadKey));
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

  it('shows the workspace the sidebar names, and lets its owner rename it', () => {
    const pane = renderPane('workspace');
    expect(pane).toContain('value="Studio Boards"');
    expect(pane).toContain('Owner');
    expect(pane).toContain('Full control, including deleting the workspace');
    expect(pane).toContain('Can edit');
    // Who else is in it is asked for once the page is on screen.
    expect(pane).toContain('Loading…');
    expect(pane).not.toContain('4 members');
  });

  it('shows a member the name without a field, and lets them leave', () => {
    const pane = renderToString(<WorkspacePane source={workspaceSource('member')} />);
    expect(pane).not.toContain('value="Studio Boards"');
    expect(pane).toContain('Studio Boards');
    expect(pane).toContain('Only the owner or an admin can rename it');
    expect(pane).toContain('Member');
    expect(pane).not.toContain('Coming soon');
    expect(pane).toMatch(/data-testid="workspace-leave"[^>]*>Leave</);
    expect(pane).not.toMatch(/disabled=""[^>]*data-testid="workspace-leave"/);
  });

  it('keeps the owner from leaving while it is still working out who else is here', () => {
    const pane = renderPane('workspace');
    expect(pane).toMatch(/disabled=""[^>]*data-testid="workspace-leave"/);
  });

  it('waits for the workspace list rather than inventing a workspace', () => {
    const pane = renderToString(<WorkspacePane source={{ status: 'loading' }} />);
    expect(pane).toContain('data-setting="workspace-name"');
    expect(pane).not.toContain('Sahil Barak');
  });

  it('tells a guest they are in no workspace, and search offers them none of its rows', () => {
    const pane = renderToString(<WorkspacePane source={{ status: 'none' }} />);
    expect(pane).toContain('No workspace');
    expect(pane).not.toContain('Leave workspace');
    expect(searchSettings('members', { isGuest: true })).toEqual([]);
    expect(searchSettings('members').map((entry) => entry.id)).toContain('members');
  });

  it('lists members, and keeps people let onto boards by link apart as guests', () => {
    const people: WorkspacePeople = {
      members: [
        {
          userId: 'u1',
          name: 'Sahil',
          username: 'sahil',
          email: 'sahil@example.com',
          role: 'owner',
          joinedAt: '2026-10-01T00:00:00.000Z',
          photo: null,
        },
      ],
      guests: [
        {
          userId: 'u2',
          name: 'Ravi',
          username: null,
          email: 'ravi@example.com',
          isGuest: false,
          photo: null,
          boards: [{ boardId: 'b1', title: 'Roadmap', role: 'editor' }],
        },
        {
          userId: 'u3',
          name: 'Guest 4821',
          username: null,
          email: null,
          isGuest: true,
          photo: null,
          boards: [
            { boardId: 'b1', title: 'Roadmap', role: 'viewer' },
            { boardId: 'b2', title: 'Launch', role: 'editor' },
            { boardId: 'b3', title: 'Hiring', role: 'viewer' },
          ],
        },
      ],
      invites: [],
      ownershipOffer: null,
    };
    const html = renderToString(
      <MembersDialog workspaceName="Studio" people={people} userId="u1" onClose={noop} />,
    );
    expect(html).toContain('Members · 1');
    expect(html).toContain('Guests on boards · 2');
    expect(html).toContain('Sahil<span');
    expect(html).toContain('(you)');
    expect(html).toContain('On Roadmap · ravi@example.com');
    expect(html).toContain('Can edit');
    expect(html).toContain('No account');
    expect(html).toContain('On Roadmap and 2 more boards');
    expect(html).toContain('Mixed access');

    const alone = renderToString(
      <MembersDialog
        workspaceName="Studio"
        people={{ members: people.members, guests: [], invites: [], ownershipOffer: null }}
        userId="u1"
        onClose={noop}
      />,
    );
    expect(alone).toContain('Everyone in Studio.');
    expect(alone).not.toContain('Guests on boards');
    expect(alone).not.toContain('Invite by email');
  });

  it('gives whoever runs the workspace the Invite form and the invitations still waiting', () => {
    const day = 24 * 60 * 60 * 1000;
    const people: WorkspacePeople = {
      members: [
        {
          userId: 'u1',
          name: 'Sahil',
          username: 'sahil',
          email: 'sahil@example.com',
          role: 'owner',
          joinedAt: '2026-10-01T00:00:00.000Z',
          photo: null,
        },
      ],
      guests: [],
      invites: [
        {
          id: 'i1',
          email: 'mia@example.com',
          role: 'admin',
          invitedByName: 'Sahil',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 6.5 * day).toISOString(),
          lastSentAt: new Date().toISOString(),
          expired: false,
        },
        {
          id: 'i2',
          email: 'old@example.com',
          role: 'member',
          invitedByName: 'Sahil',
          createdAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2026-09-08T00:00:00.000Z',
          lastSentAt: '2026-09-01T00:00:00.000Z',
          expired: true,
        },
      ],
      ownershipOffer: null,
    };
    const html = renderToString(
      <MembersDialog
        workspaceName="Studio"
        workspaceId="w1"
        people={people}
        userId="u1"
        viewerRole="owner"
        onClose={noop}
      />,
    );
    expect(html).toContain('Invite by email');
    expect(html).toContain('data-testid="invite-email"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="invite-role-member"/);
    expect(html).toContain('Members · 1');
    expect(html).toContain('Invited · 2');
    expect(html).toContain('mia@example.com');
    expect(html).toContain('Admin · Expires in 7 days · from Sahil');
    expect(html).toContain('Expired');
    expect(html).toContain('Send again');
    expect(html).toContain('Take back the invitation to old@example.com');

    // A member sees the same list, without the form or the invitations.
    const member = renderToString(
      <MembersDialog
        workspaceName="Studio"
        workspaceId="w1"
        people={people}
        userId="u1"
        onClose={noop}
      />,
    );
    expect(member).not.toContain('Invite by email');
    expect(member).not.toContain('mia@example.com');
  });

  it('gives managers a menu on everyone but the owner and themselves, and marks an offer', () => {
    const member = (userId: string, name: string, role: 'owner' | 'admin' | 'member') => ({
      userId,
      name,
      username: null,
      email: `${userId}@example.com`,
      role,
      joinedAt: '2026-10-01T00:00:00.000Z',
      photo: null,
    });
    const people: WorkspacePeople = {
      members: [
        member('u1', 'Olu', 'owner'),
        member('u2', 'Ada', 'admin'),
        member('u3', 'Mia', 'member'),
      ],
      guests: [],
      invites: [],
      ownershipOffer: { toUserId: 'u3', offeredAt: '2026-10-12T00:00:00.000Z' },
    };
    const render = (userId: string, viewerRole: 'owner' | 'admin' | 'member') =>
      renderToString(
        <MembersDialog
          workspaceName="Studio"
          workspaceId="w1"
          people={people}
          userId={userId}
          viewerRole={viewerRole}
          onClose={noop}
        />,
      );

    // An admin manages members and other admins — never themselves or the owner.
    const admin = render('u2', 'admin');
    expect(admin).not.toContain('data-testid="member-menu-u1"');
    expect(admin).not.toContain('data-testid="member-menu-u2"');
    expect(admin).toContain('data-testid="member-menu-u3"');

    // The owner manages both, and sees who the ownership is waiting on.
    const owner = render('u1', 'owner');
    expect(owner).toContain('data-testid="member-menu-u2"');
    expect(owner).toContain('data-testid="member-menu-u3"');
    expect(owner).toContain('Ownership offered');

    // A member manages nobody.
    expect(render('u3', 'member')).not.toContain('data-testid="member-menu-');
  });

  it('lets whoever runs the workspace set what a guest may do, or take them off', () => {
    const people: WorkspacePeople = {
      members: [
        {
          userId: 'u1',
          name: 'Olu',
          username: null,
          email: 'u1@example.com',
          role: 'owner',
          joinedAt: '2026-10-01T00:00:00.000Z',
          photo: null,
        },
      ],
      guests: [
        {
          userId: 'g1',
          name: 'Prachi',
          username: null,
          email: null,
          isGuest: true,
          photo: null,
          boards: [
            { boardId: 'b1', title: 'Roadmap', role: 'editor' },
            { boardId: 'b2', title: 'Launch', role: 'viewer' },
          ],
        },
      ],
      invites: [],
      ownershipOffer: null,
    };
    const render = (viewerRole: 'owner' | 'admin' | 'member') =>
      renderToString(
        <MembersDialog
          workspaceName="Studio"
          workspaceId="w1"
          people={people}
          userId="u1"
          viewerRole={viewerRole}
          onClose={noop}
        />,
      );

    const admin = render('admin');
    expect(admin).toContain('data-testid="guest-menu-g1"');
    expect(admin).toContain('Mixed access');
    expect(render('owner')).toContain('data-testid="guest-menu-g1"');
    expect(render('member')).not.toContain('data-testid="guest-menu-g1"');
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

  it('shows the default switches, held still, until the saved ones arrive', () => {
    const pane = renderPane('notifications');
    // Three of the five are on: the ones about other people.
    expect(pane.match(/aria-checked="true"/g)).toHaveLength(3);
    expect(pane.match(/aria-checked="false"/g)).toHaveLength(2);
    expect(pane.match(/role="switch"[^>]*disabled=""/g)).toHaveLength(5);
    expect(pane).toContain('Access changes');
  });

  it('shows a guest every switch off, with no way to turn one on', () => {
    const pane = renderToString(<NotificationsPane isGuest />);
    expect(pane.match(/aria-checked="false"/g)).toHaveLength(5);
    expect(pane.match(/role="switch"[^>]*disabled=""/g)).toHaveLength(5);
    expect(pane).toContain('Create an account to choose what CanvasFlow emails you about.');
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
      const named = entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
      expect(html).toContain(`aria-label="${named}"`);
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
    expect(render(undefined, 'dark', accountStub(SAVED))).not.toContain('Coming soon');
    expect(renderPane('account').match(/Coming soon/g)).toHaveLength(1);
  });

  it('shows the saved username after its @, ready to change', () => {
    const html = render(undefined, 'dark', accountStub(SAVED));
    expect(html).toMatch(/<label for="[^"]+"[^>]*>Username<\/label>/);
    expect(html).toContain('value="sahil.saved"');
    expect(html).toContain('Lets people find you in @mentions');
    // Nothing typed, so nothing to save or cancel yet.
    expect(html).not.toContain('aria-label="Save"');
  });

  it('keeps the username from a guest, who has no account to hold one', () => {
    const guest = render(
      undefined,
      'dark',
      accountStub({ ...SAVED, username: null, isGuest: true }),
    );
    expect(guest).toContain('Create an account to choose a username');
    expect(guest).toMatch(/placeholder="username"[^>]*disabled=""/);
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
