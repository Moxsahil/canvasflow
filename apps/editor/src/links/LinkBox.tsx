import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  Check,
  Copy,
  CornerDownLeft,
  Crosshair,
  Link as LinkIcon,
  Pencil,
  Unlink,
} from 'lucide-react';
import { parseLinkInput } from '@canvasflow/canvas-engine';
import { menuChipClasses, menuSurfaceClasses } from '@/components/ui/menu-look';
import { cn } from '@/lib/utils';
import { ariaKeyShortcut } from '../help/platform';
import type { ScreenRect, Size } from '../properties/halo-placement';
import { currentHref, currentOrigin, linkBoxPlacement, linkTarget } from './link-placement';
import { describeLink, followLinkClick } from './shape-link';

interface LinkBoxProps {
  /** The selected shape's link, or null while one is being added. */
  link: string | null;
  /** The field rather than the link. Never for someone who cannot edit. */
  editing: boolean;
  readOnly: boolean;
  /** The selection's box on the board. */
  anchor: ScreenRect;
  board: Size;
  /** Where the floating style bar stands, to keep clear of; null without one. */
  avoid: ScreenRect | null;
  /** The field, for whatever opened it to put the cursor back in. */
  inputRef: RefObject<HTMLInputElement>;
  onEdit: () => void;
  /** A link to store, or null to take it away. */
  onSave: (link: string | null) => void;
  /** Leave the field without storing anything. */
  onCancel: () => void;
  /** Offered a plain click on the link first; takes it for a place on this board. */
  onFollow?: (link: string) => boolean;
}

/**
 * The selected shape's link, in a small bar by the selection: the address,
 * to open, copy, change or take away — or, while one is being added or
 * changed, the field it is typed into.
 *
 * Shown for as long as one linked shape is selected, so what a shape points
 * at is never more than a click away, and the badge on its corner is not the
 * only clue it has one.
 */
export function LinkBox({
  link,
  editing,
  readOnly,
  anchor,
  board,
  avoid,
  inputRef,
  onEdit,
  onSave,
  onCancel,
  onFollow,
}: LinkBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  // Measured again whenever it changes size: the field is wider than most
  // links, and a mistyped address adds a line under it.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const next = { width: box.offsetWidth, height: box.offsetHeight };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const place = linkBoxPlacement(anchor, size, board, avoid);
  const showField = editing && !readOnly;

  return (
    <div
      className="absolute z-(--zIndex-layerUI)"
      // Kept mounted while the shape is scrolled out of sight, so a link
      // half-typed is still there when it comes back. Unseen until measured,
      // so its first frame isn't drawn in the wrong place.
      style={{
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        display: place ? undefined : 'none',
        visibility: size.width ? undefined : 'hidden',
      }}
    >
      <div
        ref={boxRef}
        role="group"
        aria-label="Link"
        data-testid="link-box"
        className={cn(menuSurfaceClasses, 'rounded-card p-0.75')}
      >
        {showField ? (
          <LinkField link={link} inputRef={inputRef} onSave={onSave} onCancel={onCancel} />
        ) : (
          link && (
            <LinkView
              link={link}
              readOnly={readOnly}
              onEdit={onEdit}
              onRemove={() => onSave(null)}
              onFollow={onFollow}
            />
          )
        )}
      </div>
    </div>
  );
}

function Separator() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 h-4 w-px shrink-0 bg-neutral-300 dark:bg-neutral-600"
    />
  );
}

/** How long Copy shows its tick before it goes back to being Copy. */
const COPIED_FOR_MS = 1200;

function LinkView({
  link,
  readOnly,
  onEdit,
  onRemove,
  onFollow,
}: {
  link: string;
  readOnly: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onFollow?: (link: string) => boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Refused or unavailable. The address is on screen to select by hand,
      // and a tick for a copy that never happened would be worse than none.
    }
  };

  const { label, onThisBoard } = describeLink(link, currentHref());
  const Icon = onThisBoard ? Crosshair : LinkIcon;

  return (
    <div className="flex items-center gap-0.5">
      <a
        href={link}
        target={linkTarget(link, currentOrigin())}
        rel="noopener noreferrer"
        title={link}
        data-testid="link-box-open"
        onClick={(event) => followLinkClick(event, link, onFollow)}
        className="flex h-7 max-w-64 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-xs outline-none hover:bg-neutral-950/10 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) dark:hover:bg-neutral-50/10"
      >
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0 text-neutral-500 dark:text-neutral-400"
        />
        <span className="truncate">{label}</span>
      </a>
      <Separator />
      <button
        type="button"
        title={copied ? 'Copied' : 'Copy link'}
        aria-label={copied ? 'Copied' : 'Copy link'}
        className={menuChipClasses}
        onClick={copy}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      {!readOnly && (
        <>
          <button
            type="button"
            title="Edit link"
            aria-label="Edit link"
            aria-keyshortcuts={ariaKeyShortcut('mod+k')}
            className={menuChipClasses}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Remove link"
            aria-label="Remove link"
            className={menuChipClasses}
            onClick={onRemove}
          >
            <Unlink aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function LinkField({
  link,
  inputRef,
  onSave,
  onCancel,
}: {
  link: string | null;
  inputRef: RefObject<HTMLInputElement>;
  onSave: (link: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(link ?? '');
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();

  // Read by the cleanup below, which outlives the render it was made in.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const latestRef = useRef({ link, onSave });
  latestRef.current = { link, onSave };
  /** Typed into since it opened. */
  const dirtyRef = useRef(false);
  /** Saved or cancelled already, by Enter, Escape or a button. */
  const settledRef = useRef(false);

  // A frame late on purpose: a menu or the palette that opened the field
  // hands focus back to where it came from as it closes, and would take it
  // straight back out of the field.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [inputRef]);

  // Leaving the field any other way — selecting something else, starting to
  // drag, clicking away — keeps what was typed, when it is a link. Typing an
  // address and then losing it to a stray click is the worse of the two
  // mistakes; Escape is there for leaving it alone.
  useEffect(
    () => () => {
      if (settledRef.current || !dirtyRef.current) return;
      const parsed = parseLinkInput(draftRef.current);
      if (parsed.ok && parsed.link !== latestRef.current.link)
        latestRef.current.onSave(parsed.link);
    },
    [],
  );

  const submit = () => {
    const parsed = parseLinkInput(draft);
    if (!parsed.ok) {
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    settledRef.current = true;
    onSave(parsed.link);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5">
        <LinkIcon
          aria-hidden="true"
          className="mx-1.5 size-4 shrink-0 text-neutral-500 dark:text-neutral-400"
        />
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          value={draft}
          placeholder="Paste or type a link"
          aria-label="Link address"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          data-testid="link-box-input"
          className="h-7 w-64 min-w-0 bg-transparent text-xs outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
          onChange={(event) => {
            dirtyRef.current = true;
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            // The board's shortcuts listen on the window, and every one of
            // them means something else in a text field: ⌘Z undoes typing
            // here, not the board.
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              settledRef.current = true;
              onCancel();
            } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
              // Pressed again from inside the field; not the browser's search.
              event.preventDefault();
            }
          }}
        />
        <button
          type="button"
          title="Save link (Enter)"
          aria-label="Save link"
          className={menuChipClasses}
          onClick={submit}
        >
          <CornerDownLeft aria-hidden="true" />
        </button>
      </div>
      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="m-0 px-1.5 pt-0.5 pb-1 text-[11px] text-red-600 dark:text-red-400"
        >
          Enter a web or email address, like example.com
        </p>
      )}
    </div>
  );
}
