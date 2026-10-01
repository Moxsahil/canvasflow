import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
// Match the production board rewrite in dev and preview. The public root is
// real HTML; the private editor shell must expose noindex before JavaScript.
const boardRewrite = (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/boards' || url.pathname.startsWith('/boards/')) {
    req.url = `/editor.html${url.search}`;
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  } else if (url.pathname === '/editor.html') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
};
const editorRoutes = {
  name: 'canvasflow-editor-routes',
  configureServer(server) {
    server.middlewares.use(boardRewrite);
  },
  configurePreviewServer(server) {
    server.middlewares.use(boardRewrite);
  },
};
/**
 * Vite config for the public app entry and the private editor SPA.
 *
 * - React fast refresh via @vitejs/plugin-react
 * - Tailwind v4 for the menu rail's shadcn-style components; the rest of the
 *   editor chrome stays on plain CSS + theme.css tokens
 * - Path alias @/ for src/
 * - Port 3002 (web=3000, api-gateway=3001, editor=3002)
 * - Workspace packages transpiled by Vite via their dist/ output
 */
export default defineConfig({
  appType: 'mpa',
  plugins: [editorRoutes, react(), svgr(), tailwindcss()],
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
        entry: path.resolve(__dirname, 'index.html'),
        editor: path.resolve(__dirname, 'editor.html'),
      },
    },
  },
});
