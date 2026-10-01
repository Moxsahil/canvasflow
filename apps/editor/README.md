# @canvasflow/editor

The CanvasFlow whiteboard editor. Vite + React SPA that consumes the pure
rendering engine from `@canvasflow/canvas-engine` and brings it to a
real browser viewport.

## Run locally

```bash
pnpm --filter @canvasflow/editor dev
```

Then visit `http://localhost:3002` to open your whiteboard directly, or
`http://localhost:3002/boards/dev-local` for the local development board.

## Opening the editor

The root at `http://localhost:3002` and `https://app.canvasflowapp.com` redirects
to the web app's `/open` route before sending HTML, so no intermediate page is
displayed. Vite dev/preview uses `VITE_WEB_URL`; Vercel's redirects in
`vercel.json` apply to the production editor hostname and use the production
web host. Preview deployments use the silent fallback with their configured
`VITE_WEB_URL`. The `/open` route restores
the account session, picks the user's most recent board (or creates their first
one), and returns to `/boards/:boardId` with a short-lived token. Signed-out
visitors sign in first, then continue into the editor. There is no app landing
page or preliminary profile check.

Vite builds two HTML entry points: a silent static-host fallback in
`index.html` and the React editor in `editor.html`. Both declare `noindex,
nofollow` before JavaScript runs. Vercel rewrites board URLs to `editor.html`;
the Vite dev/preview middleware mirrors this rewrite. Both hosts also set the
matching `X-Robots-Tag` header on the root and editor routes. Direct board links
and their token fragments continue to work. If a static host serves `index.html`
for a board URL, its fallback loads that board directly, preserving the token
instead of redirecting back through `/open`. Unknown routes return 404.

`public/robots.txt` allows crawling so search engines can read `noindex`; it is
not an access control. The app has no public sitemap. Marketing pages and their
sitemap live on the web host at `https://canvasflowapp.com`.

In PR #12 you should see:

- A toolbar shell at the top
- A hand-drawn yellow rectangle on the canvas
- A dev overlay (top-right) showing scene info

## Architecture

```
    Editor (full viewport)

        └─ CanvasStack (absolute-positioned div)

        ├─ <canvas ref={staticCanvasRef}>           ← canvas-engine's static renderer

        ├─ <canvas ref={newElementCanvasRef}>       ← (PR #14) drawing in progress

        └─ <canvas ref={interactiveCanvasRef}>      ← (PR #15) selection + cursors

```

Three canvases stack via absolute positioning. Pointer events will be
captured by the interactive canvas (top) and dispatched to the active
tool. Each canvas repaints independently — the static canvas only when
shapes change, the interactive on every mouse-move during a drag.

## What's NOT in this PR

- Tool selection / drawing — PR #14 (tool state machine via XState)
- Selection / handles — PR #15 (rbush spatial index + transforms)
- Pan / zoom — PR #16
- Document loading from api-gateway — PR #17 (Yjs CRDT integration)
- Undo / redo — PR #18

## Stack

- **Vite 5** — fast HMR for canvas dev (much better than Next.js for this)
- **React 18** — render shell, hooks for canvas lifecycle
- **@canvasflow/canvas-engine** — pure rendering, no React coupling
- **@canvasflow/types** — branded IDs, shape unions

No state management library yet. Local `useState` is plenty for PR #12.
Zustand or Jotai comes in PR #14 when tool state complexity warrants it.
