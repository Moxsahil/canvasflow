import { describe, expect, it } from 'vitest';
import { createEmbed, resolveEmbed } from '@canvasflow/canvas-engine';
import {
  embedBoxFromDrag,
  embedPopoverPlacement,
  embedSandbox,
  embedScreenBox,
  inEmbedMiddle,
  onBoard,
} from './embed-frame';

const embed = createEmbed({
  id: 'a',
  x: 100,
  y: 100,
  width: 600,
  height: 300,
  url: 'https://youtu.be/dQw4w9WgXcQ',
});

describe('embedSandbox', () => {
  it('lets a page from its own site keep its origin, and never lets it reach the board', () => {
    const frame = resolveEmbed('https://youtu.be/dQw4w9WgXcQ')!.frame;
    const tokens = embedSandbox(frame).split(' ');
    expect(tokens).toEqual(expect.arrayContaining(['allow-scripts', 'allow-same-origin']));
    for (const reach of [
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-modals',
      'allow-downloads',
      'allow-popups-to-escape-sandbox',
    ]) {
      expect(tokens).not.toContain(reach);
    }
  });

  it('never gives a page written here an origin of its own', () => {
    const frame = resolveEmbed('https://gist.github.com/someone/0123456789abcdef0123')!.frame;
    expect(embedSandbox(frame)).not.toContain('allow-same-origin');
  });
});

describe('embedScreenBox', () => {
  it('puts the box where the camera shows it', () => {
    expect(embedScreenBox(embed, { x: 50, y: 20, zoom: 2 })).toEqual({
      x: 100,
      y: 160,
      width: 1200,
      height: 600,
    });
  });

  it('is on the board while any of it is', () => {
    const board = { width: 1200, height: 800 };
    expect(onBoard({ x: -50, y: 10, width: 60, height: 10 }, board)).toBe(true);
    expect(onBoard({ x: 1300, y: 10, width: 60, height: 10 }, board)).toBe(false);
  });
});

describe('inEmbedMiddle', () => {
  it('is the middle third both ways, leaving the rest of the box to the board', () => {
    expect(inEmbedMiddle(embed, 400, 250)).toBe(true);
    expect(inEmbedMiddle(embed, 300, 200)).toBe(true);
    expect(inEmbedMiddle(embed, 299, 250)).toBe(false);
    expect(inEmbedMiddle(embed, 400, 120)).toBe(false);
  });
});

describe('embedBoxFromDrag', () => {
  it('takes a drag as drawn, kept to the smallest usable size', () => {
    expect(embedBoxFromDrag({ x: 300, y: 200 }, { x: 100, y: 150 }, 1, 80)).toEqual({
      x: 100,
      y: 150,
      width: 200,
      height: 80,
      clicked: false,
    });
  });

  it('places a video-sized box centred on a click', () => {
    expect(embedBoxFromDrag({ x: 500, y: 400 }, { x: 502, y: 401 }, 1, 80)).toEqual({
      x: 220,
      y: 242.5,
      width: 560,
      height: 315,
      clicked: true,
    });
  });

  it('measures the slop on screen, so a drag at a far zoom is still a drag', () => {
    expect(embedBoxFromDrag({ x: 0, y: 0 }, { x: 40, y: 30 }, 0.25, 80).clicked).toBe(false);
    expect(embedBoxFromDrag({ x: 0, y: 0 }, { x: 4, y: 0 }, 1, 80).clicked).toBe(true);
  });
});

describe('embedPopoverPlacement', () => {
  const board = { width: 1200, height: 800 };
  const popover = { width: 320, height: 80 };

  it('sits under the box while there is room above the toolbar', () => {
    expect(
      embedPopoverPlacement({ x: 400, y: 100, width: 400, height: 225 }, popover, board, 68),
    ).toEqual({
      left: 440,
      top: 335,
    });
  });

  it('goes over the box near the bottom, and inside it when neither side has room', () => {
    expect(
      embedPopoverPlacement({ x: 400, y: 400, width: 400, height: 300 }, popover, board, 68).top,
    ).toBe(310);
    expect(
      embedPopoverPlacement({ x: 0, y: 20, width: 1200, height: 760 }, popover, board, 68).top,
    ).toBe(64);
  });
});
