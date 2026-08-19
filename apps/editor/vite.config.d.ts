/**
 * Vite config for the editor SPA.
 *
 * - React fast refresh via @vitejs/plugin-react
 * - Tailwind v4 for the menu rail's shadcn-style components; the rest of the
 *   editor chrome stays on plain CSS + theme.css tokens
 * - Path alias @/ for src/
 * - Port 3002 (web=3000, api-gateway=3001, editor=3002)
 * - Workspace packages transpiled by Vite via their dist/ output
 */
declare const _default: import('vite').UserConfig;
export default _default;
