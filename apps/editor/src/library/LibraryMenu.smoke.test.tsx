import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRectangle } from '@canvasflow/canvas-engine';
import { LibraryPanel } from './LibraryMenu';
import type { LibraryPack } from './library-packs';
import type { AddedLibrary, Library, LibraryEntry } from './useLibrary';

const noop = () => {};
const resolved = () => Promise.resolve();

function entry(id: string, name: string): LibraryEntry {
  return {
    id,
    name,
    shapes: [createRectangle({ id: `${id}-r`, x: 0, y: 0, width: 40, height: 40 })],
  };
}

function library(overrides: Partial<Library> = {}): Library {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    items: [],
    recent: [],
    load: noop,
    add: () => Promise.reject(new Error('not here')),
    rename: resolved,
    remove: resolved,
    markUsed: noop,
    added: [],
    importItems: () => Promise.resolve({ imported: 0, tooLarge: 0, error: null }),
    addFromCatalogue: () => Promise.reject(new Error('not here')),
    removeAdded: resolved,
    ...overrides,
  };
}

const flowchart: LibraryPack = {
  id: 'flowchart',
  name: 'Flowchart',
  description: 'Steps and decisions.',
  items: [entry('pack:flowchart:0', 'Start / end'), entry('pack:flowchart:1', 'Process')],
};

const architecture: AddedLibrary = {
  id: 'added-1',
  catalogueId: 'abc',
  name: 'Software Architecture',
  source: 'someone/architecture.excalidrawlib',
  credit: 'Someone',
  createdAt: '2026-10-06T00:00:00.000Z',
};

type View = Parameters<typeof LibraryPanel>[0]['initialView'];

function panel(
  lib: Library,
  {
    canAdd = false,
    canPlace = true,
    view,
  }: { canAdd?: boolean; canPlace?: boolean; view?: View } = {},
) {
  return renderToString(
    <LibraryPanel
      library={lib}
      darkMode={false}
      canAdd={canAdd}
      canPlace={canPlace}
      pinned={false}
      onPin={noop}
      onAdd={resolved}
      onPlace={noop}
      onDropped={noop}
      onNotify={noop}
      container={null}
      packs={[flowchart]}
      {...(view && { initialView: view })}
    />,
  );
}

const tiles = (html: string) => html.match(/data-testid="library-tile"/g)?.length ?? 0;

describe('the library panel', () => {
  it('draws an item a tile, with its picture, newest first', () => {
    const html = panel(library({ items: [entry('b', 'Payments'), entry('a', 'Gateway')] }));
    expect(tiles(html)).toBe(2);
    expect(html.indexOf('Payments')).toBeLessThan(html.indexOf('Gateway'));
    expect(html).toContain('src="data:image/svg+xml');
    expect(html).toContain('aria-label="Place Payments"');
  });

  it('says how to start an empty library, by whether something is selected', () => {
    expect(panel(library())).toContain('Select something on the board to add it here');
    expect(panel(library(), { canAdd: true })).toContain('Add the selection to start it.');
  });

  it('offers Add selection only with something selected', () => {
    const add = (html: string) => html.match(/<button[^>]*data-testid="library-add"[^>]*>/)![0];
    expect(add(panel(library()))).toContain(' disabled=""');
    expect(add(panel(library(), { canAdd: true }))).not.toContain(' disabled=""');
  });

  it('lists the packs, the added libraries and Browse, with only Workspace still to come', () => {
    const html = panel(library({ added: [architecture] }));
    for (const label of ['Flowchart', 'Software Architecture', 'Workspace', 'Browse libraries']) {
      expect(html).toContain(label);
    }
    expect(html.match(/>Soon</g)).toHaveLength(1);
    expect(html).toContain('>Added<');
    expect(panel(library())).not.toContain('>Added<');
  });

  it('shows a pack’s items, each of which can be kept in Personal', () => {
    const html = panel(library(), { view: { kind: 'pack', id: 'flowchart' } });
    expect(tiles(html)).toBe(2);
    expect(html).toContain('Steps and decisions.');
    expect(html).toContain('aria-label="Place Process"');
    expect(html).toContain('placeholder="Search Flowchart"');
  });

  it('opens an added library from the catalogue, with a way to remove it', () => {
    const html = panel(library({ added: [architecture] }), {
      view: { kind: 'added', id: 'added-1' },
    });
    expect(html).toContain('Opening Software Architecture…');
    expect(html).toContain('by Someone');
    expect(html).toContain('data-testid="library-remove-added"');
  });

  it('opens Browse on the catalogue, and credits where it comes from', () => {
    const html = panel(library(), { view: { kind: 'browse' } });
    expect(html).toContain('Opening the library catalogue…');
    expect(html).toContain('placeholder="Search the catalogue"');
  });

  it('offers import and export, and no file menu to a guest', () => {
    const menu = (html: string) =>
      html.match(/<button[^>]*data-testid="library-file-menu"[^>]*>/)![0];
    expect(menu(panel(library()))).not.toContain(' disabled=""');
    expect(menu(panel(library({ enabled: false })))).toContain(' disabled=""');
  });

  it('tells a viewer they can keep items but not place them here', () => {
    const html = panel(library({ items: [entry('a', 'Gateway')] }), { canPlace: false });
    expect(html).toContain('View only');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('draggable="false"');
  });

  it('says when the library could not be read, with a way to try again', () => {
    const html = panel(library({ status: 'error', error: 'Your session has ended.' }));
    expect(html).toContain('Couldn’t open your library');
    expect(html).toContain('Your session has ended.');
    expect(html).toContain('Try again');
  });
});
