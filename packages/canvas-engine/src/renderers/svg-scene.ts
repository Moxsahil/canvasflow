import type { Drawable } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import { computeBoundingRect } from '../document/camera.js';
import {
  assertNever,
  isFrame,
  type FrameShape,
  type ImageShape,
  type Shape,
  type TextShape,
} from '../shapes/shape.js';
import { FRAME_LABEL_FONT_SIZE, FRAME_LABEL_GAP, frameLabel } from '../shapes/frame.js';
import { FRAME_LABEL_FONT_FAMILY } from '../frames/frame-geometry.js';
import {
  arrowheadMarks,
  createRoughGenerator,
  freehandPressureSegments,
  generateArrowDrawable,
  generateDiamondDrawable,
  generateEllipseDrawable,
  generateFreehandDrawable,
  generateFreehandFillDrawable,
  generateLineDrawable,
  generateRectangleDrawable,
  strokeDashArray,
} from '../utils/rough.js';
import {
  DEFAULT_EXPORT_PADDING,
  EmptySceneError,
  type ExportSceneOptions,
} from '../export/export-scene.js';

/**
 * Element id for one frame's clip path.
 *
 * Prefixed because these ids share a namespace with the whole page once the
 * SVG is inlined into a document, and a bare shape id is short enough to
 * collide with something already there.
 */
function frameClipId(frameId: string): string {
  return `cf-frame-clip-${frameId}`;
}

/** Prepended when writing a file, so older software parses the SVG. */
export const SVG_DOCUMENT_PREAMBLE = '<?xml version="1.0" encoding="UTF-8"?>\n';

/**
 * Render shapes as an SVG document, as a string.
 *
 * Built from rough's `toPaths` rather than its DOM-based SVG API, which keeps
 * the whole renderer free of `document` — it runs in a worker or a test with no
 * DOM at all, and there is no second geometry implementation to keep in step:
 * every shape comes from the same drawable generators the canvas renderer uses,
 * so an exported SVG and an exported PNG are the same drawing.
 *
 * Scale behaves differently here than on canvas, and correctly so: the viewBox
 * stays in world units and only the declared width/height grow, because SVG is
 * resolution-independent — a 3× SVG is the same vectors at a larger natural
 * size, not more pixels.
 */
export function renderSceneToSvgString(
  shapes: readonly Shape[],
  options: ExportSceneOptions = {},
): string {
  const { padding = DEFAULT_EXPORT_PADDING, scale = 1, backgroundColor } = options;

  const rect = computeBoundingRect(shapes);
  if (!rect) throw new EmptySceneError();

  const viewWidth = rect.width + padding * 2;
  const viewHeight = rect.height + padding * 2;
  const generator = createRoughGenerator();

  const frames = new Map(shapes.filter(isFrame).map((frame) => [frame.id, frame]));

  // One clip path per frame, referenced by each of its members. The canvas
  // renderer crops members at the frame's edge, and an export that didn't
  // would show content the board never did.
  const defs =
    frames.size === 0
      ? ''
      : `<defs>\n${[...frames.values()]
          .map(
            (frame) =>
              `<clipPath id="${frameClipId(frame.id)}"><rect x="${num(frame.x)}" y="${num(
                frame.y,
              )}" width="${num(frame.width)}" height="${num(frame.height)}"/></clipPath>`,
          )
          .join('\n')}\n</defs>\n`;

  const body = shapes
    .map((shape) => {
      const svg = shapeToSvg(generator, shape, options.imageDataUrls);
      const frame = shape.frameId ? frames.get(shape.frameId) : undefined;
      return frame ? `<g clip-path="url(#${frameClipId(frame.id)})">${svg}</g>` : svg;
    })
    .join('\n');

  const background = backgroundColor
    ? `<rect x="0" y="0" width="${num(viewWidth)}" height="${num(viewHeight)}" fill="${escapeXml(
        backgroundColor,
      )}"/>\n`
    : '';

  // The translate places the padded top-left of the content at the origin —
  // the same synthesised camera the canvas export uses.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(viewWidth * scale)}" ` +
    `height="${num(viewHeight * scale)}" viewBox="0 0 ${num(viewWidth)} ${num(viewHeight)}">\n` +
    // Outside the translate, and correct there: a clip path resolves in the
    // user space of whatever references it, which is a group inside that
    // translate, so its rect is read in the same world coordinates the shapes
    // are written in.
    defs +
    background +
    `<g transform="translate(${num(padding - rect.x)} ${num(padding - rect.y)})">\n` +
    body +
    `\n</g>\n</svg>`
  );
}

