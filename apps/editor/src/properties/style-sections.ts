import type { Shape } from '@canvasflow/canvas-engine';
import type { ItemStyle } from '../machine/tool-machine.types';

/**
 * Shape kinds a fill colour means something for. Lines and freehand strokes
 * qualify because they can enclose an area — a filled line closes into a
 * polygon, and a freehand stroke fills once it loops back on itself.
 */
const FILLABLE_KINDS: ReadonlySet<Shape['kind']> = new Set([
  'rectangle',
  'ellipse',
  'diamond',
  'line',
  'freehand',
  'topic',
]);

/** Shape kinds whose corners or joints can be rounded off. */
const EDGED_KINDS: ReadonlySet<Shape['kind']> = new Set(['rectangle', 'diamond', 'line']);

/** Which groups of style controls apply to what is being edited. */
export interface StyleSections {
  /**
   * The bucket's settings rather than a shape's: it makes nothing but a fill,
   * so it gets the fill's colour and pattern and the opacity, and its colour
   * has no transparent — a transparent pour would leave no mark.
   */
  bucket: boolean;
  /** The stroke's colour — everything but the bucket has one. */
  strokeColour: boolean;
  /** Text has a section of its own in place of the stroke. */
  textOnly: boolean;
  /** Stroke weight. */
  stroke: boolean;
  /** Dash and look — the treatments a hand-drawn line isn't offered. */
  strokeTreatments: boolean;
  pressure: boolean;
  fill: boolean;
  /** The fill's hatch pattern, once there is a fill to hatch. */
  fillPattern: boolean;
  corners: boolean;
  arrow: boolean;
  /** A mind map's layout, its lines and its topics' outline. */
  mindMap: boolean;
}

/**
 * Every section shows only when it applies to every kind being edited, so a
 * mixed selection falls back to the properties its shapes share. Shared by
 * the docked panel and the floating bar, so the two can never disagree about
 * what a shape can be given.
 */
export function styleSections(
  shapeKinds: readonly Shape['kind'][],
  style: Pick<ItemStyle, 'fillColor'>,
  bucket = false,
): StyleSections {
  if (bucket) {
    return {
      bucket,
      strokeColour: false,
      textOnly: false,
      stroke: false,
      strokeTreatments: false,
      pressure: false,
      fill: true,
      fillPattern: true,
      corners: false,
      arrow: false,
      mindMap: false,
    };
  }

  const every = (predicate: (kind: Shape['kind']) => boolean) =>
    shapeKinds.length > 0 && shapeKinds.every(predicate);

  const textOnly = every((k) => k === 'text');
  const fill = every((k) => FILLABLE_KINDS.has(k));
  // Text is sized by fontSize and drawn without Rough; an image paints its own
  // pixels, and an embed and a link card are cards around someone else's
  // page; none of them is outlined, and none has a stroke to configure.
  // A topic is drawn as a clean box sized by its words, so its look is its
  // colours alone: no weight, dash or roughness, and a fill without a pattern.
  const stroke =
    !textOnly && !every((k) => k === 'image' || k === 'embed' || k === 'bookmark' || k === 'topic');
  const anyTopic = shapeKinds.includes('topic');
  const freehandOnly = every((k) => k === 'freehand');

  return {
    bucket,
    strokeColour: true,
    textOnly,
    stroke,
    /**
     * Roughness and corner treatment genuinely miss a hand-drawn line — a
     * tapered stroke is painted segment by segment rather than generated, so
     * neither reaches it. A dash pattern would apply, but a line that was drawn
     * rather than described carries its own character, and cutting it into
     * dashes reads as fighting the stroke instead of styling it.
     */
    strokeTreatments: stroke && !freehandOnly && !anyTopic,
    pressure: freehandOnly,
    fill,
    fillPattern: fill && style.fillColor !== null && !anyTopic,
    corners: every((k) => EDGED_KINDS.has(k)),
    arrow: every((k) => k === 'arrow'),
    mindMap: every((k) => k === 'topic'),
  };
}
