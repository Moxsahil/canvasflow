import { describe, expect, it } from 'vitest';
import {
  catalogueCredit,
  catalogueFileUrl,
  cataloguePreviewUrl,
  parseCatalogue,
} from './library-catalogue';

const entry = {
  id: '6TGNPXCpuVy',
  name: 'R Icons',
  description: 'R and RStudio icons.',
  authors: [{ name: 'Jumping Rivers', url: 'https://www.jumpingrivers.com' }],
  source: 'jumpingrivers/r.excalidrawlib',
  preview: 'jumpingrivers/r.png',
  updated: '2021-08-22',
};

describe('parseCatalogue', () => {
  it('keeps good entries, newest first', () => {
    const older = { ...entry, id: 'older', updated: '2020-01-01' };
    const libraries = parseCatalogue([older, entry]);
    expect(libraries.map((library) => library.id)).toEqual(['6TGNPXCpuVy', 'older']);
    expect(libraries[0]?.authors[0]).toEqual({
      name: 'Jumping Rivers',
      url: 'https://www.jumpingrivers.com',
    });
  });

  it('drops an entry whose file is not inside the catalogue, or that has no name', () => {
    expect(parseCatalogue([{ ...entry, source: '../../x.excalidrawlib' }])).toEqual([]);
    expect(parseCatalogue([{ ...entry, source: 'https://evil.example/x.excalidrawlib' }])).toEqual(
      [],
    );
    expect(parseCatalogue([{ ...entry, name: '' }])).toEqual([]);
    expect(parseCatalogue('nope')).toEqual([]);
  });

  it('names an entry with no id of its own after its file', () => {
    const { id: _id, ...noId } = entry;
    expect(parseCatalogue([noId])[0]?.id).toBe('jumpingrivers-r');
  });

  it('keeps an author link only when it is a web address', () => {
    const [library] = parseCatalogue([
      { ...entry, authors: [{ name: 'A', url: 'javascript:alert(1)' }] },
    ]);
    expect(library?.authors[0]?.url).toBeNull();
  });
});

describe('catalogue addresses', () => {
  it('builds addresses only inside the catalogue', () => {
    expect(catalogueFileUrl('jumpingrivers/r.excalidrawlib')).toBe(
      'https://libraries.excalidraw.com/libraries/jumpingrivers/r.excalidrawlib',
    );
    expect(catalogueFileUrl('../r.excalidrawlib')).toBeNull();
    expect(cataloguePreviewUrl('jumpingrivers/r.png')).toBe(
      'https://libraries.excalidraw.com/libraries/jumpingrivers/r.png',
    );
    expect(cataloguePreviewUrl('x/../../y.png')).toBeNull();
    expect(cataloguePreviewUrl(null)).toBeNull();
  });

  it('credits one author, two, or more', () => {
    const a = { name: 'Ada', url: null };
    const g = { name: 'Grace', url: null };
    const l = { name: 'Alan', url: null };
    expect(catalogueCredit([a])).toBe('Ada');
    expect(catalogueCredit([a, g])).toBe('Ada and Grace');
    expect(catalogueCredit([a, g, l])).toBe('Ada, Grace and Alan');
    expect(catalogueCredit([])).toBe('');
  });
});
