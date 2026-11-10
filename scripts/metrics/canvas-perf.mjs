// Metric 4a: frame rate during pan and zoom on the local editor's
// production build (vite preview on :3002), with N shapes preloaded.
// Shapes are written into the local board's own IndexedDB store
// (canvasflow:local:local, y-indexeddb "updates") and the page reloaded,
// so the editor loads them exactly as it would a board drawn earlier.
// Usage: node canvas-perf.mjs --sizes=100,500,1000 --runs=3 --seconds=4
//   [--url=http://localhost:3302/] [--headed] [--label=name]
//
// --headed opens a visible Chromium window (needs a display; on WSL2 that is
// WSLg) with the GPU allowed, instead of headless software rendering. Either
// way the result records what Chromium actually drew with: its WebGL renderer
// string and the Canvas / Rasterization rows of chrome://gpu.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { HERE, ROOT, stats, env } from './lib.mjs';

const argS = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const SIZES = argS('sizes', '100,500,1000').split(',').map(Number);
const RUNS = Number(argS('runs', 3));
const SECONDS = Number(argS('seconds', 4));
const EDITOR = argS('url', 'http://localhost:3002/');
const HEADED = process.argv.includes('--headed');
const LABEL = argS('label', '');

const { chromium } = createRequire(resolve(ROOT, 'apps/e2e/package.json'))('@playwright/test');
const PNPM = resolve(ROOT, 'node_modules/.pnpm');
const Y = await import(pathToFileURL(`${PNPM}/yjs@13.6.31/node_modules/yjs/dist/yjs.mjs`).href);
const CE = await import(pathToFileURL(resolve(ROOT, 'packages/canvas-engine/dist/index.js')).href);

function boardUpdate(N) {
  const board = new CE.BoardDocument(new Y.Doc(), 'local');
  const cols = Math.ceil(Math.sqrt(N * (16 / 9)));
  board.batch(() => {
    for (let i = 0; i < N; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      board.addShape(
        CE.createRectangle({
          id: `p${i}`,
          x: 40 + cx * (1800 / cols),
          y: 80 + cy * (1800 / cols),
          width: (1800 / cols) * 0.8,
          height: (1800 / cols) * 0.8,
        }),
      );
    }
  });
  return Array.from(board.encodeState());
}

async function measure(page, mode) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__run = true;
    const tick = (t) => {
      if (!window.__run) return;
      window.__frames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(700, 450);
  if (mode === 'zoom') await page.keyboard.down('Control');
  const end = Date.now() + SECONDS * 1000;
  let i = 0;
  while (Date.now() < end) {
    const dir = Math.floor(i / 30) % 2 ? 1 : -1; // back and forth so the view stays on the shapes
    if (mode === 'pan') await page.mouse.wheel(dir * 25, dir * 15);
    else await page.mouse.wheel(0, dir * 10);
    i++;
  }
  if (mode === 'zoom') await page.keyboard.up('Control');
  const frames = await page.evaluate(() => {
    window.__run = false;
    return window.__frames;
  });
  const deltas = frames.slice(1).map((t, k) => t - frames[k]);
  const dur = (frames.at(-1) - frames[0]) / 1000;
  return { fps: (frames.length - 1) / dur, frameMs: stats(deltas), wheelEvents: i };
}

const browser = await chromium.launch(
  HEADED
    ? {
        headless: false,
        // Ask for the GPU even where Chromium would rather not trust it.
        args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
      }
    : { headless: true },
);

/** What this Chromium is drawing with, read from inside it. */
async function graphics() {
  const page = await browser.newPage();
  const webgl = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
  let features = null;
  try {
    await page.goto('chrome://gpu');
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    features = Object.fromEntries(
      ['Canvas', 'Rasterization', 'WebGL', 'Compositing']
        .map((name) => [
          name,
          new RegExp(`^\\*?\\s*${name}:\\s*(.+)$`, 'm').exec(text)?.[1]?.trim(),
        ])
        .filter(([, v]) => v),
    );
  } catch {}
  await page.close();
  return { webgl, features };
}

const out = {
  metric: 'canvas-fps',
  seconds: SECONDS,
  runs: RUNS,
  viewport: '1440x900',
  url: EDITOR,
  browser: `chromium ${browser.version()} ${HEADED ? 'headed' : 'headless'}`,
  graphics: await graphics(),
  results: {},
  env: env(),
};
console.log(JSON.stringify({ browser: out.browser, graphics: out.graphics }));
for (const N of SIZES) {
  const update = boardUpdate(N);
  out.results[N] = { pan: [], zoom: [] };
  for (let r = 0; r < RUNS; r++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(EDITOR);
    await page.locator('canvas').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(async (bytes) => {
      await new Promise((res, rej) => {
        const req = indexedDB.open('canvasflow:local:local');
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('updates', 'readwrite');
          tx.objectStore('updates').add(new Uint8Array(bytes));
          tx.oncomplete = () => (db.close(), res());
          tx.onerror = () => rej(tx.error);
        };
      });
    }, update);
    await page.reload();
    await page.locator('canvas').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);
    if (r === 0)
      await page.screenshot({
        path: resolve(HERE, `results/canvas-${N}${LABEL ? `-${LABEL}` : ''}.png`),
      });
    out.results[N].pan.push(await measure(page, 'pan'));
    await page.waitForTimeout(500);
    out.results[N].zoom.push(await measure(page, 'zoom'));
    await ctx.close();
  }
  for (const m of ['pan', 'zoom']) {
    const rs = out.results[N][m];
    out.results[N][`${m}Summary`] = {
      fpsPerRun: rs.map((x) => x.fps),
      medianFps: stats(rs.map((x) => x.fps)).median,
      frameMsMedianPerRun: rs.map((x) => x.frameMs.median),
      frameMsP95PerRun: rs.map((x) => x.frameMs.p95),
    };
  }
  console.log(
    N,
    JSON.stringify({ pan: out.results[N].panSummary, zoom: out.results[N].zoomSummary }),
  );
}
await browser.close();
writeFileSync(
  resolve(HERE, `results/canvas-perf${LABEL ? `-${LABEL}` : ''}.json`),
  JSON.stringify(out, null, 2),
);
