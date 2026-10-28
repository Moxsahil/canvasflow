import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, Expand, Maximize, Minus, Plus, Shrink } from 'lucide-react';
import {
  ImageCache,
  SpatialIndex,
  computeBoundingRect,
  hitTest,
  isBookmark,
  isEmbed,
  isImage,
  readPreviewImageName,
  type ImageSource,
  type Shape,
} from '@canvasflow/canvas-engine';
import { Button } from '@/components/ui/button';
import { Component as Loader } from '@/components/ui/loader-1';
import { cn } from '@/lib/utils';
import { useCanvasResize } from '../canvas/hooks/useCanvasResize';
import { useDevicePixelRatio } from '../canvas/hooks/useDevicePixelRatio';
import { useStaticRender } from '../canvas/hooks/useStaticRender';
import { isMac } from '../help/platform';
import { useT } from '../i18n';
import { env } from '../lib/env';
import type { Camera } from '../machine/tool-machine.types';
import { CANVAS_BACKGROUND } from '../properties/palette';
import { darkThemeMediaQuery, getSystemTheme, type ResolvedTheme } from '../theme/theme';
import {
  EmbedMissingError,
  fetchEmbedPicture,
  fetchEmbeddedBoard,
  type EmbeddedBoard,
} from './embed-client';
import { sceneShapes, shapeLink } from './scene-shapes';
import { clampZoom, fitCamera, panBy, toWorld, zoomAt, zoomStep } from './view-camera';

/** How often an open embed asks whether the board has changed, while it can be seen. */
const REFRESH_MS = 30_000;
/** A press that moves less than this, in screen pixels, is a click rather than a drag. */
const CLICK_SLOP = 5;
/** How long the "hold Ctrl to zoom" hint stays after the last plain scroll. */
const HINT_MS = 1500;

type Load =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; board: EmbeddedBoard; shapes: Shape[] };

