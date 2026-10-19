import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { EMBED_PROVIDERS, parseEmbedInput, resolveEmbed } from '@canvasflow/canvas-engine';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { cn } from '@/lib/utils';
import { KeyCaps } from '../help/KeyCaps';
import { useT } from '../i18n';
import { DOCK_CLEARANCE, type ScreenRect, type Size } from '../properties/halo-placement';
import { embedPopoverPlacement } from './embed-frame';
import { hasSiteIcon, SiteIcon } from './SiteIcon';
import { typedLinkCardUrl } from '../link-cards/link-card-url';

interface EmbedPlacerProps {
  /** The embed tool is in hand and nothing is placed yet, so the hint shows. */
  armed: boolean;
  /** The box being dragged out, or placed and waiting for its link, in board pixels. */
  frame: ScreenRect | null;
  /** The link field, open beside a placed box or an embed whose link is being changed. */
  field: { readonly anchor: ScreenRect; readonly editing: string | null } | null;
  board: Size;
  onSubmit: (url: string) => void;
  /** A new box given a web link no site embeds: put a link card for it there instead. */
  onSubmitCard?: (url: string) => void;
  onCancel: () => void;
}

/** The sites the idle line names before it counts the rest: the ones most often pasted. */
const NAMED_SITES = ['youtube', 'figma', 'google-docs'];

/**
 * Everything on screen while an embed is placed: the hint while the tool is
 * in hand, the box being dragged out, and the link field that opens beside
 * it once it is let go.
 *
 * The same field changes the link of an embed already on the board, opened
 * beside that embed, so both ways of choosing a page look and work alike.
 */
export function EmbedPlacer({
  armed,
  frame,
  field,
  board,
  onSubmit,
  onSubmitCard,
  onCancel,
}: EmbedPlacerProps) {
  const t = useT();
  return (
    <>
      {armed && !frame && !field && (
        <div
          className={cn(
            menuSurfaceClasses,
            'pointer-events-none absolute top-3 left-1/2 z-(--zIndex-layerUI) flex -translate-x-1/2 items-center gap-2 rounded-full py-1 pr-1.5 pl-3 text-xs shadow-[0_1px_2px_rgb(0_0_0/0.12)]',
          )}
          data-testid="embed-place-hint"
        >
          <span>{t('embeds.placeHint')}</span>
          <KeyCaps keys="escape" size="sm" />
        </div>
      )}

      {frame && (
        <div
          // The board's own selection colour, as the outline the embed is
          // about to get, a shade lighter on the dark board to stay legible.
          className="pointer-events-none absolute z-(--zIndex-wysiwyg) rounded-lg border-[1.5px] border-dashed border-[#6366f1] bg-[#6366f1]/6 dark:border-[#818cf8] dark:bg-[#818cf8]/8"
          style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
          data-testid="embed-place-frame"
        >
          <span className="absolute top-1.5 left-2 text-[11px] font-medium text-[#6366f1] dark:text-[#a5b4fc]">
            {t('tools.embed')}
          </span>
        </div>
      )}

      {field && (
        <EmbedLinkField
          key={field.editing ?? 'new'}
          anchor={field.anchor}
          editing={field.editing}
          board={board}
          onSubmit={onSubmit}
          // Changing an embed's page keeps it an embed; only a new box can be a card.
          onSubmitCard={field.editing === null ? onSubmitCard : undefined}
          onCancel={onCancel}
        />
      )}
    </>
  );
}

