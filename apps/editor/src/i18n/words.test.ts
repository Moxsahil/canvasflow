import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

const SRC = join(__dirname, '..');
const LOCALES = join(__dirname, 'locales');

function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** `menu.language` for `menu.language`, and `boards.count` for `boards.count_one`. */
function askedForAs(key: string): string {
  return key.replace(/_(zero|one|two|few|many|other)$/, '');
}

function slotsOf(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!).sort();
}

/**
 * Words that stay as they are in every language: format and brand names, a
 * web address, and the "Aa" a font is shown in.
 */
const UNTRANSLATED = new Set(['Aa', 'PNG', 'SVG', 'libraries.excalidraw.com']);

/** A sample component from the kit, with made-up messages, that nothing renders. */
const NOT_RENDERED = new Set([join('components', 'ui', 'notifications.tsx')]);

describe('the English words', () => {
  const english: Record<string, string> = en;
  const source = sourceFiles()
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  it('are each asked for somewhere, so the list holds nothing a translator need not do', () => {
    const unused = Object.keys(english).filter((key) => {
      const asked = askedForAs(key);
      return !source.includes(`'${asked}'`) && !source.includes(`"${asked}"`);
    });
    expect(unused).toEqual([]);
  });

  it('give every counted word its "other" form, the one every language has', () => {
    const missing = Object.keys(english)
      .filter((key) => key.endsWith('_one'))
      .map((key) => `${askedForAs(key)}_other`)
      .filter((key) => !(key in english));
    expect(missing).toEqual([]);
  });

  it('leave no words written straight into a component', () => {
    const written: string[] = [];
    for (const path of sourceFiles()) {
      if (!path.endsWith('.tsx') || NOT_RENDERED.has(relative(SRC, path))) continue;
      const file = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
          const text = node.text.trim();
          if (/[A-Za-z]/.test(text) && !UNTRANSLATED.has(text)) {
            const { line } = file.getLineAndCharacterOfPosition(node.getStart());
            written.push(`${relative(SRC, path)}:${line + 1} ${text}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(written).toEqual([]);
  });
});

describe('each translation', () => {
  const english: Record<string, string> = en;
  const files = readdirSync(LOCALES).filter((name) => name.endsWith('.json') && name !== 'en.json');

  it.each(files.length > 0 ? files : ['(none yet)'])('%s keeps to the English words', (name) => {
    if (name === '(none yet)') return;
    const words = JSON.parse(readFileSync(join(LOCALES, name), 'utf8')) as Record<string, string>;
    for (const [key, text] of Object.entries(words)) {
      // A language may need counted forms English does not, but no new words.
      const base = askedForAs(key);
      const known = key in english || `${base}_other` in english;
      expect(known, `${name}: ${key} is not an English word`).toBe(true);
      const englishText = english[key] ?? english[`${base}_other`] ?? '';
      expect(slotsOf(text), `${name}: ${key}`).toEqual(slotsOf(englishText));
    }
  });
});
