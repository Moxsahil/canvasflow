import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  // Not in watch mode: `pnpm dev` starts the gateway at the same time, and an
  // emptied dist/ leaves it compiling against a package with no type
  // declarations (TS7016) until the slower declaration build finishes. Keeping
  // the previous output means the gateway always sees a complete package.
  clean: !options.watch,
  treeshake: true,
  outDir: 'dist',
}));
