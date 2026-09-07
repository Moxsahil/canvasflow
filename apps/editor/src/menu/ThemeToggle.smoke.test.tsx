import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { ThemePreference } from '../theme';
import { ThemeToggle } from './ThemeToggle';

const noop = () => {};

function render(value: ThemePreference) {
  return renderToString(
    <SidebarProvider>
      <ThemeToggle value={value} onChange={noop} />
    </SidebarProvider>,
  );
}

/** The opening tag of the `<button>` carrying `aria-label`, attribute order aside. */
function buttonTag(html: string, label: string): string {
  const tag = html
    .split('<button')
    .map((part) => part.slice(0, part.indexOf('>')))
    .find((part) => part.includes(`aria-label="${label}"`));
  return tag ?? '';
}

describe('ThemeToggle', () => {
  it('puts all three choices on screen, so none is a click away behind a section', () => {
    const html = render('system');
    expect(buttonTag(html, 'System')).not.toBe('');
    expect(buttonTag(html, 'Light')).not.toBe('');
    expect(buttonTag(html, 'Dark')).not.toBe('');
  });

  it('presses the current preference and nothing else', () => {
    const html = render('dark');
    expect(buttonTag(html, 'Dark')).toContain('aria-pressed="true"');
    expect(buttonTag(html, 'Light')).toContain('aria-pressed="false"');
    expect(buttonTag(html, 'System')).toContain('aria-pressed="false"');
  });

  it('marks system as the preference rather than the theme it resolves to', () => {
    const html = render('system');
    expect(buttonTag(html, 'System')).toContain('aria-pressed="true"');
    expect(buttonTag(html, 'Light')).toContain('aria-pressed="false"');
  });
});
