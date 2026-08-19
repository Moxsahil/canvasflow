import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findTextMatches,
  isText,
  matchRects,
  shapeBounds,
  type Camera,
  type Rect,
  type Shape,
  type TextMatch,
  type TextShape,
} from '@canvasflow/canvas-engine';

const SEARCH_DEBOUNCE_MS = 120;

const LEGIBLE_FONT_PX = 14;

/** Never zoom past this chasing a tiny match. */
const MAX_FOCUS_ZOOM = 5;

export interface SearchHighlights {
  readonly rects: readonly Rect[];
  readonly focusedRects: readonly Rect[];
}

export interface CanvasSearch {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  /**
   * Bumped every time the search is asked to open, including when it already
   * is. The bar watches it to re-select the field, so a second ⌘F lets you
   * retype immediately — what browsers do with their own find.
   */
  focusRequest: number;
  query: string;
  setQuery: (query: string) => void;
  matchCount: number;
  /** More matches exist than were collected — the UI shows "1000+". */
  truncated: boolean;
  /** Position of the focused match, 1-based for display; 0 when none. */
  focusPosition: number;
  goToNext: () => void;
  goToPrevious: () => void;
  highlights: SearchHighlights;
}

interface UseCanvasSearchOptions {
  shapes: readonly Shape[];
  camera: Camera;
  viewport: { width: number; height: number };
  onCameraChange: (camera: Camera) => void;
}

/** Screen-space test with a margin, so a match never hides under the find bar. */
function isFullyVisible(rect: Rect, camera: Camera, viewport: { width: number; height: number }) {
  const margin = 24;
  const left = (rect.x - camera.x) * camera.zoom;
  const top = (rect.y - camera.y) * camera.zoom;
  const right = left + rect.width * camera.zoom;
  const bottom = top + rect.height * camera.zoom;
  return (
    left >= margin &&
    top >= margin + 48 &&
    right <= viewport.width - margin &&
    bottom <= viewport.height - margin
  );
}

function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Find-on-canvas state.
 *
 * The work is split by cost, which a measurement drove: locating matches is
 * microseconds, so it runs over the whole board on every (debounced) keystroke;
 * turning a match into highlight rectangles costs two text measurements each,
 * ~60 ms at a thousand matches, so it runs only for matches whose shape is
 * actually on screen, plus the focused one. Panning re-measures only what came
 * into view, and the engine memoises the measurements underneath.
 */
export function useCanvasSearch({
  shapes,
  camera,
  viewport,
  onCameraChange,
}: UseCanvasSearchOptions): CanvasSearch {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const textShapes = useMemo(() => {
    const map = new Map<string, TextShape>();
    for (const shape of shapes) {
      if (isText(shape)) map.set(shape.id, shape);
    }
    return map;
  }, [shapes]);

  const { matches, truncated } = useMemo(() => {
    if (!open) return { matches: [] as readonly TextMatch[], truncated: false };
    return findTextMatches(shapes, debouncedQuery);
  }, [open, shapes, debouncedQuery]);

  // Focus resets to the first match nearest the current view, so opening the
  // bar on a big board doesn't fling the camera to a match at the far end.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    if (matches.length === 0) {
      setFocusIndex(0);
      return;
    }
    const current = cameraRef.current;
    const size = viewportRef.current;
    const firstVisible = matches.findIndex((match) => {
      const shape = textShapes.get(match.shapeId);
      if (!shape) return false;
      const bounds = shapeBounds(shape);
      const left = (bounds.x - current.x) * current.zoom;
      const top = (bounds.y - current.y) * current.zoom;
      return (
        left + bounds.width * current.zoom > 0 &&
        top + bounds.height * current.zoom > 0 &&
        left < size.width &&
        top < size.height
      );
    });
    setFocusIndex(firstVisible === -1 ? 0 : firstVisible);
  }, [matches, textShapes]);

  const focused = matches[focusIndex];

  const focusedRects = useMemo(() => {
    if (!focused) return [];
    const shape = textShapes.get(focused.shapeId);
    return shape ? matchRects(shape, focused.index, focused.length) : [];
  }, [focused, textShapes]);

  // Only matches whose shape is on screen get measured. The bounds test is
  // free; the measurement it avoids is not.
  const visibleRects = useMemo(() => {
    if (matches.length === 0) return [];
    const rects: Rect[] = [];
    for (const match of matches) {
      if (match === focused) continue;
      const shape = textShapes.get(match.shapeId);
      if (!shape) continue;
      const bounds = shapeBounds(shape);
      const left = (bounds.x - camera.x) * camera.zoom;
      const top = (bounds.y - camera.y) * camera.zoom;
      if (
        left + bounds.width * camera.zoom <= 0 ||
        top + bounds.height * camera.zoom <= 0 ||
        left >= viewport.width ||
        top >= viewport.height
      ) {
        continue;
      }
      rects.push(...matchRects(shape, match.index, match.length));
    }
    return rects;
  }, [matches, focused, textShapes, camera, viewport.width, viewport.height]);

  useEffect(() => {
    if (!open || !focused || focusedRects.length === 0) return;
    const target = union(focusedRects);
    if (!target) return;

    const current = cameraRef.current;
    const size = viewportRef.current;
    if (size.width === 0 || size.height === 0) return;

    const shape = textShapes.get(focused.shapeId);
    const fontSize = shape?.fontSize ?? 16;
    const tooSmall = fontSize * current.zoom < LEGIBLE_FONT_PX;

    if (isFullyVisible(target, current, size) && !tooSmall) return;

    const zoom = tooSmall
      ? Math.min(MAX_FOCUS_ZOOM, Math.max(current.zoom, LEGIBLE_FONT_PX / fontSize))
      : current.zoom;

    onCameraChange({
      x: target.x + target.width / 2 - size.width / (2 * zoom),
      y: target.y + target.height / 2 - size.height / (2 * zoom),
      zoom,
    });
    // Camera and viewport are read through refs on purpose: as dependencies
    // they would re-run this on every pan and drag the view back to the match.
  }, [open, focused, focusedRects, textShapes, onCameraChange]);

  const goToNext = useCallback(() => {
    setFocusIndex((index) => (matches.length === 0 ? 0 : (index + 1) % matches.length));
  }, [matches.length]);

  const goToPrevious = useCallback(() => {
    setFocusIndex((index) =>
      matches.length === 0 ? 0 : (index - 1 + matches.length) % matches.length,
    );
  }, [matches.length]);

  const [focusRequest, setFocusRequest] = useState(0);

  const openSearch = useCallback(() => {
    setOpen(true);
    setFocusRequest((count) => count + 1);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
  }, []);

  return {
    open,
    openSearch,
    closeSearch,
    focusRequest,
    query,
    setQuery,
    matchCount: matches.length,
    truncated,
    focusPosition: matches.length === 0 ? 0 : focusIndex + 1,
    goToNext,
    goToPrevious,
    highlights: { rects: visibleRects, focusedRects },
  };
}
