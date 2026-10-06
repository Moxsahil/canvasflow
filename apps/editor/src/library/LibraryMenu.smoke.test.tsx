import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRectangle } from '@canvasflow/canvas-engine';
import { LibraryPanel } from './LibraryMenu';
import type { Library, LibraryEntry } from './useLibrary';

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
    ...overrides,
  };
}

function panel(lib: Library, { canAdd = false, canPlace = true } = {}) {
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
      onError={noop}
      container={null}
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
    expect(panel(library())).toContain('Select something on the board to add it here.');
    expect(panel(library(), { canAdd: true })).toContain('Add the selection to start it.');
  });

  it('offers Add selection only with something selected', () => {
    const add = (html: string) => html.match(/<button[^>]*data-testid="library-add"[^>]*>/)![0];
    expect(add(panel(library()))).toContain(' disabled=""');
    expect(add(panel(library(), { canAdd: true }))).not.toContain(' disabled=""');
  });

  it('lists the libraries still to come as Soon', () => {
    const html = panel(library());
    for (const label of ['Packs', 'Workspace', 'Browse libraries']) expect(html).toContain(label);
    expect(html.match(/>Soon</g)).toHaveLength(3);
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
