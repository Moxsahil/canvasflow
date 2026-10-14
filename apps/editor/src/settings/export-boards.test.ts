import { describe, expect, it } from 'vitest';
import { exportFileName, exportSummary, uniqueFileNames, type BoardsExport } from './export-boards';

describe('uniqueFileNames', () => {
  it('numbers repeated titles in order, ignoring case', () => {
    expect(
      uniqueFileNames(
        ['Untitled board', 'Plan', 'untitled board', 'Untitled board'],
        '.canvasflow',
      ),
    ).toEqual([
      'Untitled board.canvasflow',
      'Plan.canvasflow',
      'untitled board (2).canvasflow',
      'Untitled board (3).canvasflow',
    ]);
  });

  it('keeps a title usable as a file name', () => {
    expect(uniqueFileNames(['Q1: roadmap/v2', '   '], '.canvasflow')).toEqual([
      'Q1- roadmap-v2.canvasflow',
      'board.canvasflow',
    ]);
  });
});

describe('exportFileName', () => {
  it('names the archive by the local date', () => {
    expect(exportFileName(new Date(2026, 9, 4))).toBe('canvasflow-export-2026-10-04.zip');
  });
});

describe('exportSummary', () => {
  const base: BoardsExport = {
    blob: new Blob([]),
    fileName: 'x.zip',
    boards: 3,
    failedBoards: [],
    missingImages: 0,
    libraryItems: 0,
    libraryFailed: false,
  };

  it('says what the download holds', () => {
    expect(exportSummary(base)).toBe('Downloaded 3 boards');
    expect(exportSummary({ ...base, boards: 1, libraryItems: 4 })).toBe(
      'Downloaded 1 board and your library',
    );
  });

  it('owns up to anything left out', () => {
    expect(
      exportSummary({ ...base, failedBoards: ['A'], missingImages: 2, libraryFailed: true }),
    ).toBe(
      'Downloaded 3 boards · 1 board couldn’t be read · 2 images couldn’t be fetched · your library couldn’t be read',
    );
  });
});
