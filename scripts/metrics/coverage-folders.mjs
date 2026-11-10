/**
 * Line coverage per folder, from a vitest/istanbul `coverage-summary.json`.
 *
 *   node scripts/metrics/coverage-folders.mjs <summary.json> <root> <folder>...
 *
 * `root` is the package directory the paths are relative to; each folder is
 * given relative to it (`src/modules/auth`). A folder's figure counts every
 * file under it, tested or not, so an untested file pulls it down.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [summaryPath, root, ...folders] = process.argv.slice(2);
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const base = path.resolve(root);
const rows = [];
const seen = new Map();
for (const folder of folders) {
  const prefix = path.join(base, folder) + path.sep;
  let covered = 0;
  let total = 0;
  let files = 0;
  for (const [file, data] of Object.entries(summary)) {
    if (file === 'total' || !(file.startsWith(prefix) || file === path.join(base, folder)))
      continue;
    seen.set(file, data.lines);
    covered += data.lines.covered;
    total += data.lines.total;
    files += 1;
  }
  const pct = total ? Math.floor((covered / total) * 1000) / 10 : 0;
  rows.push({ folder, files, covered, total, pct });
}
for (const r of rows) {
  process.stdout.write(
    `${r.folder.padEnd(42)} ${String(r.pct).padStart(5)}%  ${r.covered}/${r.total} lines, ${r.files} files\n`,
  );
}
// Each file once, so a folder listed inside another is not counted twice.
const all = [...seen.values()].reduce(
  (a, l) => ({ covered: a.covered + l.covered, total: a.total + l.total }),
  { covered: 0, total: 0 },
);
process.stdout.write(
  `${'all of the above'.padEnd(42)} ${String(Math.floor((all.covered / all.total) * 1000) / 10).padStart(5)}%  ${all.covered}/${all.total} lines\n`,
);
