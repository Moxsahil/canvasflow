import { useLayoutEffect, useRef, useState } from 'react';

interface TextEditorProps {
  /** Screen-space position (already converted from world space via camera). */
  position: { x: number; y: number };
  /** Screen-space font size (already scaled by camera zoom). */
  fontSize: number;
  fontFamily: string;
  color: string;
  initialText?: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

export function TextEditor({
  position,
  fontSize,
  fontFamily,
  color,
  initialText,
  onCommit,
  onCancel,
}: TextEditorProps) {
  const [value, setValue] = useState(initialText ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fontSize);

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
    const measured = measureRef.current?.scrollWidth ?? 0;
    // Small trailing buffer so the caret has room past the last character.
    setWidth(Math.max(fontSize, measured + fontSize * 0.6));
  }, [value, fontSize, fontFamily]);

  // Always commit on blur/Enter — the caller (Editor.tsx) decides what an
  // empty commit means (discard a new box vs. delete an edited shape).
  // Escape is the only path that reverts without committing.
  const commit = () => {
    onCommit(value);
  };

  const font = `${fontSize}px ${fontFamily}`;
  const lineCount = value.split('\n').length;

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
          whiteSpace: 'pre',
          font,
        }}
      >
        {value || ' '}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
          left: position.x,
          top: position.y,
          width,
          height: lineCount * fontSize * 1.2,
          padding: 0,
          margin: 0,
          border: 'none',
          background: 'transparent',
          font,
          color,
          resize: 'none',
          outline: 'none',
          overflow: 'hidden',
          whiteSpace: 'pre',
          lineHeight: 1.2,
        }}
      />
    </>
  );
}
