import { describe, expect, it } from 'vitest';
import { PREVIEW_IMAGE_NAME, sniffPreviewImage } from './preview-image.js';

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0x03,
  ]);
}

describe('sniffPreviewImage', () => {
  it('knows the four raster formats by their bytes, with their size', () => {
    expect(sniffPreviewImage(png(1200, 630))).toEqual({
      mimeType: 'image/png',
      extension: 'png',
      width: 1200,
      height: 630,
    });
    expect(sniffPreviewImage(jpeg(480, 360))).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 480,
      height: 360,
    });
    const gif = Buffer.from('GIF89a\x40\x01\xf0\x00', 'latin1');
    expect(sniffPreviewImage(gif)).toMatchObject({ extension: 'gif', width: 320, height: 240 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBPVP8X', 8, 'ascii');
    webp.writeUIntLE(799, 24, 3);
    webp.writeUIntLE(599, 27, 3);
    expect(sniffPreviewImage(webp)).toMatchObject({ extension: 'webp', width: 800, height: 600 });
  });

  it('keeps no SVG, page or anything else, whatever it was labelled', () => {
    expect(
      sniffPreviewImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
    ).toBeNull();
    expect(sniffPreviewImage(Buffer.from('<!doctype html><title>x</title>'))).toBeNull();
    expect(sniffPreviewImage(Buffer.alloc(0))).toBeNull();
  });

  it('reads an absurd size as unknown rather than trusting it', () => {
    expect(sniffPreviewImage(png(100_000, 10))).toMatchObject({ width: null, height: null });
  });
});

describe('PREVIEW_IMAGE_NAME', () => {
  it('names a hash and an extension, and nothing that could leave the folder', () => {
    expect(PREVIEW_IMAGE_NAME.test(`${'a'.repeat(64)}.png`)).toBe(true);
    expect(PREVIEW_IMAGE_NAME.test(`../${'a'.repeat(64)}.png`)).toBe(false);
    expect(PREVIEW_IMAGE_NAME.test(`${'a'.repeat(64)}.svg`)).toBe(false);
  });
});
