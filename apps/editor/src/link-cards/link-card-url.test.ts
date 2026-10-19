import { describe, expect, it } from 'vitest';
import { pastedLinkCardUrl, typedLinkCardUrl } from './link-card-url';

describe('pastedLinkCardUrl', () => {
  it('takes a full web address pasted on its own', () => {
    expect(pastedLinkCardUrl('  https://example.com/post?id=1 ')).toBe(
      'https://example.com/post?id=1',
    );
    expect(pastedLinkCardUrl('http://example.com')).toBe('http://example.com/');
  });

  it('leaves words, addresses without a scheme and anything with spaces as text', () => {
    for (const text of [
      'Node.js',
      'e.g.',
      'example.com',
      'see https://example.com',
      'mailto:a@b.co',
      'javascript:alert(1)',
    ]) {
      expect(pastedLinkCardUrl(text), text).toBeNull();
    }
  });
});

describe('typedLinkCardUrl', () => {
  it('forgives a missing scheme, and refuses anything but a web page', () => {
    expect(typedLinkCardUrl('example.com/a')).toBe('https://example.com/a');
    expect(typedLinkCardUrl('someone@example.com')).toBeNull();
    expect(typedLinkCardUrl('hello')).toBeNull();
  });
});
