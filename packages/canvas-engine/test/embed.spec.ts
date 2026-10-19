import { createCanvas } from 'canvas';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape';
import { drawEmbedShape, embedCardLayout } from '../src/renderers/draw-embed';
import { renderSceneToSvgString } from '../src/renderers/svg-scene';
import { sanitizeShape } from '../src/sanitize/sanitize-shape';
import { shapeBounds } from '../src/shapes/bounds';
import {
  EMBED_PROVIDERS,
  createEmbed,
  parseEmbedInput,
  readStartTime,
  resolveEmbed,
} from '../src/shapes/embed';
import type { EmbedShape } from '../src/shapes/shape';

const embed = (url: string, overrides: Partial<EmbedShape> = {}) => ({
  ...createEmbed({ id: 'e1', x: 10, y: 20, width: 560, height: 315, url, seed: 1 }),
  ...overrides,
});

function src(url: string): string | undefined {
  const frame = resolveEmbed(url)?.frame;
  return frame && 'src' in frame ? frame.src : undefined;
}

function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

describe('resolveEmbed', () => {
  it('turns each kind of YouTube address into the no-cookie player', () => {
    const player = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0';
    expect(src('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(player);
    expect(src('https://youtu.be/dQw4w9WgXcQ')).toBe(player);
    expect(src('https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share')).toBe(player);
    expect(src('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(player);
    expect(src('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(player);
    expect(src('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toBe(`${player}&start=90`);
    expect(src('https://www.youtube.com/playlist?list=PL0123456789abcdef')).toBe(
      'https://www.youtube-nocookie.com/embed/videoseries?list=PL0123456789abcdef',
    );
  });

  it('places a Short tall and a song short', () => {
    const short = resolveEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    expect(short && [short.width, short.height]).toEqual([315, 560]);
    const track = resolveEmbed('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT');
    expect(track && [track.width, track.height]).toEqual([400, 152]);
    expect(src('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(
      'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT',
    );
  });

  it('builds every other site’s player from the identifiers in the address', () => {
    expect(src('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(src('https://vimeo.com/76979871/abcdef1234')).toBe(
      'https://player.vimeo.com/video/76979871?h=abcdef1234',
    );
    expect(src('https://www.loom.com/share/0123456789abcdef0123456789abcdef')).toBe(
      'https://www.loom.com/embed/0123456789abcdef0123456789abcdef',
    );
    expect(src('https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/My-file?node-id=1-2')).toBe(
      `https://www.figma.com/embed?embed_host=canvasflow&url=${encodeURIComponent(
        'https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/My-file?node-id=1-2',
      )}`,
    );
    const doc = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
    expect(src(`https://docs.google.com/document/d/${doc}/edit`)).toBe(
      `https://docs.google.com/document/d/${doc}/preview`,
    );
    expect(resolveEmbed(`https://docs.google.com/spreadsheets/d/${doc}/edit`)?.provider.id).toBe(
      'google-sheets',
    );
    expect(src(`https://docs.google.com/presentation/d/${doc}/edit#slide=id.p`)).toBe(
      `https://docs.google.com/presentation/d/${doc}/embed`,
    );
    const published = '2PACX-1vSjHt04pIKxS9JgjPfeIDWLq1GPDZxG-8HZwl_q5m_booZhVrB7Fbog';
    expect(src(`https://docs.google.com/presentation/d/e/${published}/pub?start=false`)).toBe(
      `https://docs.google.com/presentation/d/e/${published}/embed`,
    );
    expect(src(`https://docs.google.com/document/d/e/${published}/pub`)).toBe(
      `https://docs.google.com/document/d/e/${published}/pub?embedded=true`,
    );
    expect(src(`https://drive.google.com/uc?id=${doc}&export=download`)).toBe(
      `https://drive.google.com/file/d/${doc}/preview`,
    );
    expect(src(`https://docs.google.com/forms/d/e/${doc}/viewform`)).toBe(
      `https://docs.google.com/forms/d/e/${doc}/viewform?embedded=true`,
    );
    expect(src(`https://drive.google.com/file/d/${doc}/view?usp=sharing`)).toBe(
      `https://drive.google.com/file/d/${doc}/preview`,
    );
    expect(src('https://www.google.com/maps/@48.8584,2.2945,15z')).toBe(
      'https://maps.google.com/maps?q=48.8584%2C2.2945&z=15&output=embed',
    );
    expect(src('https://www.google.com/maps/place/Eiffel+Tower/@48.85,2.29,17z/data=x')).toBe(
      'https://maps.google.com/maps?q=Eiffel%20Tower&z=17&output=embed',
    );
    expect(src('https://codepen.io/someone/pen/abcDEF')).toBe(
      'https://codepen.io/someone/embed/abcDEF?default-tab=result',
    );
    expect(src('https://codesandbox.io/p/sandbox/my-app-x1y2z3')).toBe(
      'https://codesandbox.io/embed/my-app-x1y2z3',
    );
    expect(src('https://miro.com/app/board/uXjVN1a2b3c=/')).toBe(
      'https://miro.com/app/live-embed/uXjVN1a2b3c=/',
    );
    expect(src('https://www.canva.com/design/DAF1a2b3c4d/k3y_value/view')).toBe(
      'https://www.canva.com/design/DAF1a2b3c4d/k3y_value/view?embed',
    );
    expect(src('https://www.desmos.com/calculator/abcd1234')).toBe(
      'https://www.desmos.com/calculator/abcd1234?embed',
    );
  });

  it('runs a gist in a page of its own rather than loading an address', () => {
    const frame = resolveEmbed('https://gist.github.com/someone/0123456789abcdef0123')?.frame;
    expect(frame && 'srcdoc' in frame && frame.srcdoc).toContain(
      '<script src="https://gist.github.com/someone/0123456789abcdef0123.js"></script>',
    );
  });

  it('embeds nothing from a site it does not know, or one dressed up as one it does', () => {
    for (const value of [
      'https://example.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://evil-youtube.com/watch?v=dQw4w9WgXcQ',
      'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com:8443/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ',
      'data:text/html,<script>alert(1)</script>',
      'https://www.youtube.com/watch?v=too-short',
      'https://www.youtube.com/watch?v=dQw4w9WgXc"><script>',
      'https://gist.github.com/someone/not-hex"></script><script>alert(1)',
      'https://docs.google.com/forms/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789/edit',
      ' https://youtu.be/dQw4w9WgXcQ',
      `https://youtu.be/${'a'.repeat(3000)}`,
      42,
      null,
    ]) {
      expect(resolveEmbed(value), String(value)).toBeNull();
    }
  });

  it('lists each site once', () => {
    const ids = EMBED_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('readStartTime', () => {
  it('reads seconds in each spelling, and nothing as the start', () => {
    expect(readStartTime('90')).toBe(90);
    expect(readStartTime('1h2m3s')).toBe(3723);
    expect(readStartTime('45s')).toBe(45);
    expect(readStartTime('soon')).toBe(0);
    expect(readStartTime(null)).toBe(0);
  });
});

describe('parseEmbedInput', () => {
  it('adds the scheme, upgrades http and reads the address out of embed code', () => {
    expect(parseEmbedInput('youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(parseEmbedInput('  http://vimeo.com/76979871 ')).toBe('https://vimeo.com/76979871');
    expect(
      parseEmbedInput(
        '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=x&amp;start=4" title="YouTube video player"></iframe>',
      ),
    ).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?si=x&start=4');
  });

  it('refuses what no site would embed', () => {
    expect(parseEmbedInput('')).toBeNull();
    expect(parseEmbedInput('example.com')).toBeNull();
    expect(parseEmbedInput('javascript:alert(1)')).toBeNull();
    expect(parseEmbedInput('watch this video')).toBeNull();
  });
});

describe('an embed shape', () => {
  it('is its box', () => {
    expect(shapeBounds(embed('https://youtu.be/dQw4w9WgXcQ'))).toEqual({
      x: 10,
      y: 20,
      width: 560,
      height: 315,
    });
  });

  it('crosses the wire as its address and box', () => {
    const shape = embed('https://youtu.be/dQw4w9WgXcQ');
    expect(yMapToShape(integrate(shapeToYMap(shape)))).toMatchObject({
      kind: 'embed',
      url: shape.url,
      width: 560,
      height: 315,
    });
  });

  it('keeps a card whose address embeds nothing, so it can be seen and deleted', () => {
    const written = (url: unknown) => {
      const map = shapeToYMap(embed('https://youtu.be/dQw4w9WgXcQ'));
      map.set('url', url);
      return yMapToShape(integrate(map));
    };
    const read = written('javascript:alert(1)');
    expect(read?.kind).toBe('embed');
    expect(resolveEmbed((read as EmbedShape).url)).toBeNull();
    expect(written(42)).toBeNull();
  });

  it('comes in from a file only with an address a site would embed', () => {
    expect(sanitizeShape(embed('https://youtu.be/dQw4w9WgXcQ'), () => 'n')).toMatchObject({
      id: 'n',
      kind: 'embed',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(sanitizeShape(embed('https://example.com/'), () => 'n')).toBeNull();
  });

  it('exports as a card that links to the page it stands for', () => {
    const svg = renderSceneToSvgString([embed('https://youtu.be/dQw4w9WgXcQ')]);
    expect(svg).toContain('<a href="https://youtu.be/dQw4w9WgXcQ"');
    expect(svg).toContain('>YouTube</text>');
    expect(svg).not.toContain('<iframe');
  });

  it('exports an address that embeds nothing as a card with no link', () => {
    const svg = renderSceneToSvgString([embed('javascript:alert(1)')]);
    expect(svg).not.toContain('<a ');
    expect(svg).not.toContain('javascript');
  });

  it('lays the site name out only while there is room for it', () => {
    expect(embedCardLayout(embed('https://youtu.be/dQw4w9WgXcQ')).title?.text).toBe('YouTube');
    const strip = embedCardLayout(embed('https://youtu.be/dQw4w9WgXcQ', { height: 30 }));
    expect(strip.title).toBeNull();
    expect(strip.detail).toBeNull();
  });

  it('paints a card on a canvas', () => {
    const canvas = createCanvas(600, 360);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    drawEmbedShape(ctx, embed('https://youtu.be/dQw4w9WgXcQ'), false);
    // The middle of the badge is painted in its dark colour.
    const { cx, cy } = embedCardLayout(embed('https://youtu.be/dQw4w9WgXcQ')).badge;
    const [r, g, b] = ctx.getImageData(Math.round(cx - 6), Math.round(cy - 10), 1, 1).data;
    expect(r! + g! + b!).toBeLessThan(200);
  });
});
