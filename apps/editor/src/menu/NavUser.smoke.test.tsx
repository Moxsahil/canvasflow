import { DEFAULT_PREFERENCES } from '../preferences/preferences';
import type { PreferencesState } from '../preferences/usePreferences';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavUser } from './NavUser';

const render = (user: Parameters<typeof NavUser>[0]['user']) =>
  renderToString(
    <NavUser
      user={user}
      portalContainer={null}
      theme="system"
      onThemeChange={() => {}}
      preferences={PREFERENCES}
    />,
  );

const PREFERENCES = {
  values: DEFAULT_PREFERENCES,
  set: () => {},
} as unknown as PreferencesState;

describe('NavUser', () => {
  it('names the account in the row, and leaves the rest to its menu', () => {
    const html = render({ name: 'Ada Lovelace', email: 'ada@example.com', username: 'ada.l' });
    expect(html).toContain('Ada Lovelace');
    expect(html).not.toContain('@ada.l');
    expect(html).not.toContain('ada@example.com');
  });

  it('says nobody is signed in on the local board, and offers an account', () => {
    const html = renderToString(
      <NavUser
        user={null}
        actions={{ signIn: () => {}, signUp: () => {} }}
        portalContainer={null}
        theme="system"
        onThemeChange={() => {}}
        preferences={PREFERENCES}
      />,
    );
    expect(html).toContain('Not signed in');
    expect(html).toContain('Sign in or sign up');
  });

  it('offers their own boards to someone signed in on the local board', () => {
    const html = renderToString(
      <NavUser
        user={null}
        actions={{ yourBoards: () => {} }}
        portalContainer={null}
        theme="system"
        onThemeChange={() => {}}
        preferences={PREFERENCES}
      />,
    );
    expect(html).toContain('Signed in');
    expect(html).toContain('Open your boards');
  });
});