/** Trims float noise out of the markup without moving anything visibly. */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Rough emits fill paths and stroke paths; each needs the other switched off. */
function drawableToSvg(generator: RoughGenerator, drawable: Drawable): string {
  const dash = drawable.options.strokeLineDash;
  const dashAttr = dash && dash.length > 0 ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : '';

  return generator
    .toPaths(drawable)
    .map((path) => {
      const isFill = Boolean(path.fill) && path.fill !== 'none';
      const fill = isFill ? escapeXml(path.fill!) : 'none';
      const stroke = path.stroke && path.stroke !== 'none' ? escapeXml(path.stroke) : 'none';
      const width = path.strokeWidth ? ` stroke-width="${num(path.strokeWidth)}"` : '';
      // Dashes belong to outlines only — a hatch fill is already discrete.
      return `<path d="${path.d}" fill="${fill}" stroke="${stroke}"${width}${
        isFill ? '' : dashAttr
      }/>`;
    })
    .join('');
}

function pointsToPath(points: ReadonlyArray<readonly [number, number]>, close: boolean): string {
  const [first, ...rest] = points;
  if (!first) return '';
  const segments = rest.map(([x, y]) => `L ${num(x)} ${num(y)}`).join(' ');
  return `M ${num(first[0])} ${num(first[1])} ${segments}${close ? ' Z' : ''}`;
}

function textToSvg(shape: TextShape): string {
  const lines = shape.text.split('\n');
  const lineHeight = shape.fontSize * 1.2;
  const anchor =
    shape.textAlign === 'center' ? 'middle' : shape.textAlign === 'right' ? 'end' : 'start';

  return lines
    .map((line, index) => {
      const y = shape.y + index * lineHeight;
      return (
        `<text x="${num(shape.x)}" y="${num(y)}" font-family="${escapeXml(shape.fontFamily)}" ` +
        `font-size="${num(shape.fontSize)}px" fill="${escapeXml(shape.strokeColor)}" ` +
        `text-anchor="${anchor}" dominant-baseline="text-before-edge" ` +
        `style="white-space: pre;">${escapeXml(line)}</text>`
      );
    })
    .join('');
}

/**
 * An image as an `<image>` element carrying its own bytes.
 *
 * The payload has to be inlined: an SVG that points at our API would render as
 * a broken box for anyone who opens the file without a session, which is most
 * of the point of exporting one. A file whose bytes the caller could not
 * resolve becomes an empty outline rather than nothing at all, so the export
 * still shows where the image sat.
 */
function imageToSvg(shape: ImageShape, dataUrl: string | undefined): string {
  const box =
    `x="${num(shape.x)}" y="${num(shape.y)}" ` +
    `width="${num(shape.width)}" height="${num(shape.height)}"`;

  if (!dataUrl) {
    return `<rect ${box} fill="none" stroke="#c6c6cf" stroke-width="1"/>`;
  }

  // preserveAspectRatio="none" so the export matches the canvas, which stretches
  // the bitmap to whatever box the user dragged it to.
  return `<image ${box} preserveAspectRatio="none" href="${escapeXml(dataUrl)}"/>`;
}

/**
 * A frame's border and name.
 *
 * The label is placed in world units at the size the canvas renderer gives it
 * at 1:1, which is the only scale an export has — there is no camera here to
 * hold it at a constant size against.
 */
