import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite config for the editor SPA.
 *
 * - React fast refresh via @vitejs/plugin-react
 * - Tailwind v4 for the menu rail's shadcn-style components; the rest of the
 *   editor chrome stays on plain CSS + theme.css tokens
 * - Path alias @/ for src/
 * - Port 3002 (web=3000, api-gateway=3001, editor=3002)
 * - Workspace packages transpiled by Vite via their dist/ output
 * - Two pages: the editor, and the embed page other sites frame (embed.html)
 */

/**
 * /embed/{id} is the embed page, as the hosting rewrite in vercel.json makes
 * it in production; without this the dev server would answer with the editor.
 */
function embedPage(): Plugin {
  const rewrite = (url: string | undefined) =>
    url && /^\/embed\/[^/?#]+\/?(\?.*)?$/.test(url) ? '/embed.html' : url;
  return {
    name: 'canvasflow-embed-page',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [embedPage(), react(), svgr(), tailwindcss()],
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
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        embed: path.resolve(__dirname, 'embed.html'),
      },
    },
  },
});
