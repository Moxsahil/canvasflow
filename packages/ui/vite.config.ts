import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only Vite config for the @canvasflow/ui demo page.
 *
 * Not used in the build pipeline — the actual package bundle is produced
 * by tsup (see tsup.config.ts). This file exists purely so we can run
 * `pnpm dev` and preview the components with live Tailwind compilation.
 */
export default defineConfig({
  plugins: [tailwindcss()],
  root: 'demo',
  server: {
    port: 4300,
    open: true,
  },
});
