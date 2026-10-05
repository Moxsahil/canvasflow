import {
  MAX_LINK_LENGTH,
  computeBoundingRect,
  linkLabel,
  type Rect,
  type Shape,
} from '@canvasflow/canvas-engine';

/**
 * Links to a place on a board: the board's own address with the shapes to
 * look at added, so the link opens the board with them in view.
 *
 * The ids go in the address rather than a position, so the link keeps
 * finding its shapes after they have been moved. Only a selection too big
 * to name — past the length a shape's own link may be — is linked as the
 * area it covers instead, which is the one form that does not follow.
 */

/** `?shapes=id.id` — the shapes, by id. */
const SHAPES_PARAM = 'shapes';
/** `?area=x.y.w.h` — a region, for a selection too big to name. */
const AREA_PARAM = 'area';

export type ShapeLinkTarget =
  | { readonly kind: 'shapes'; readonly ids: readonly string[] }
  | { readonly kind: 'area'; readonly rect: Rect };

/**
 * A link to `shapes` on the board at `boardUrl`.
 *
 * Built from the board's address with any earlier target and fragment taken
 * off, so copying from a board opened by one of these links points at the
 * new selection and not the old one.
 */
export function shapeLinkFor(boardUrl: string, shapes: readonly Shape[]): string {
  const url = withoutShapeLink(boardUrl);
  url.searchParams.set(SHAPES_PARAM, shapes.map((shape) => encodeId(shape.id)).join('.'));
  if (url.href.length <= MAX_LINK_LENGTH) return url.href;

  // Too long to keep on a shape as its link. Its area still fits, and still
  // opens the board on the same view.
  const rect = computeBoundingRect(shapes);
  url.searchParams.delete(SHAPES_PARAM);
  if (rect) {
    url.searchParams.set(
      AREA_PARAM,
      [rect.x, rect.y, rect.width, rect.height].map((n) => Math.round(n)).join('.'),
    );
  }
  return url.href;
}

/** What a link points at on its board, or null when it names no place on one. */
export function readShapeLink(link: string | URL): ShapeLinkTarget | null {
  const url = parse(link);
  if (!url) return null;

  const shapes = url.searchParams.get(SHAPES_PARAM);
  if (shapes) {
    const ids = shapes
      .split('.')
      .filter(Boolean)
      .map((id) => safeDecode(id));
    if (ids.length > 0) return { kind: 'shapes', ids };
  }

  const area = url.searchParams.get(AREA_PARAM);
  if (area) {
    const [x, y, width, height] = area.split('.').map(Number);
    if ([x, y, width, height].every((n) => Number.isFinite(n)) && width! >= 0 && height! >= 0) {
      return { kind: 'area', rect: { x: x!, y: y!, width: width!, height: height! } };
    }
  }
  return null;
}

/** The address without a place on the board — the board itself. */
export function withoutShapeLink(link: string | URL): URL {
  const url = new URL(link);
  url.searchParams.delete(SHAPES_PARAM);
  url.searchParams.delete(AREA_PARAM);
  url.hash = '';
  return url;
}

/** Whether a link is to a place on the board at `here`, which is open. */
export function isLinkToThisBoard(link: string, here: string): boolean {
  const url = parse(link);
  const current = parse(here);
  return (
    url !== null &&
    current !== null &&
    url.origin === current.origin &&
    url.pathname === current.pathname &&
    readShapeLink(url) !== null
  );
}

/**
 * Where on the board a target is, from the shapes it names that are still
 * there; null when none are. An area is where it says.
 */
export function shapeLinkRect(target: ShapeLinkTarget, shapes: readonly Shape[]): Rect | null {
  if (target.kind === 'area') return target.rect;
  const ids = new Set(target.ids);
  return computeBoundingRect(shapes.filter((shape) => ids.has(shape.id)));
}

/** Whether every shape a target names is on the board. An area always is. */
export function shapeLinkComplete(target: ShapeLinkTarget, shapes: readonly Shape[]): boolean {
  if (target.kind === 'area') return true;
  const present = new Set(shapes.map((shape) => shape.id));
  return target.ids.every((id) => present.has(id));
}

/**
 * How a link reads on screen. One to a place on the board that is open says
 * so, rather than spelling out an address nobody needs to read; anything else
 * is its address.
 */
export function describeLink(link: string, here: string): { label: string; onThisBoard: boolean } {
  if (!isLinkToThisBoard(link, here)) return { label: linkLabel(link), onThisBoard: false };
  const target = readShapeLink(link)!;
  if (target.kind === 'area') return { label: 'An area of this board', onThisBoard: true };
  const count = target.ids.length;
  return {
    label: count === 1 ? '1 shape on this board' : `${count} shapes on this board`,
    onThisBoard: true,
  };
}

/** Dots separate the ids, so one inside an id is escaped. */
function encodeId(id: string): string {
  return encodeURIComponent(id).replace(/\./g, '%2E');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parse(link: string | URL): URL | null {
  try {
    return new URL(link);
  } catch {
    return null;
  }
}

/** The parts of a click that decide whether it is an ordinary one. */
interface LinkClick {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  preventDefault(): void;
}

/**
 * A plain click on a link is offered to `follow` first, which takes it when
 * the link is to a place on this board — moving the view there beats loading
 * the board again around it. Any other click (a modifier held, the middle
 * button) is the browser's: a new tab or window, as anywhere else.
 */
export function followLinkClick(
  event: LinkClick,
  link: string,
  follow: ((link: string) => boolean) | undefined,
): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  if (follow?.(link)) event.preventDefault();
}
