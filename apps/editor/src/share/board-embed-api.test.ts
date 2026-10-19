import { describe, expect, it } from 'vitest';
import { embedCode, embedPageUrl } from './board-embed-api';

describe('the embed code', () => {
  it('frames the embed page on this editor', () => {
    expect(embedPageUrl('abc_DEF-123', 'https://app.example')).toBe(
      'https://app.example/embed/abc_DEF-123',
    );
    expect(embedCode('abc', 'Roadmap', 'https://app.example')).toBe(
      '<iframe src="https://app.example/embed/abc" title="Roadmap" width="800" height="500"' +
        ' style="border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe>',
    );
  });

  it('cannot be broken out of by the board’s name', () => {
    const code = embedCode('abc', '"><script>alert(1)</script> & co', 'https://app.example');
    expect(code).toContain('title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; co"');
    expect(code).not.toContain('<script>');
  });
});
