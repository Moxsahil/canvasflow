import {
  buildDiagram,
  buildDiagramWithElk,
  collectDiagram,
  decodeBlob,
  DIAGRAM_PAINT,
  isMindMapLines,
  layoutMindMaps,
  outlineFromMindMapLines,
  type DiagramIconImage,
  type DiagramStyle,
  type ElkLike,
  type ImageSource,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { DiagramColor, DiagramIcon } from '@canvasflow/types';
import type { CarriedImage } from '../file/embedded-images';
import type * as DiagramIcons from './diagram-icons';
import { sha256Hex } from '../images/prepare-image';
import { DEFAULT_ITEM_STYLE, type ItemStyle } from '../machine/tool-machine.types';
import { mindMapFromOutline } from '../mindmap/mind-map-ops';

/**
 * Everything a diagram needs beyond the engine: ELK to lay it out, and the
 * icon drawings. Both are large, so they arrive together the first time a
 * diagram is drawn rather than with the editor.
 */
interface Kit {
  readonly elk: ElkLike;
  readonly icons: typeof DiagramIcons;
}

let kit: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  kit ??= Promise.all([import('elkjs/lib/elk.bundled.js'), import('./diagram-icons')]).then(
    ([{ default: ELK }, icons]) => ({ elk: new ELK() as unknown as ElkLike, icons }),
  );
  // A failed load is not kept, so the next diagram tries again.
  kit.catch(() => {
    kit = null;
  });
  return kit;
}

/** One icon drawn and ready: stored bytes, their hash, and the decoded picture. */
interface PreparedIcon extends DiagramIconImage {
  readonly bytes: Uint8Array;
  readonly picture: HTMLImageElement | null;
}

/** By name and colour, for the life of the page; an icon is drawn once. */
const prepared = new Map<string, Promise<PreparedIcon>>();

const iconKey = (icon: DiagramIcon, color: string) => `${icon} ${color}`;

/** The colour an icon is drawn in on a box of this colour. */
function inkFor(icons: Kit['icons'], icon: DiagramIcon, color: DiagramColor | undefined): string {
  if (icons.isBrandIcon(icon)) return 'brand';
  return color ? DIAGRAM_PAINT[color].stroke : icons.ICON_NEUTRAL;
}

function prepare(icons: Kit['icons'], icon: DiagramIcon, ink: string): Promise<PreparedIcon> {
  const key = iconKey(icon, ink);
  let found = prepared.get(key);
  if (!found) {
    found = (async () => {
      const svg = icons.iconSvg(icon, ink === 'brand' ? icons.ICON_NEUTRAL : ink);
      const bytes = new TextEncoder().encode(svg);
      const mimeType = 'image/svg+xml';
      const picture = await decodeBlob(new Blob([svg], { type: mimeType })).catch(() => null);
      return {
        fileId: await sha256Hex(bytes),
        mimeType,
        naturalWidth: icons.ICON_PIXELS,
        naturalHeight: icons.ICON_PIXELS,
        bytes,
        picture,
      };
    })();
    prepared.set(key, found);
  }
  return found;
}

export interface ComposedDiagram {
  readonly shapes: Shape[];
  /** The icons the shapes show, by file id: what an insert uploads. */
  readonly icons: ReadonlyMap<string, CarriedImage>;
  /** The icons decoded, by file id, for drawing before anything is uploaded. */
  readonly pictures: ReadonlyMap<string, HTMLImageElement>;
  /** The same, as the renderer reads them. */
  readonly images: ImageSource;
}

/**
 * A diagram's lines made into shapes, laid out in full and with its icons.
 *
 * Falls back to the quick layout, without icons, if the kit cannot be loaded —
 * a diagram on the board without its icons beats no diagram.
 */
export async function composeDiagram(
  lines: readonly string[],
  genId: () => string,
  look: {
    style?: DiagramStyle;
    scale?: number;
    /** How a mind map is drawn: the layout, lines and outline new maps take. */
    mindMap?: Pick<ItemStyle, 'mapLayout' | 'mapLines' | 'topicShape'>;
  } = {},
): Promise<ComposedDiagram> {
  // A mind map is topics, laid out by the board's own mind map layout — no
  // kit, no icons — so a generated map is a map like one made by hand.
  if (isMindMapLines(lines)) {
    const outline = outlineFromMindMapLines(lines);
    const style: ItemStyle = {
      ...DEFAULT_ITEM_STYLE,
      ...(look.style ? { fontFamily: look.style.fontFamily } : {}),
      ...look.mindMap,
    };
    const shapes = outline
      ? layoutMindMaps(
          mindMapFromOutline(outline, { x: 0, y: 0 }, style, look.scale ?? 1, '', genId),
        )
      : [];
    return { shapes, icons: new Map(), pictures: new Map(), images: { get: () => null } };
  }

  let loaded: Kit;
  try {
    loaded = await loadKit();
  } catch {
    return {
      shapes: buildDiagram(lines, genId, look).shapes,
      icons: new Map(),
      pictures: new Map(),
      images: { get: () => null },
    };
  }

  const wanted = new Map<string, { icon: DiagramIcon; ink: string }>();
  for (const node of collectDiagram(lines).diagram.nodes) {
    if (!node.icon) continue;
    const ink = inkFor(loaded.icons, node.icon, node.color);
    wanted.set(iconKey(node.icon, ink), { icon: node.icon, ink });
  }
  const ready = new Map<string, PreparedIcon>();
  await Promise.all(
    [...wanted].map(async ([key, { icon, ink }]) => {
      try {
        ready.set(key, await prepare(loaded.icons, icon, ink));
      } catch {
        // Drawn without this icon.
      }
    }),
  );

  const { shapes } = await buildDiagramWithElk(lines, genId, {
    ...look,
    elk: loaded.elk,
    icons: (icon, color) => ready.get(iconKey(icon, inkFor(loaded.icons, icon, color))) ?? null,
  });

  const used = new Set(shapes.flatMap((shape) => (shape.kind === 'image' ? [shape.fileId] : [])));
  const icons = new Map<string, CarriedImage>();
  const pictures = new Map<string, HTMLImageElement>();
  for (const icon of ready.values()) {
    if (!used.has(icon.fileId)) continue;
    icons.set(icon.fileId, { mimeType: icon.mimeType, bytes: icon.bytes });
    if (icon.picture) pictures.set(icon.fileId, icon.picture);
  }
  return {
    shapes,
    icons,
    pictures,
    images: { get: (fileId) => pictures.get(fileId) ?? null },
  };
}
