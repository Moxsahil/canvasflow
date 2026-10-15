import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
// Redirect the root before sending HTML, and serve the editor for board links.
// Match production in both dev and preview without displaying a handoff page.
const editorRoutesMiddleware = (webUrl) => (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.statusCode = 302;
    res.setHeader('Location', new URL('/open', webUrl).href);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.end();
    return;
  }
  if (url.pathname === '/boards' || url.pathname.startsWith('/boards/')) {
    req.url = `/editor.html${url.search}`;
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  } else if (url.pathname === '/editor.html') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
};
const editorRoutes = (webUrl) => ({
  name: 'canvasflow-editor-routes',
  configureServer(server) {
    server.middlewares.use(editorRoutesMiddleware(webUrl));
  },
  configurePreviewServer(server) {
    server.middlewares.use(editorRoutesMiddleware(webUrl));
  },
});
/**
 * Vite config for the board-opening entry and the private editor SPA.
 *
 * - React fast refresh via @vitejs/plugin-react
 * - Tailwind v4 for the menu rail's shadcn-style components; the rest of the
 *   editor chrome stays on plain CSS + theme.css tokens
 * - Path alias @/ for src/
 * - Port 3002 (web=3000, api-gateway=3001, editor=3002)
 * - Workspace packages transpiled by Vite via their dist/ output
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  const webUrl = env.VITE_WEB_URL || 'https://canvasflowapp.com';
  return {
    appType: 'mpa',
    plugins: [editorRoutes(webUrl), react(), svgr(), tailwindcss()],
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
  };
});
