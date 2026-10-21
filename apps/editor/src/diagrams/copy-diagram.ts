import { renderSceneToCanvas, type DiagramStyle } from '@canvasflow/canvas-engine';
import { canvasToPngBlob, copyPngToClipboard } from '../file/export-image';
import { canvasBackgroundFor } from '../properties/palette';
import { composeDiagram } from './diagram-kit';

let copyId = 0;

/**
 * A diagram on the clipboard as a PNG, drawn the way the board would draw it,
 * in the theme on screen and at twice the size so it pastes sharp.
 *
 * Handed to the clipboard before it is laid out and encoded: Safari refuses a
 * write that comes after an await (see `writeClipboardItem`).
 */
export function copyDiagramAsPng(
  lines: readonly string[],
  look: { style?: DiagramStyle; dark: boolean },
): Promise<void> {
  const png = composeDiagram(lines, () => `copy-${copyId++}`, { style: look.style }).then(
    (composed) => {
      const canvas = document.createElement('canvas');
      renderSceneToCanvas(canvas, composed.shapes, {
        scale: 2,
        padding: 24,
        darkMode: look.dark,
        backgroundColor: canvasBackgroundFor(look.dark ? 'dark' : 'light'),
        images: composed.images,
      });
      return canvasToPngBlob(canvas);
    },
  );
  return copyPngToClipboard(png);
}
