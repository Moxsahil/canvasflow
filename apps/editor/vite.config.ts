import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite config for the editor SPA.
 *
 * - React fast refresh via @vitejs/plugin-react
 * - Path alias @/ for src/
 * - Port 3002 (web=3000, api-gateway=3001, editor=3002)
 * - Workspace packages transpiled by Vite via their dist/ output
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    host: true,
    strictPort: true,
  },
  preview: {
    port: 3002,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