function frameToSvg(shape: FrameShape): string {
  const dash = strokeDashArray(shape.strokeStyle, shape.strokeWidth);
  const dashAttr = dash ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : '';

  const body =
    `<rect x="${num(shape.x)}" y="${num(shape.y)}" width="${num(shape.width)}" ` +
    `height="${num(shape.height)}" fill="${
      shape.fillColor ? escapeXml(shape.fillColor) : 'none'
    }" stroke="${escapeXml(shape.strokeColor)}" ` +
    `stroke-width="${num(shape.strokeWidth)}"${dashAttr}/>`;

  const label =
    `<text x="${num(shape.x)}" y="${num(shape.y - FRAME_LABEL_GAP)}" ` +
    `font-family="${escapeXml(FRAME_LABEL_FONT_FAMILY)}" ` +
    `font-size="${num(FRAME_LABEL_FONT_SIZE)}" fill="${escapeXml(shape.strokeColor)}">` +
    `${escapeXml(frameLabel(shape))}</text>`;

  return body + label;
}

function shapeToSvg(
  generator: RoughGenerator,
  shape: Shape,
  imageDataUrls: ReadonlyMap<string, string> | undefined,
): string {
  const source = { generator };
  let content = '';

  switch (shape.kind) {
    case 'rectangle':
      content = drawableToSvg(generator, generateRectangleDrawable(source, shape));
      break;
    case 'ellipse':
      content = drawableToSvg(generator, generateEllipseDrawable(source, shape));
      break;
    case 'diamond':
      content = drawableToSvg(generator, generateDiamondDrawable(source, shape));
      break;
    case 'line':
      content = drawableToSvg(generator, generateLineDrawable(source, shape));
      break;
    case 'arrow': {
      content = drawableToSvg(generator, generateArrowDrawable(source, shape));
      for (const mark of arrowheadMarks(shape)) {
        // Solid markers even on a dashed arrow, matching the canvas renderer.
        const common = `stroke="${escapeXml(shape.strokeColor)}" stroke-width="${num(
          shape.strokeWidth,
        )}" stroke-linejoin="round" stroke-linecap="round"`;
        if (mark.kind === 'circle') {
          content +=
            `<circle cx="${num(mark.cx)}" cy="${num(mark.cy)}" r="${num(mark.radius)}" ` +
            (mark.filled
              ? `fill="${escapeXml(shape.strokeColor)}" stroke="none"/>`
              : `fill="none" ${common}/>`);
          continue;
        }
        const d = pointsToPath(mark.points, mark.kind === 'closed');
        content +=
          mark.kind === 'closed' && mark.filled
            ? `<path d="${d}" fill="${escapeXml(shape.strokeColor)}" stroke="none"/>`
            : `<path d="${d}" fill="none" ${common}/>`;
      }
      break;
    }
    case 'freehand': {
      const fill = generateFreehandFillDrawable(source, shape);
      if (fill) content += drawableToSvg(generator, fill);

      if (shape.simulatePressure) {
        const dash = strokeDashArray(shape.strokeStyle, shape.strokeWidth);
        const dashAttr = dash ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : '';
        for (const segment of freehandPressureSegments(shape)) {
          content +=
            `<path d="${pointsToPath([segment.from, segment.to], false)}" fill="none" ` +
            `stroke="${escapeXml(shape.strokeColor)}" stroke-width="${num(segment.width)}" ` +
            `stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`;
        }
      } else {
        content += drawableToSvg(generator, generateFreehandDrawable(source, shape));
      }
      break;
    }
    case 'text':
      content = textToSvg(shape);
      break;
    case 'image':
      content = imageToSvg(shape, imageDataUrls?.get(shape.fileId));
      break;
    case 'frame':
      content = frameToSvg(shape);
      break;
    default:
      assertNever(shape);
  }

  // Opacity as a group attribute is the SVG equivalent of the canvas
  // renderer's globalAlpha: it applies to the composed shape, so a hatched
  // fill and its outline don't show through each other.
  return shape.opacity < 100
    ? `<g opacity="${num(shape.opacity / 100)}">${content}</g>`
    : `<g>${content}</g>`;
}