function EmbedLinkField({
  anchor,
  editing,
  board,
  onSubmit,
  onSubmitCard,
  onCancel,
}: {
  anchor: ScreenRect;
  editing: string | null;
  board: Size;
  onSubmit: (url: string) => void;
  onSubmitCard?: (url: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [value, setValue] = useState(editing ?? '');
  const [showAll, setShowAll] = useState(false);

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

  // A frame later than the mount, so the press that let the box go has
  // finished with focus before the field takes it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const url = useMemo(() => parseEmbedInput(value), [value]);
  const provider = url ? (resolveEmbed(url)?.provider ?? null) : null;
  const typed = value.trim() !== '';
  // Saving the link it already has would only be an undo step for nothing.
  const ready = url !== null && url !== editing;
  const host = typed && !provider ? hostOf(value) : null;
  // A web page no site embeds can still go on the board, as a card for it.
  const cardUrl = typed && !provider && onSubmitCard ? typedLinkCardUrl(value) : null;
  const unusable = typed && !provider && !cardUrl;

  const submit = () => {
    if (ready && url) onSubmit(url);
    else if (cardUrl) onSubmitCard?.(cardUrl);
  };

  const place = embedPopoverPlacement(anchor, size, board, DOCK_CLEARANCE);
  const rest = EMBED_PROVIDERS.length - NAMED_SITES.length;

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={editing ? t('embeds.editLink') : t('tools.embed')}
      data-testid="embed-link-field"
      className={cn(
        menuSurfaceClasses,
        'absolute z-(--zIndex-layerUI) grid w-80 max-w-[calc(100%-16px)] gap-2 rounded-card p-2 shadow-[0_8px_24px_rgb(0_0_0/0.12)]',
      )}
      style={{
        left: place.left,
        top: place.top,
        visibility: size.width ? undefined : 'hidden',
      }}
    >
      <div className="flex items-center gap-1.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-neutral-300 bg-white px-2 focus-within:border-(--color-primary) focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)] dark:border-neutral-600 dark:bg-neutral-900">
          {provider && hasSiteIcon(provider.id) ? (
            <SiteIcon providerId={provider.id} />
          ) : (
            <LinkIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-neutral-500 dark:text-neutral-400"
            />
          )}
          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            value={value}
            placeholder={t('embeds.placeholder')}
            aria-label={t('embeds.address')}
            aria-invalid={unusable || undefined}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="embed-address"
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // The board's shortcuts listen on the window, and every one of
              // them means something else in a text field: ⌘A selects the
              // typing here, not the board.
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={!ready && !cardUrl}
          onClick={submit}
          data-testid="embed-submit"
          className="h-8 shrink-0 rounded-md bg-(--color-primary) px-3 text-xs font-semibold text-(--color-primary-foreground) outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) disabled:opacity-45"
        >
          {editing ? t('common.save') : cardUrl ? t('linkCards.add') : t('embeds.insert')}
        </button>
      </div>

      <p
        role="status"
        className={cn(
          'flex min-h-4.5 items-center gap-1.5 px-0.5 text-[11.5px] leading-snug',
          unusable ? 'text-red-500 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400',
        )}
      >
        {provider ? (
          <span className="text-neutral-950 dark:text-neutral-50">
            {t('embeds.ready', { site: provider.name })}
          </span>
        ) : cardUrl ? (
          t('linkCards.notEmbeddable', { host: host ?? cardUrl })
        ) : typed ? (
          host ? (
            t('embeds.cantEmbedHost', { host })
          ) : (
            t('embeds.incomplete')
          )
        ) : (
          <>
            <span>
              {t('embeds.supported', {
                sites: EMBED_PROVIDERS.filter((site) => NAMED_SITES.includes(site.id))
                  .map((site) => site.name)
                  .join(', '),
                count: rest,
              })}
            </span>
            {!showAll && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="underline underline-offset-2 hover:text-neutral-950 dark:hover:text-neutral-50"
              >
                {t('embeds.seeAll')}
              </button>
            )}
          </>
        )}
      </p>

      {showAll && !typed && (
        <ul
          className="flex flex-wrap gap-x-2.5 gap-y-1 px-0.5 text-[11.5px] text-neutral-500 dark:text-neutral-400"
          aria-label={t('embeds.worksWith')}
        >
          {EMBED_PROVIDERS.map((site) => (
            <li key={site.id} className="flex items-center gap-1">
              <SiteIcon providerId={site.id} className="size-3" />
              {site.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The host a typed address names, for saying which site cannot be embedded. */
function hostOf(raw: string): string | null {
  const text = raw.trim();
  if (/\s/.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    const host = url.hostname.replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}
