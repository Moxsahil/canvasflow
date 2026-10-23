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
  /**
   * Enter and Tab, when the caller has a use for them beyond finishing: a
   * mind map topic grows a sibling on one and a child on the other. Each is
   * handed what was typed, in place of the commit the key would otherwise be.
   */
  onEnter?: (text: string) => void;
  onTab?: (text: string) => void;
  /** Escape keeps what was typed rather than throwing it away. */
  commitOnEscape?: boolean;
}

export function TextEditor({
  position,
  align = 'left',
  fontSize,
  fontFamily,
  color,
  initialText,
  onCommit,
  onCancel,
  onChange,
  onEnter,
  onTab,
  commitOnEscape = false,
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
  // Once a key has finished the session, the blur that follows — this box
  // giving way to the next one Enter or Tab opened — is not a second ending.
  const settledRef = useRef(false);
  const settle = (finish: () => void) => {
    if (settledRef.current) return;
    settledRef.current = true;
    finish();
  };
  const commit = () => settle(() => onCommit(value));

  const font = `${fontSize}px ${fontFamily}`;
  const lineCount = value.split('\n').length;
  const height = lineCount * fontSize * 1.2;
  const centred = align === 'center';

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
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (onEnter) settle(() => onEnter(value));
            else commit();
          } else if (e.key === 'Tab' && onTab && !e.shiftKey) {
            e.preventDefault();
            settle(() => onTab(value));
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if (commitOnEscape) commit();
            else settle(onCancel);
          }
        }}
        style={{
          position: 'absolute',
          left: centred ? position.x - width / 2 : position.x,
          top: centred ? position.y - height / 2 : position.y,
          width,
          height,
          textAlign: align,
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
