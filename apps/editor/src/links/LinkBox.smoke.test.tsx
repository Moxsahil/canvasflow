import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LinkBox } from './LinkBox';

const noop = () => {};

// The box measures itself in a layout effect, which a server render skips and
// warns about; the markup these tests read is complete without it.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((message: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string' && message.includes('useLayoutEffect does nothing')) return;
    consoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

function render(link: string | null, options: { editing?: boolean; readOnly?: boolean } = {}) {
  return renderToString(
    <LinkBox
      link={link}
      editing={options.editing ?? false}
      readOnly={options.readOnly ?? false}
      anchor={{ x: 400, y: 300, width: 200, height: 100 }}
      board={{ width: 1200, height: 800 }}
      avoid={null}
      inputRef={createRef<HTMLInputElement>()}
      onEdit={noop}
      onSave={noop}
      onCancel={noop}
    />,
  );
}

/** The buttons in the box, by the name each is announced with. */
function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]!);
}

describe('LinkBox', () => {
  it('shows the address, opening in a tab of its own, with what can be done to it', () => {
    const html = render('https://example.com/docs');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('>example.com/docs<');
    expect(buttons(html)).toEqual(['Copy link', 'Edit link', 'Remove link']);
  });

  it('lets a viewer open and copy the link, and nothing more', () => {
    expect(buttons(render('https://example.com/', { readOnly: true }))).toEqual(['Copy link']);
  });

  it('opens the field on the current address to change it', () => {
    const html = render('https://example.com/', { editing: true });
    expect(html).toContain('data-testid="link-box-input"');
    expect(html).toContain('value="https://example.com/"');
    expect(buttons(html)).toEqual(['Save link']);
  });

  it('opens an empty field to add one', () => {
    const html = render(null, { editing: true });
    expect(html).toContain('placeholder="Paste or type a link"');
    expect(html).toContain('value=""');
  });

  it('never shows the field to a viewer', () => {
    const html = render('https://example.com/', { editing: true, readOnly: true });
    expect(html).not.toContain('link-box-input');
    expect(buttons(html)).toEqual(['Copy link']);
  });
});
