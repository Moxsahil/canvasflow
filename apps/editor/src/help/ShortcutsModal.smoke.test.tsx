import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShortcutsModal } from './ShortcutsModal';
import { SHORTCUTS } from './shortcuts-registry';

const noop = () => {};

describe('ShortcutsModal', () => {
  it('renders nothing while closed', () => {
    expect(renderToString(<ShortcutsModal open={false} onClose={noop} theme="dark" />)).toBe('');
  });

  it('shows every shortcut on one page, in its categories, with no tabs', () => {
    const html = renderToString(<ShortcutsModal open onClose={noop} theme="dark" />);
    const total = SHORTCUTS.reduce((count, category) => count + category.entries.length, 0);
    expect(html.match(/data-shortcut="/g)).toHaveLength(total);
    for (const category of ['Tools', 'File', 'Edit', 'Arrange', 'Search', 'View']) {
      expect(html).toContain(`aria-label="${category}"`);
    }
    expect(html).not.toContain('role="tab"');
    expect(html).toContain(`${total} shortcuts · keys shown for`);
    expect(html).toContain('data-shortcut="shift+h"');
    expect(html).toContain('data-shortcut="shift+v"');
    expect(html).toContain('Flip horizontal');
    expect(html).toContain('Flip vertical');
    expect(html).toContain('aria-label="Search shortcuts"');
    expect(html).toContain('Press any shortcut to find it');
  });
});
