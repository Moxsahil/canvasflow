// Makes the landing hero's screenshots small enough to send to a phone.
//
//   node apps/web/scripts/hero-images.mjs
//
// Each 1920×1080 PNG in public/assets/hero-section becomes a WebP at 1920 and
// at 960 pixels wide, next to it. The hero picks between them with srcset, so
// a phone downloads the 960 one. Uses the sharp that Next.js already installs
// for its own image optimisation, so there is nothing extra to install.
import { createRequire } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const fromWeb = createRequire(resolve(HERE, '../package.json'));
const sharp = createRequire(fromWeb.resolve('next/package.json'))('sharp');

const DIR = resolve(HERE, '../public/assets/hero-section');
for (const name of readdirSync(DIR).filter((f) => f.endsWith('.png'))) {
  const input = join(DIR, name);
  for (const width of [960, 1920]) {
    const output = join(DIR, name.replace(/\.png$/, `-${width}.webp`));
    await sharp(input).resize({ width }).webp({ quality: 80, effort: 6 }).toFile(output);
    process.stdout.write(
      `${name} → ${output.split('/').pop()}: ${statSync(input).size} → ${statSync(output).size} bytes\n`,
    );
  }
}
