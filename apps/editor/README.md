# @canvasflow/editor

The CanvasFlow whiteboard editor. Vite + React SPA that consumes the pure
rendering engine from `@canvasflow/canvas-engine` and brings it to a
real browser viewport.

## Run locally

```bash
pnpm --filter @canvasflow/editor dev
```

Then visit `http://localhost:3002` for the public app entry, or
`http://localhost:3002/boards/dev-local` for the local development board.

## Public entry and search discovery

Vite builds two HTML entry points. `index.html` is a lightweight, indexable
public page containing product copy and sign-in/open links even without
JavaScript. `editor.html` loads the React editor and declares `noindex, nofollow`
before JavaScript runs. Board URLs are still `/boards/:boardId`, including their
existing token fragments; Vercel rewrites them internally to `editor.html` and
adds the matching `X-Robots-Tag` header. The Vite dev/preview middleware mirrors
this rewrite. Unknown routes return 404 instead of opening `dev-local`.

The public entry checks the gateway's existing `/users/me` endpoint using the
session cookie. A confirmed non-guest account continues to the web app's `/open`
route. Signed-out visitors and failed checks stay on the public page. Users
whose access cookie has expired can click **Open your whiteboard** to use the
existing session-renewal flow. No private board data is included in this page.

Configure `VITE_WEB_URL` and `VITE_API_URL` as before. Canonicals and sitemap URLs
always refer to production; navigation uses `VITE_WEB_URL` when JavaScript runs.
The root does not load the canvas bundle or require a sync connection.

`public/robots.txt` allows crawling so Google can read the private shell's
`noindex`; it is not an access control. `public/sitemap.xml` lists only the app
root. Submit `https://app.canvasflowapp.com/sitemap.xml` after deploying the
editor project, as described in the web README. Deploy the web project too for
the linked guide and social preview image.

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
