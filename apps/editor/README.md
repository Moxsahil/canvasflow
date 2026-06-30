cat > README.md << 'EOF'

# @canvasflow/editor

The CanvasFlow whiteboard editor. Vite + React SPA that consumes the pure
rendering engine from `@canvasflow/canvas-engine` and brings it to a
real browser viewport.

## Run locally

```bash
pnpm --filter @canvasflow/editor dev
```

Then visit `http://localhost:3002`.

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
EOF
