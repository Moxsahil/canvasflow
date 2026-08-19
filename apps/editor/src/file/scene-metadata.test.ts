import { describe, expect, it } from 'vitest';
import encodeChunks from 'png-chunks-encode';
import extractChunks from 'png-chunks-extract';
import {
  embedSceneInPng,
  embedSceneInSvg,
  extractSceneFromPng,
  extractSceneFromSvg,
  SCENE_METADATA_KEY,
} from './scene-metadata';

/**
 * A structurally valid PNG with no pixels worth speaking of. The chunk
 * libraries only care about the container, so this exercises the real encode
 * and decode paths without needing a canvas.
 */
function blankPng(): Blob {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 1); // width
  view.setUint32(4, 1); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const bytes = encodeChunks([
    { name: 'IHDR', data: ihdr },
    { name: 'IEND', data: new Uint8Array() },
  ]);
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}

const scene = JSON.stringify({ type: 'canvasflow/board', version: 1, shapes: [] });

describe('PNG scene embedding', () => {
  it('round-trips a board through a PNG', async () => {
    const embedded = await embedSceneInPng(blankPng(), scene);
    const bytes = new Uint8Array(await embedded.arrayBuffer());
    expect(extractSceneFromPng(bytes)).toBe(scene);
  });

  it('keeps IEND last, as the format requires', async () => {
    const embedded = await embedSceneInPng(blankPng(), scene);
    const chunks = extractChunks(new Uint8Array(await embedded.arrayBuffer()));
    expect(chunks[chunks.length - 1]?.name).toBe('IEND');
    expect(chunks.some((chunk) => chunk.name === 'tEXt')).toBe(true);
  });

  it('survives text a Latin-1 chunk could not hold', async () => {
    // The reason the payload is base64 rather than raw JSON.
    const unicode = JSON.stringify({ shapes: [{ text: 'héllo 🌍 — ünïcode' }] });
    const embedded = await embedSceneInPng(blankPng(), unicode);
    const bytes = new Uint8Array(await embedded.arrayBuffer());
    expect(extractSceneFromPng(bytes)).toBe(unicode);
  });

  it('returns null for a PNG with no board in it', async () => {
    const bytes = new Uint8Array(await blankPng().arrayBuffer());
    expect(extractSceneFromPng(bytes)).toBeNull();
  });

  it('returns null for bytes that are not a PNG at all', () => {
    expect(extractSceneFromPng(new TextEncoder().encode('nope, just text'))).toBeNull();
  });

  it('stores the payload under the documented keyword', async () => {
    const embedded = await embedSceneInPng(blankPng(), scene);
    const chunks = extractChunks(new Uint8Array(await embedded.arrayBuffer()));
    const text = chunks.find((chunk) => chunk.name === 'tEXt');
    expect(new TextDecoder('latin1').decode(text!.data)).toContain(SCENE_METADATA_KEY);
  });
});

describe('SVG scene embedding', () => {
  const svg =
    '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  it('round-trips a board through an SVG', () => {
    const embedded = embedSceneInSvg(svg, scene);
    expect(extractSceneFromSvg(embedded)).toBe(scene);
  });

  it('leaves the document parseable, with the payload before the root', () => {
    const embedded = embedSceneInSvg(svg, scene);
    expect(embedded.indexOf('<!-- canvasflow-scene:')).toBeLessThan(embedded.indexOf('<svg'));
    expect(embedded.startsWith('<?xml')).toBe(true);
  });

  it('returns null for an SVG with no board in it', () => {
    expect(extractSceneFromSvg(svg)).toBeNull();
  });
});
