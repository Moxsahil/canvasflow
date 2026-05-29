/// <reference types="node" />
import { defineConfig } from 'tsup';
import { copyFile, mkdir } from 'node:fs/promises';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  outDir: 'dist',
  async onSuccess() {
    // Copy globals.css to dist/ for consumers
    await mkdir('dist', { recursive: true });
    await copyFile('src/styles/globals.css', 'dist/styles.css');
  },
});