/** `?theme=light` or `?theme=dark` in the embed code, or the reader's own setting. */
function useEmbedTheme(): ResolvedTheme {
  const asked = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('theme');
    return value === 'light' || value === 'dark' ? value : null;
  }, []);
  const [system, setSystem] = useState<ResolvedTheme>(getSystemTheme);
  useEffect(() => {
    const query = darkThemeMediaQuery();
    if (!query) return;
    const update = () => setSystem(getSystemTheme());
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return asked ?? system;
}

/** Whether the page is the one on screen, so a tab in the background asks nothing. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/**
 * A board shown on another site: Share → Embed on a website.
 *
 * Read-only, and only what the board draws — the gateway sends its shapes and
 * nothing else in its document. The reader can look around it: drag to move,
 * pinch or Ctrl + scroll to zoom, and a plain scroll is left to the page it
 * sits in, so the board is not a trap for someone reading past it. A click on
 * a link card, an embed or a shape with a link opens its page in a new tab,
 * and Open in CanvasFlow opens the board itself.
 *
 * It stays current by asking again every little while the page is on screen;
 * the gateway answers "not changed" when the board has not.
 */
export function EmbedView({ embedId }: { embedId: string }) {
  const t = useT();
  const theme = useEmbedTheme();
  const visible = usePageVisible();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const refresh = useCallback(async () => {
    try {
      const board = await fetchEmbeddedBoard(embedId);
      setLoad((current) =>
        // The same board as last time keeps the same shapes, so nothing repaints.
        current.status === 'ready' && JSON.stringify(current.board) === JSON.stringify(board)
          ? current
          : { status: 'ready', board, shapes: sceneShapes(board.shapes) },
      );
    } catch (error) {
      if (error instanceof EmbedMissingError) {
        setLoad({ status: 'missing' });
        return;
      }
      // A blip while the board is on screen leaves it there until the next try.
      setLoad((current) => (current.status === 'ready' ? current : { status: 'failed' }));
    }
  }, [embedId]);

  useEffect(() => {
    if (!visible) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [visible, refresh]);

  const title = load.status === 'ready' ? load.board.title : null;
  useEffect(() => {
    document.title = title ? `${title} · CanvasFlow` : 'CanvasFlow';
  }, [title]);

  return (
    <div
      className="cf-editor"
      data-theme={theme}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: CANVAS_BACKGROUND[theme],
      }}
    >
      {load.status === 'ready' ? (
        <Board embedId={embedId} board={load.board} shapes={load.shapes} theme={theme} />
      ) : load.status === 'loading' ? (
        <div role="status" className="flex h-full items-center justify-center text-[#a3a3a3]">
          <Loader className="size-20" />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium text-sidebar-foreground">
            {load.status === 'missing' ? t('embedView.missingTitle') : t('embedView.failed')}
          </p>
          {load.status === 'missing' ? (
            <p className="max-w-sm text-xs text-muted-foreground">{t('embedView.missingHint')}</p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoad({ status: 'loading' });
                void refresh();
              }}
            >
              {t('embedView.retry')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Every chrome surface on the page: the editor's dock, edge to edge. */
const BAR =
  'absolute bottom-3 z-(--zIndex-layerUI) flex items-center gap-1 rounded-card border border-(--dock-border-color) bg-(--dock-bg-color) px-1.5 py-1 text-sidebar-foreground';
const ICON_BUTTON = 'size-(--default-button-size) text-sidebar-foreground';

function Board({
  embedId,
  board,
  shapes,
  theme,
}: {
  embedId: string;
  board: EmbeddedBoard;
  shapes: Shape[];
  theme: ResolvedTheme;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useCanvasResize(containerRef);
  const devicePixelRatio = useDevicePixelRatio();

  // --- where it looks ------------------------------------------------------
  const region = useMemo(() => computeBoundingRect(shapes), [shapes]);

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  // Fitted to the board until the reader moves it, then left where they put it.
  const moved = useRef(false);
  const fit = useCallback(() => {
    if (!region || width === 0 || height === 0) return;
    setCamera(fitCamera(region, width, height));
  }, [region, width, height]);
  useEffect(() => {
    if (!moved.current) fit();
  }, [fit]);
  const move = useCallback((next: Camera) => {
    moved.current = true;
    setCamera(next);
  }, []);

  // --- pictures ------------------------------------------------------------
  const [revision, setRevision] = useState(0);
  const images = useMemo(
    () => new ImageCache({ fetch: (id) => fetchEmbedPicture(embedId, 'images', id) }),
    [embedId],
  );
  const previews = useMemo(
    () => new ImageCache({ fetch: (name) => fetchEmbedPicture(embedId, 'previews', name) }),
    [embedId],
  );
  useEffect(() => {
    const bump = () => setRevision((n) => n + 1);
    const stopImages = images.subscribe(bump);
    const stopPreviews = previews.subscribe(bump);
    return () => {
      stopImages();
      stopPreviews();
    };
  }, [images, previews]);
  useEffect(() => {
    const imageIds: string[] = [];
    const pictureNames: string[] = [];
    for (const shape of shapes) {
      if (isImage(shape)) imageIds.push(shape.fileId);
      const picture = isBookmark(shape)
        ? readPreviewImageName(shape.image)
        : isEmbed(shape)
          ? readPreviewImageName(shape.poster)
          : null;
      if (picture) pictureNames.push(picture);
    }
    images.ensure(imageIds.filter((id) => !images.has(id)));
    previews.ensure(pictureNames.filter((name) => !previews.has(name)));
  }, [shapes, images, previews]);
  const pictures = useMemo<ImageSource>(
    () => ({ get: (id: string) => images.get(id) ?? previews.get(id) }),
    [images, previews],
  );

  useStaticRender(canvasRef, {
    width,
    height,
    shapes,
    camera,
    devicePixelRatio,
    images: pictures,
    imageRevision: revision,
    darkMode: theme === 'dark',
  });

  // --- links ---------------------------------------------------------------
  const index = useMemo(() => {
    const spatial = new SpatialIndex();
    spatial.rebuild(shapes);
    return spatial;
  }, [shapes]);
  const linkAt = useCallback(
    (screen: { x: number; y: number }): string | null => {
      const view = cameraRef.current;
      const world = toWorld(view, screen);
      const shape = hitTest(shapes, index, world.x, world.y, view.zoom);
      return shape ? shapeLink(shape) : null;
    },
    [shapes, index],
  );

  // --- moving about --------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number; travel: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overLink, setOverLink] = useState(false);

  const pointOf = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointOf(event);
    pointers.current.set(event.pointerId, point);
    press.current = pointers.current.size === 1 ? { ...point, travel: 0 } : null;
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointOf(event);
    const before = pointers.current.get(event.pointerId);
    if (!before) {
      if (event.pointerType === 'mouse') setOverLink(linkAt(point) !== null);
      return;
    }
    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId);
    pointers.current.set(event.pointerId, point);

    if (others.length === 0) {
      if (press.current) press.current.travel += Math.hypot(point.x - before.x, point.y - before.y);
      move(panBy(cameraRef.current, point.x - before.x, point.y - before.y));
      return;
    }
    // Two fingers: the gap between them sets the zoom, and their middle moves the view.
    const other = others[0]![1];
    const gapBefore = Math.hypot(before.x - other.x, before.y - other.y);
    const gapNow = Math.hypot(point.x - other.x, point.y - other.y);
    const middleBefore = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
    const middleNow = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
    const view = cameraRef.current;
    const zoomed =
      gapBefore > 0 ? zoomAt(view, middleBefore, view.zoom * (gapNow / gapBefore)) : view;
    move(panBy(zoomed, middleNow.x - middleBefore.x, middleNow.y - middleBefore.y));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    const pressed = press.current;
    press.current = null;
    if (pointers.current.size === 0) setDragging(false);
    if (event.type !== 'pointerup' || !pressed || pressed.travel > CLICK_SLOP) return;
    const link = linkAt(pointOf(event));
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  };

  // Ctrl + scroll (and a trackpad pinch, which arrives as one) zooms; a plain
  // scroll is the page's, and says how to zoom instead.
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let hideTimer: number | undefined;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const view = cameraRef.current;
        const delta = Math.max(-50, Math.min(50, event.deltaY));
        move(
          zoomAt(
            view,
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            clampZoom(view.zoom * Math.exp(-delta * 0.01)),
          ),
        );
        setHint(false);
        return;
      }
      if (Math.abs(event.deltaY) < 1) return;
      setHint(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setHint(false), HINT_MS);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      window.clearTimeout(hideTimer);
    };
  }, [move]);

  // --- full screen ---------------------------------------------------------
  const canFullscreen =
    typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled;
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  const openUrl = `${window.location.origin}/boards/${encodeURIComponent(board.boardId)}`;
  const zoomPercent = Math.round(camera.zoom * 100);
  // The two bars share the bottom edge. Narrower, the pill drops the board's
  // name; narrower still, the zoom bar goes — pinching and Ctrl + scroll stay.
  const narrow = width > 0 && width < 480;
  const roomForZoom = width >= 430;

  return (
    <>
      <div
        ref={containerRef}
        role="img"
        aria-label={t('embedView.label', { name: board.title })}
        className="absolute inset-0"
        style={{
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : overLink ? 'pointer' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setOverLink(false)}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {!region && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t('embedView.empty')}
        </p>
      )}

      <div
        aria-hidden={!hint}
        className={cn(
          'pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center transition-opacity duration-200',
          hint ? 'opacity-100' : 'opacity-0',
        )}
      >
        <p className="rounded-card bg-black/70 px-3 py-2 text-xs text-white">
          {t('embedView.zoomHint', { key: isMac() ? '⌘' : 'Ctrl' })}
        </p>
      </div>

      <a
        href={openUrl}
        target="_blank"
        rel="noopener"
        title={t('embedView.open')}
        className={cn(
          BAR,
          'left-3 h-[38px] max-w-[calc(100%-1.5rem)] gap-2 pr-2.5 pl-2 text-xs no-underline transition-colors hover:bg-(--button-hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <img src="/brand/apple-touch-icon.png" alt="" className="size-5 shrink-0 rounded-[5px]" />
        {!narrow && <span className="min-w-0 truncate font-medium">{board.title}</span>}
        {!narrow && (
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-(--dock-separator-color)" />
        )}
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">
          {t('embedView.open')}
        </span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </a>

      {/* Free plans carry the badge; a paid workspace's embeds are its own. */}
      {board.badge !== false && (
        <a
          href={env.VITE_WEB_URL}
          target="_blank"
          rel="noopener"
          className={cn(
            BAR,
            'top-3 right-3 bottom-auto h-[30px] gap-1.5 pr-2.5 pl-1.5 text-[11px] whitespace-nowrap text-muted-foreground no-underline transition-colors hover:bg-(--button-hover-bg) hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <img src="/brand/apple-touch-icon.png" alt="" className="size-4 shrink-0 rounded-[4px]" />
          {t('embedView.madeWith')}
        </a>
      )}

      {roomForZoom && (
        <div role="toolbar" aria-label={t('zoom.viewControls')} className={cn(BAR, 'right-3')}>
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BUTTON}
            aria-label={t('commands.zoomOut')}
            title={t('commands.zoomOut')}
            onClick={() => move(zoomStep(camera, -1, width, height))}
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            className="h-(--default-button-size) w-11 px-0 text-xs tabular-nums text-muted-foreground"
            aria-label={t('zoom.resetCurrently', { percent: zoomPercent })}
            title={t('zoom.reset')}
            onClick={() => move(zoomAt(camera, { x: width / 2, y: height / 2 }, 1))}
          >
            {`${zoomPercent}%`}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BUTTON}
            aria-label={t('commands.zoomIn')}
            title={t('commands.zoomIn')}
            onClick={() => move(zoomStep(camera, 1, width, height))}
          >
            <Plus />
          </Button>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-(--dock-separator-color)" />
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BUTTON}
            aria-label={t('zoom.fitAll')}
            title={t('zoom.fitAll')}
            disabled={!region}
            onClick={fit}
          >
            <Maximize />
          </Button>
          {canFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              className={ICON_BUTTON}
              aria-label={fullscreen ? t('embedView.exitFullscreen') : t('embedView.fullscreen')}
              title={fullscreen ? t('embedView.exitFullscreen') : t('embedView.fullscreen')}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Shrink /> : <Expand />}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
