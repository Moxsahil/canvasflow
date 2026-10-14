import { describe, expect, it } from 'vitest';
import { sanitizeShape } from '../src/sanitize/sanitize-shape';

const FILE = 'a'.repeat(64);

const image = (extra: Record<string, unknown> = {}) => ({
  kind: 'image',
  id: 'old',
  x: 10,
  y: 20,
  width: 200,
  height: 100,
  fileId: FILE,
  mimeType: 'image/png',
  naturalWidth: 400,
  naturalHeight: 200,
  status: 'saved',
  ...extra,
});

describe('sanitizeShape: images', () => {
  it('drops an image whose bytes did not come along', () => {
    expect(sanitizeShape(image(), () => 'n')).toBeNull();
    expect(
      sanitizeShape(image(), () => 'n', { imageFileIds: new Set(['b'.repeat(64)]) }),
    ).toBeNull();
  });

  it('keeps an image whose bytes came along, as not yet uploaded here', () => {
    const shape = sanitizeShape(image({ flipX: true }), () => 'n', {
      imageFileIds: new Set([FILE]),
    });
    expect(shape).toMatchObject({
      kind: 'image',
      id: 'n',
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      fileId: FILE,
      mimeType: 'image/png',
      naturalWidth: 400,
      naturalHeight: 200,
      status: 'pending',
      flipX: true,
    });
    expect(shape).not.toHaveProperty('flipY');
  });

  it('refuses a format a board cannot hold, and missing sizes', () => {
    const files = { imageFileIds: new Set([FILE]) };
    expect(sanitizeShape(image({ mimeType: 'text/html' }), () => 'n', files)).toBeNull();
    expect(sanitizeShape(image({ naturalWidth: 'wide' }), () => 'n', files)).toBeNull();
    expect(sanitizeShape(image({ height: undefined }), () => 'n', files)).toBeNull();
  });
});
