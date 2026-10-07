import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ShareSessionPanel,
  liveFor,
  type SharePerson,
  type ShareSessionPanelProps,
} from './ShareSession';

const noop = () => {};

const OWNER: SharePerson = {
  id: 'u1',
  name: 'Maya Chen',
  email: 'maya@example.com',
  isGuest: false,
  isOwner: true,
  role: 'owner',
  photo: null,
  you: true,
  justJoined: false,
};

const JONAH: SharePerson = {
  ...OWNER,
  id: 'u2',
  name: 'Jonah Reyes',
  email: 'jonah@example.com',
  isOwner: false,
  role: 'editor',
  you: false,
};

const GUEST: SharePerson = {
  ...OWNER,
  id: 'u3',
  name: 'Sam',
  email: 'sam-guest@example.invalid',
  isGuest: true,
  isOwner: false,
  role: 'viewer',
  you: false,
  justJoined: true,
};

const STARTED = '2026-09-29T10:00:00.000Z';
const AT = new Date('2026-09-29T10:12:05.000Z').getTime();

function render(overrides: Partial<ShareSessionPanelProps> = {}) {
  return renderToString(
    <ShareSessionPanel
      boardName="Onboarding flow"
      people={[OWNER]}
      session={null}
      url={null}
      role="editor"
      allowGuests
      onRoleChange={noop}
      onAllowGuestsChange={noop}
      busy={false}
      copied={false}
      error={null}
      onStart={noop}
      onStop={noop}
      onCopy={noop}
      onClose={noop}
      onMemberRole={noop}
      onRemoveMember={noop}
      menuContainer={null}
      now={AT}
      {...overrides}
    />,
  );
}

describe('ShareSessionPanel', () => {
  it('folds removed people under one line, out of the people list', () => {
    const html = render({
      people: [OWNER, JONAH],
      removed: [
        { id: 'u9', name: 'Ravi Kumar', email: 'ravi@example.com', isGuest: false, role: 'editor' },
      ],
      onAddBack: noop,
    });
    expect(html).toContain('data-testid="share-removed-toggle"');
    expect(html).toContain('Removed · 1');
    expect(html).toContain('aria-expanded="false"');
    // Folded until asked for, so the list of who is on the board stays that.
    expect(html).not.toContain('Ravi Kumar');
    expect(html).not.toContain('Add back');
  });

  it('has no Removed line when nobody was removed', () => {
    expect(render({ removed: [], onAddBack: noop })).not.toContain('Removed ·');
    expect(render()).not.toContain('Removed ·');
  });

  it('says the board is not being shared, and asks what people who join may do', () => {
    const html = render();
    expect(html).toContain('Not sharing yet');
    expect(html).toContain('Start a session to get a link anyone can join by.');
    expect(html).toContain('People who join can');
    expect(html).toContain('Can view');
    expect(html).toContain('Can edit');
    // The choice for the next session is marked, and it is a radio group.
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="share-role-editor"/);
    expect(html).toContain('Allow guests');
    expect(html).toContain('Start session');
    expect(html).not.toContain('Stop session');
    expect(html).not.toContain('aria-label="Session link"');
  });

  it('turns into the session once live: timer, link, code and fixed terms', () => {
    const html = render({
      session: { role: 'viewer', allowGuests: false, startedAt: STARTED, expiresAt: null },
      url: 'https://canvasflow.app/join/abc123',
      qr: <span data-testid="qr" />,
    });
    expect(html).toContain('Live for <!-- -->12:05');
    expect(html).toContain('Anyone with the link can join until you stop it.');
    expect(html).toContain('value="https://canvasflow.app/join/abc123"');
    expect(html).toContain('data-testid="qr"');
    expect(html).toContain('Can view');
    expect(html).toContain('Accounts only');
    expect(html).toContain('Set when the session started');
    expect(html).toContain('Stop session');
    expect(html).toContain('sharing is live');
    // The choices for a session only exist before one starts.
    expect(html).not.toContain('People who join can');
    expect(html).not.toContain('data-testid="share-start"');
  });

  it('says so when the link was made in another browser', () => {
    const html = render({
      session: { role: 'editor', allowGuests: true, startedAt: STARTED, expiresAt: null },
      url: null,
      qr: <span data-testid="qr" />,
    });
    expect(html).toContain('placeholder="Link created in another browser"');
    expect(html).toContain('Stop and start again to get the link here');
    expect(html).not.toContain('data-testid="qr"');
    expect(html).toMatch(/disabled=""[^>]*data-testid="share-copy"/);
  });

  it('names the expiry when a link has one', () => {
    const html = render({
      session: {
        role: 'editor',
        allowGuests: true,
        startedAt: STARTED,
        expiresAt: '2026-10-06T10:00:00.000Z',
      },
      url: 'https://canvasflow.app/join/abc123',
    });
    expect(html).toContain('until 6 Oct 2026, or until you stop it');
  });

  it('lists everyone, marking the owner, you, guests and who just joined', () => {
    const html = render({ people: [OWNER, JONAH, GUEST] });
    expect(html).toContain('3 members');
    expect(html).toContain('Owner');
    expect(html).toContain('(you)');
    expect(html).toContain('Guest');
    expect(html).toContain('No account');
    expect(html).not.toContain('sam-guest@example.invalid');
    expect(html).toContain('Joined');
    // The owner's role is not something to change; everyone else's is.
    expect(html).toContain('aria-label="Role for Jonah Reyes"');
    expect(html).toContain('aria-label="Role for Sam"');
    expect(html).not.toContain('aria-label="Role for Maya Chen"');
  });

  it('shows an error in place of the footer line', () => {
    const html = render({ error: 'Only the board owner can share this board.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Only the board owner can share this board.');
  });
});

describe('liveFor', () => {
  const at = (iso: string) => new Date(iso).getTime();
  it('counts minutes and seconds within the hour', () => {
    expect(liveFor(STARTED, at('2026-09-29T10:00:07Z'))).toBe('0:07');
    expect(liveFor(STARTED, at('2026-09-29T10:59:59Z'))).toBe('59:59');
  });
  it('switches to hours, then days', () => {
    expect(liveFor(STARTED, at('2026-09-29T12:14:00Z'))).toBe('2 h 14 min');
    expect(liveFor(STARTED, at('2026-09-30T10:00:00Z'))).toBe('1 day');
    expect(liveFor(STARTED, at('2026-10-03T11:00:00Z'))).toBe('4 days');
  });
  it('never counts backwards', () => {
    expect(liveFor(STARTED, at('2026-09-29T09:59:00Z'))).toBe('0:00');
  });
});
