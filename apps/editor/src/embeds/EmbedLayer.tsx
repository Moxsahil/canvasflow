import { useEffect, useMemo, useRef, useState } from 'react';
import { isEmbed, resolveEmbed, type EmbedShape, type Shape } from '@canvasflow/canvas-engine';
import { useT } from '../i18n';
import type { Camera } from '../machine/tool-machine.types';
import type { Size } from '../properties/halo-placement';
import { EMBED_ALLOW, embedSandbox, embedScreenBox, onBoard } from './embed-frame';

interface EmbedLayerProps {
  /** What is on the board and shown, in the order the board draws it. */
  shapes: readonly Shape[];
  camera: Camera;
  board: Size;
  /** The embed taking presses, if one is. Every other page lets them through. */
  activeId: string | null;
  /** The embed whose middle the pointer is over, which says how to use it. */
  hoveredId: string | null;
}

/**
 * The page of every embed on the board, live, over the card the canvas draws
 * for it.
 *
 * A page is loaded the first time its embed comes into view and kept from
 * then on, so scrolling it off screen and back neither reloads it nor stops
 * what it was playing. It lets presses through to the board until a click on
 * its middle hands them to it; any press back on the board hands them back.
 */
export function EmbedLayer({ shapes, camera, board, activeId, hoveredId }: EmbedLayerProps) {
  const embeds = useMemo(
    () =>
      shapes.filter((shape): shape is EmbedShape => isEmbed(shape) && !!resolveEmbed(shape.url)),
    [shapes],
  );
  // Remembered across renders rather than held in state: it only ever grows,
  // and it grows while rendering, from what that render finds on screen.
  const loaded = useRef(new Set<string>());

  const placed = embeds.flatMap((shape) => {
    const box = embedScreenBox(shape, camera);
    const visible = onBoard(box, board);
    if (visible) loaded.current.add(shape.id);
    return visible || loaded.current.has(shape.id) ? [{ shape, box, visible }] : [];
  });
  if (placed.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-(--zIndex-wysiwyg) overflow-hidden"
      data-testid="embed-layer"
    >
      {placed.map(({ shape, box, visible }) => (
        <LiveEmbed
          key={shape.id}
          shape={shape}
          box={box}
          visible={visible}
          zoom={camera.zoom}
          active={shape.id === activeId}
          hovered={shape.id === hoveredId && shape.id !== activeId}
        />
      ))}
    </div>
  );
}

function LiveEmbed({
  shape,
  box,
  visible,
  zoom,
  active,
  hovered,
}: {
  shape: EmbedShape;
  box: { x: number; y: number; width: number; height: number };
  visible: boolean;
  zoom: number;
  active: boolean;
  hovered: boolean;
}) {
  const t = useT();
  // Until its page has loaded, the card the board draws shows through as
  // the loading state. After, a document is given the white a browser tab
  // would: one with no background of its own is see-through in a frame, and
  // the card's words would show between its parts. A player paints its own,
  // and a box drawn taller than it keeps the card around it rather than white.
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Handing the presses back hands the keyboard back too. A press on the
  // board does not move focus by itself — the board keeps the browser from
  // doing anything with it — so without this, Delete, Ctrl+C and every other
  // shortcut would go on reaching the page, which cannot do anything with them.
  useEffect(() => {
    const frame = frameRef.current;
    if (!active && frame && document.activeElement === frame) frame.blur();
  }, [active]);
  const embed = resolveEmbed(shape.url);
  if (!embed) return null;

  const frame = embed.frame;
  // A page keeps the layout it has at 1:1 and is scaled with the board, so
  // zooming does not reflow a document under the reader. A player is sized to
  // the screen instead, so it renders sharp at whatever size it is shown.
  const scaled = embed.provider.medium === 'page';
  const radius = Math.min(10, Math.min(shape.width, shape.height) / 4) * zoom;

  return (
    <div
      className="absolute flex items-center justify-center overflow-hidden"
      style={{
        // Off screen it is kept, not drawn: hiding it rather than unmounting
        // is what keeps a video playing through a scroll.
        display: visible ? 'flex' : 'none',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: radius,
        opacity: shape.opacity / 100,
        background: loaded && scaled ? '#ffffff' : undefined,
        pointerEvents: active ? 'auto' : 'none',
      }}
      data-testid="embed-live"
      data-active={active || undefined}
    >
      <iframe
        title={t('embeds.frameTitle', { site: embed.provider.name })}
        {...('src' in frame ? { src: frame.src } : { srcDoc: frame.srcdoc })}
        sandbox={embedSandbox(frame)}
        allow={EMBED_ALLOW}
        allowFullScreen
        ref={frameRef}
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
        // Out of the tab order until it takes presses: tabbing through the
        // board should not wander into a page that is only being shown.
        tabIndex={active ? 0 : -1}
        className="absolute top-0 left-0 block border-0"
        style={
          scaled
            ? {
                width: shape.width,
                height: shape.height,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
                borderRadius: radius / zoom,
              }
            : { width: box.width, height: box.height, borderRadius: radius }
        }
      />
      {hovered && (
        <div
          className="relative z-[1] rounded-[12px] bg-black/50 px-[1.6rem] py-[1rem] font-bold tracking-[0.6px] text-white"
          data-testid="embed-hint"
        >
          {t('embeds.clickToInteract')}
        </div>
      )}
    </div>
  );
}
