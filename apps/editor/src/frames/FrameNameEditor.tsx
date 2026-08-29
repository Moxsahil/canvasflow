import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The input that appears over a frame's label while it is being renamed.
 *
 * A single-line input rather than the auto-growing textarea text shapes use: a
 * frame name is a handle for one thing, and a two-line name would collide with
 * the frame's own top edge.
 *
 * Positioned in screen space, because the label it replaces is drawn in screen
 * pixels too — the name stays the same size at every zoom, so an editor that
 * scaled with the board would not sit over the text it is editing.
 */

interface FrameNameEditorProps {
  /** Screen-space top-left of the band the label is drawn in. */
  position: { x: number; y: number };
  /**
   * Screen-space height of that band.
   *
   * The canvas draws the name on a baseline; an input is a box. Giving the box
   * the band's full height and centring the text in it lands the glyphs where
   * the painted ones were, without having to know the font's ascent.
   */
  height: number;
  /** Screen-space type size, already divided by zoom by the caller. */
  fontSize: number;
  fontFamily: string;
  color: string;
  /** The frame's stored name, which is blank for one that has never been named. */
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

export function FrameNameEditor({
  position,
  height,
  fontSize,
  fontFamily,
  color,
  initialName,
  onCommit,
  onCancel,
}: FrameNameEditorProps) {
  const [value, setValue] = useState(initialName);
  const ref = useRef<HTMLInputElement>(null);
  // Commit runs from Enter and from blur, and Enter moves focus. Without this
  // the same rename is written twice, which costs a second undo step.
  const settled = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Selected rather than cursor-at-end: renaming a frame almost always
    // replaces the name outright, and the common case is replacing the
    // placeholder the frame has never been given a real name over.
    el.select();
  }, []);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(value);
  };

  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Stopped here rather than left to bubble: the canvas listens on the
        // window, and a name containing "r" or "e" would otherwise change tool
        // halfway through being typed.
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
      aria-label="Frame name"
      spellCheck={false}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        height,
        margin: 0,
        padding: 0,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        color,
        // The same inversion .canvas-stack carries. This input is a sibling of
        // it, not a child, so the frame's stored colour would otherwise land
        // here unfiltered — near-black text on a dark board, while the label it
        // replaced was inverted to near-white. The text editor does the same.
        filter: 'var(--theme-filter)',
        font: `${fontSize}px ${fontFamily}`,
        // Centres the glyphs in the band, putting them where the painted
        // label's baseline was.
        lineHeight: `${height}px`,
        // Wide enough to keep typing into, without reaching so far across the
        // board that it covers what is beside the frame.
        width: `${Math.max(80, value.length * fontSize * 0.7 + fontSize * 2)}px`,
      }}
    />
  );
}
