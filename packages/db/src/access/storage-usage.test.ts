import { describe, expect, it } from 'vitest';
import { storageUsageFromRow } from './storage-usage.js';

describe('storageUsageFromRow', () => {
  it('reads the bigint text the driver returns, and adds up the total', () => {
    expect(
      storageUsageFromRow({
        boards: '3',
        images: '12',
        board_bytes: '2048',
        image_bytes: '1000000',
        library_bytes: '512',
      }),
    ).toEqual({
      boards: 3,
      images: 12,
      boardBytes: 2048,
      imageBytes: 1_000_000,
      libraryBytes: 512,
      totalBytes: 1_002_560,
    });
  });

  it('reads no row as nothing stored', () => {
    expect(storageUsageFromRow(undefined).totalBytes).toBe(0);
  });
});
