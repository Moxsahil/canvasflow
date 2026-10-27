import { useLayoutEffect, useRef, useState } from 'react';

interface NoteEditorProps {
  /**
   * The room for words on the note, on screen: its left edge, the top of the
   * first line and how wide the lines may run. Follows the note as what is
   * typed shrinks its words or grows its paper.
   */
  box: { left: number; top: number; width: number };
  /** On screen, already scaled by the zoom: the size the words are fitted to. */
  fontSize: number;
  lineHeight: number;
  /** How many lines the note sets the words in, so the box is as tall. */
  lineCount: number;
  fontFamily: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  initialText: string;
  /** Every keystroke, so the note can be fitted and redrawn around them. */
  onChange: (text: string) => void;
  onCommit: (text: string) => void;
}

/**
 * The words of a sticky note, open for typing in place.
 *
 * A note's words wrap and shrink to its paper rather than running on, so
 * unlike the text box this does not size itself: it is laid exactly over the
 * room the note gives its words, at the size the note fits them to, and the
 * note works that out afresh as each letter goes in.
 *
 * Enter starts a new line, as it does on paper. Escape, Ctrl or Cmd+Enter
 * and clicking away all keep what was typed — a note has nothing to cancel
 * back to that is worth losing words for.
 */
export function NoteEditor({
  box,
  fontSize,
  lineHeight,
  lineCount,
  fontFamily,
  color,
  textAlign,
  initialText,
  onChange,
  onCommit,
}: NoteEditorProps) {
  const [value, setValue] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const length = el.value.length;
    el.setSelectionRange(length, length);
  }, []);

  // The key that ends typing is followed by the blur of the box going away,
  // which is not a second ending.
  const settledRef = useRef(false);
  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCommit(value);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      data-testid="note-editor"
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          commit();
        }
      }}
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: Math.max(1, lineCount) * lineHeight,
        textAlign,
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        font: `${fontSize}px ${fontFamily}`,
        lineHeight: `${lineHeight}px`,
        color,
        resize: 'none',
        outline: 'none',
        overflow: 'hidden',
        // Wrapped as the note wraps: between words, and inside one only when
        // it is too long for a line on its own.
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
      }}
    />
  );
}
