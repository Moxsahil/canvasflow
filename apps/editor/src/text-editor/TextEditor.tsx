import { useLayoutEffect, useRef, useState } from 'react';

interface TextEditorProps {
  /** Screen-space position (already converted from world space via camera). */
  position: { x: number; y: number };
  /**
   * Where `position` sits relative to the text: its top-left, or its centre.
   *
   * A caption typed into the middle of something has to stay in the middle as
   * it grows, or what is on screen drifts away from where it will land.
   */
  align?: 'left' | 'center';
  /**
   * The room inside a shape the words are written in, in screen space. Given,
   * the box wraps its lines to this width, aligns them in it by `textAlign`
   * and stands in the middle of it top to bottom — where the shape's words
   * are drawn — and `position` and `align` are not read.
   */
  wrap?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly textAlign: 'left' | 'center' | 'right';
  };
  /** Screen-space font size (already scaled by camera zoom). */
  fontSize: number;
  fontFamily: string;
  color: string;
  initialText?: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
  /**
   * Every keystroke, for publishing to collaborators.
   *
   * Separate from `onCommit` because it fires constantly and means something
   * different: this is what is being typed, not what has been decided.
   */
  onChange?: (text: string) => void;
}

export function TextEditor({
  position,
  align = 'left',
  wrap,
  fontSize,
  fontFamily,
  color,
  initialText,
  onCommit,
  onCancel,
  onChange,
}: TextEditorProps) {
  const [value, setValue] = useState(initialText ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fontSize);
  const [wrappedHeight, setWrappedHeight] = useState(fontSize * 1.2);
  const wrapWidth = wrap?.width;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Cursor at the end of the existing text, not a select-all or position 0.
    const length = el.value.length;
    el.setSelectionRange(length, length);
  }, []);

  // Auto-grow the textarea to fit its content, measured via a hidden mirror
  // using the same font, so width tracks what's actually being typed.
  useLayoutEffect(() => {
    if (wrapWidth !== undefined) {
      // Wrapped to a fixed width, the mirror measures how tall the lines are.
      setWrappedHeight(Math.max(fontSize * 1.2, measureRef.current?.offsetHeight ?? 0));
      return;
    }
    const measured = measureRef.current?.scrollWidth ?? 0;
    // Small trailing buffer so the caret has room past the last character.
    setWidth(Math.max(fontSize, measured + fontSize * 0.6));
    // The width alone, not the object: the editor hands a new one every render.
  }, [value, fontSize, fontFamily, wrapWidth]);

  // Always commit on blur/Enter — the caller (Editor.tsx) decides what an
  // empty commit means (discard a new box vs. delete an edited shape).
  // Escape is the only path that reverts without committing.
  const commit = () => {
    onCommit(value);
  };

  const font = `${fontSize}px ${fontFamily}`;
  const lineCount = value.split('\n').length;
  const centred = align === 'center';
  // Wrapping as the canvas wraps: between words, and inside a word only when
  // it is wider than the line.
  const wrapping = wrap
    ? ({ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const)
    : ({ whiteSpace: 'pre' } as const);
  const height = wrap ? wrappedHeight : lineCount * fontSize * 1.2;
  const left = wrap ? wrap.x : centred ? position.x - width / 2 : position.x;
  const top = wrap
    ? wrap.y + Math.max(0, (wrap.height - height) / 2)
    : centred
      ? position.y - height / 2
      : position.y;

  return (
    <>
      {/* Hidden mirror, used only to measure rendered text width for auto-grow. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: -9999,
          left: -9999,
          display: 'inline-block',
          ...wrapping,
          ...(wrap && { width: wrap.width }),
          font,
          lineHeight: 1.2,
        }}
      >
        {/* A trailing line break still takes a line, which a mirror ending in one would not show. */}
        {value.endsWith('\n') ? `${value} ` : value || ' '}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        style={{
          position: 'absolute',
          left,
          top,
          width: wrap ? wrap.width : width,
          height,
          textAlign: wrap ? wrap.textAlign : align,
          padding: 0,
          margin: 0,
          border: 'none',
          background: 'transparent',
          font,
          color,
          resize: 'none',
          outline: 'none',
          overflow: 'hidden',
          ...wrapping,
          lineHeight: 1.2,
        }}
      />
    </>
  );
}
