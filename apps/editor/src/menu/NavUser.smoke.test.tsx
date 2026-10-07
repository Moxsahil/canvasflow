import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavUser } from './NavUser';

const render = (user: Parameters<typeof NavUser>[0]['user']) =>
  renderToString(<NavUser user={user} portalContainer={null} />);

describe('NavUser', () => {
  it('names the account by its username under the name, once it has one', () => {
    const html = render({ name: 'Ada Lovelace', email: 'ada@example.com', username: 'ada.l' });
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('@ada.l');
    // The address is the menu's caption, not the row's second line.
    expect(html).not.toContain('ada@example.com');
  });

  it('shows the address until there is a username', () => {
    const html = render({ name: 'Ada Lovelace', email: 'ada@example.com', username: null });
    expect(html).toContain('ada@example.com');
    expect(html).not.toContain('>@');
  });
});
