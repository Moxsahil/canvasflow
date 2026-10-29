import { useLayoutEffect, useRef, useState } from 'react';
import type { NoteSide } from '../notes/note-neighbours';

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
  /**
   * Keep what was typed and carry on in the note on `side`: Tab for the one to
   * the right, Shift+Tab left, Ctrl or Cmd+Enter below, with Shift above.
   * Answers whether there was a note to carry on in; when there was not,
   * typing goes on here.
   */
  onNext: (text: string, side: NoteSide) => boolean;
}

/** The note a key carries typing on into, if it is one of those keys. */
function sideFor(event: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): NoteSide | null {
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey) {
    return event.shiftKey ? 'left' : 'right';
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    return event.shiftKey ? 'up' : 'down';
  }
  return null;
}

/**
 * The words of a sticky note, open for typing in place.
 *
 * A note's words wrap and shrink to its paper rather than running on, so
 * unlike the text box this does not size itself: it is laid exactly over the
 * room the note gives its words, at the size the note fits them to, and the
 * note works that out afresh as each letter goes in.
 *
 * Enter starts a new line, as it does on paper. Escape and clicking away
 * keep what was typed — a note has nothing to cancel back to that is worth
 * losing words for — and Tab or Ctrl or Cmd+Enter keep it and go on to the
 * next note along.
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
  onNext,
}: NoteEditorProps) {
  const [value, setValue] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The field may sit past the canvas's edge; focusing it mustn't scroll the
    // panel it is drawn in.
    el.focus({ preventScroll: true });
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
        if (e.key === 'Escape') {
          e.preventDefault();
          commit();
          return;
        }
        const side = sideFor(e);
        if (side) {
          // Never a focus move or a line break, whether or not there is a
          // note to go on to.
          e.preventDefault();
          if (settledRef.current || e.repeat) return;
          settledRef.current = true;
          if (!onNext(value, side)) settledRef.current = false;
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
