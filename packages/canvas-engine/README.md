cat > README.md << 'EOF'

# @canvasflow/canvas-engine

Pure canvas rendering engine for CanvasFlow. No React, no DOM coupling — just
shapes, math, and Canvas2D drawing primitives.

## Three-canvas architecture

This package exposes three renderers, intended to be mounted on three
stacked HTML canvases in the DOM:

```
+-----------------------------------------+

| InteractiveCanvas | ← selection, handles, cursors

+-----------------------------------------+

| NewElementCanvas | ← shape being actively drawn

+-----------------------------------------+

| StaticCanvas | ← all finished shapes

+-----------------------------------------+

```

**Why three?**
Repainting 2000 shapes on every mouse-move is too slow. By splitting:

- `StaticCanvas` only repaints when the scene changes (rare)
- `NewElementCanvas` only repaints during an active draw (frequent during one tool)
- `InteractiveCanvas` repaints during selection and pan (frequent, but small)

Together: smooth 60fps even with hundreds of shapes.

## API

```ts
import {
  renderStaticScene,
  renderInteractiveScene,
  renderNewElementScene,
  setupCanvas,
  createRectangle,
} from '@canvasflow/canvas-engine';

const canvas = document.querySelector('canvas')!;
const ctx = setupCanvas(canvas, { width: 800, height: 600 });

const rect = createRectangle({
  id: 'r1',
  x: 100,
  y: 100,
  width: 200,
  height: 100,
});

renderStaticScene(ctx, canvas, {
  width: 800,
  height: 600,
  shapes: [rect],
});
```

## Testing

```bash
pnpm test          # run once
pnpm test:watch    # rerun on file changes
```

Tests use the `canvas` npm package to provide a Canvas2D-compatible API
in Node, so we don't need a browser to verify renderer correctness.

## Design choices

- **Pure functions, no classes.** Renderers are stateless — pass shapes
  in, get pixels out. Makes testing trivial.
- **Discriminated unions for shapes.** Each new shape kind adds one case
  to a `switch`, and TypeScript enforces exhaustiveness.
- **Rough.js for hand-drawn aesthetic.** Same library Excalidraw uses.
  Pinned per-shape seeds so renders are deterministic.
- **Camera as a value type.** Pan and zoom are just `{ x, y, zoom }`,
  passed in per render call. No global state.
  EOF
