import { describe, expect, it } from 'vitest';
import { cleanText, pageText, readPageMeta } from './page-meta.js';

const page = new URL('https://blog.example.com/posts/hello');

describe('readPageMeta', () => {
  it('prefers Open Graph, and makes the picture absolute', () => {
    const html = `<!doctype html><html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Hello &amp; welcome">
      <meta property="og:description" content='A first post'>
      <meta property="og:site_name" content="Example Blog">
      <meta property="og:image" content="/img/cover.png">
      </head><body><meta property="og:title" content="Not this one"></body></html>`;
    expect(readPageMeta(html, page)).toEqual({
      title: 'Hello & welcome',
      description: 'A first post',
      siteName: 'Example Blog',
      image: 'https://blog.example.com/img/cover.png',
    });
  });

  it('falls back to Twitter tags, then the title and description', () => {
    expect(
      readPageMeta(
        '<meta name="twitter:title" content="Tweeted"><meta name=twitter:image content=https://cdn.example.com/a.jpg>',
        page,
      ),
    ).toMatchObject({ title: 'Tweeted', image: 'https://cdn.example.com/a.jpg' });
    expect(
      readPageMeta(
        '<title>  Plain\n title </title><meta name="description" content="Words">',
        page,
      ),
    ).toMatchObject({ title: 'Plain title', description: 'Words', siteName: null, image: null });
  });

  it('keeps only text, and only web pictures', () => {
    const meta = readPageMeta(
      `<meta property="og:title" content="<b>Bold</b> &#x202e;reversed &#60;script&#62;">
       <meta property="og:image" content="javascript:alert(1)">`,
      page,
    );
    expect(meta.title).toBe('Bold reversed <script>');
    expect(meta.image).toBeNull();
  });
});

describe('cleanText', () => {
  it('cuts long text with an ellipsis, and gives nothing for nothing', () => {
    expect(cleanText('a'.repeat(400), 300)).toHaveLength(300);
    expect(cleanText('a'.repeat(400), 300)?.endsWith('…')).toBe(true);
    expect(cleanText('   ', 10)).toBeNull();
    expect(cleanText(null, 10)).toBeNull();
  });
});

describe('pageText', () => {
  it('reads the charset the header or the page declares', () => {
    const latin1 = Buffer.from('<title>Caf\xe9</title>', 'latin1');
    expect(pageText(latin1, 'text/html; charset=ISO-8859-1')).toContain('Café');
    const declared = Buffer.concat([Buffer.from('<meta charset="iso-8859-1">'), latin1]);
    expect(pageText(declared, 'text/html')).toContain('Café');
    expect(pageText(Buffer.from('<title>Café</title>'), 'text/html')).toContain('Café');
  });
});
