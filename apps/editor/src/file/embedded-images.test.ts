import { describe, expect, it } from 'vitest';
import { isImage } from '@canvasflow/canvas-engine';
import { parseBoardFile } from './board-file';
import { unpackImages } from './embedded-images';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let counter = 0;
const genId = () => `id-${(counter += 1)}`;

const image = (fileId: string) => ({
  kind: 'image',
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  fileId,
  mimeType: 'image/png',
  naturalWidth: 1,
  naturalHeight: 1,
});

function fileWith(fileId: string, dataURL = PIXEL) {
  return JSON.stringify({
    type: 'canvasflow/board',
    version: 2,
    shapes: [image(fileId), { kind: 'rectangle', x: 0, y: 0, width: 5, height: 5 }],
    files: { [fileId]: { mimeType: 'image/png', dataURL } },
  });
}

describe('unpackImages', () => {
  it('files each image under the hash of its bytes, whatever the file claimed', async () => {
    const claimed = 'a'.repeat(64);
    const { parsed, images } = await unpackImages(parseBoardFile(fileWith(claimed), genId));

    const [fileId] = [...images.keys()];
    expect(fileId).toMatch(/^[0-9a-f]{64}$/);
    expect(fileId).not.toBe(claimed);
    expect(images.get(fileId!)?.mimeType).toBe('image/png');
    const shape = parsed.shapes.find(isImage);
    expect(shape?.fileId).toBe(fileId);
    expect(parsed.shapes).toHaveLength(2);
    expect(parsed.skipped).toBe(0);
  });

  it('drops the shapes of an image whose bytes are empty, and counts them', async () => {
    const { parsed, images } = await unpackImages(
      parseBoardFile(fileWith('b'.repeat(64), 'data:image/png;base64,'), genId),
    );
    expect(images.size).toBe(0);
    expect(parsed.shapes.filter(isImage)).toHaveLength(0);
    expect(parsed.skipped).toBe(1);
  });
});
