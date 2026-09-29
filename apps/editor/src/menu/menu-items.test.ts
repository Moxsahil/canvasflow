import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENT_LANGUAGE, LANGUAGES, LEARN_MORE_GROUPS } from './menu-items';

/** The web app's routes, found by their page files — route groups like `(legal)` add no segment. */
function webRoutes(): Set<string> {
  const appDir = join(__dirname, '../../../web/src/app');
  const routes = new Set<string>();
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const grouped = entry.name.startsWith('(') && entry.name.endsWith(')');
        walk(join(dir, entry.name), grouped ? segments : [...segments, entry.name]);
      } else if (entry.name === 'page.tsx') {
        routes.add(`/${segments.join('/')}`);
      }
    }
  };
  if (existsSync(appDir)) walk(appDir, []);
  return routes;
}

describe('LANGUAGES', () => {
  it('offers the language the app is in, and no language twice', () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(codes).toContain(CURRENT_LANGUAGE);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('LEARN_MORE_GROUPS', () => {
  it('links only to pages the web app serves', () => {
    const routes = webRoutes();
    const paths = LEARN_MORE_GROUPS.flat().flatMap((item) => (item.path ? [item.path] : []));

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path) => !routes.has(path))).toEqual([]);
  });

  it('never gives a row both a page and an action', () => {
    expect(LEARN_MORE_GROUPS.flat().filter((item) => item.path && item.action)).toEqual([]);
  });
});
