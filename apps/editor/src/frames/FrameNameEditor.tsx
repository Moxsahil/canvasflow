import { useLayoutEffect, useRef, useState } from 'react';
import { SELECTION_COLOR } from '@canvasflow/canvas-engine';

/**
 * The input that appears over a frame's label while it is being renamed.
 *
 * Drawn as a panel with a ring around it rather than as bare text on the
 * board. A frame's name is painted as plain text, so an editor that was also
 * plain text would be invisible as an editor — you could not tell the click
 * had done anything, and an empty name would leave nothing on screen at all.
 * The box is the affordance: it says a field is open and shows where it ends.
 *
 * Chrome, not board content. Its colours come from the theme rather than from
 * the frame, so unlike the label it replaces it is not run through the
 * dark-mode inversion — the panel and ring are already correct in both themes.
 *
 * A single-line input rather than the auto-growing textarea text shapes use: a
 * frame name is a handle for one thing, and a second line would collide with
 * the frame's own top edge.
 */

/** Matches the padding built into the label's own box. */
const PADDING_X = 6;

/** Never narrower than this, so an empty field is still a visible target. */
const MIN_WIDTH = 32;

/**
 * Height of the field, in screen pixels.
 *
 * Comfortably taller than the text rather than hugging it. The band the label
 * is painted in is only as tall as the type plus its gap, and a box that size
 * reads as text with a line round it rather than as somewhere to type.
 */
const BOX_HEIGHT = 24;

/**
 * Clearance between the bottom of the field and the frame's top edge.
 *
 * Without it the box sits on the border, and the two rectangles read as one
 * shape with a bite out of the corner.
 */
const BOX_LIFT = 4;

interface FrameNameEditorProps {
  /** Screen-space top-left of the band the label is drawn in. */
  position: { x: number; y: number };
  /**
   * Screen-space height of that band.
   *
   * Used to find the band's bottom edge, which is the frame's top — the field
   * is hung off that rather than off the band's top, so its own height can
   * differ from the label's without drifting on to the border.
   */
  height: number;
  /** Screen-space type size, already divided by zoom by the caller. */
  fontSize: number;
  fontFamily: string;
  /** Shown greyed when the field is empty — the name the frame falls back to. */
  placeholder: string;
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
  placeholder,
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
    // placeholder a frame has never been given a real name over.
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
      placeholder={placeholder}
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
        // Pulled left by its own padding so the text inside sits where the
        // painted label's first glyph was, rather than indented from it.
        left: position.x - PADDING_X,
        // Sat on the band's bottom edge — the frame's top — and lifted clear
        // of it, rather than filling the band. The field is taller than the
        // label it replaces, so it grows upward into the board's own space
        // instead of down over the frame.
        top: position.y + height - BOX_LIFT - BOX_HEIGHT,
        height: BOX_HEIGHT,
        minWidth: MIN_WIDTH,
        // Tracks what is being typed, and falls back to the placeholder's
        // length so an empty field is still wide enough to aim at.
        width: `${Math.max(MIN_WIDTH, (value.length || placeholder.length) * fontSize * 0.62 + PADDING_X * 2)}px`,
        margin: 0,
        padding: `0 ${PADDING_X}px`,
        border: 'none',
        outline: 'none',
        borderRadius: 'var(--border-radius-md)',
        background: 'var(--island-bg-color)',
        color: 'var(--text-primary-color)',
        // A ring drawn inside the box, so it reads as a focused field without
        // the box growing by the width of a border and shifting the text.
        boxShadow: `inset 0 0 0 1.5px ${SELECTION_COLOR}`,
        font: `${fontSize}px ${fontFamily}`,
        lineHeight: `${BOX_HEIGHT}px`,
      }}
    />
  );
}
