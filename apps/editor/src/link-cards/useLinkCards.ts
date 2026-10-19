import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOOKMARK_SIZE,
  BOOKMARK_TEXT_ONLY_HEIGHT,
  ImageCache,
  MAX_BOOKMARK_DESCRIPTION,
  MAX_BOOKMARK_SITE_NAME,
  MAX_BOOKMARK_TITLE,
  isBookmark,
  isEmbed,
  readBookmarkText,
  readBookmarkUrl,
  readPreviewImageName,
  resolveEmbed,
  type BoardDocument,
  type BookmarkShape,
  type EmbedShape,
  type Shape,
} from '@canvasflow/canvas-engine';
import { fetchLinkPreview, fetchPreviewImage } from './preview-client';

interface UseLinkCardsOptions {
  doc: BoardDocument;
  shapes: readonly Shape[];
  /** Null while the token is being minted or refreshed. */
  token: string | null;
  /** Only someone who may change the board fills its cards in. */
  canEdit: boolean;
  /** The board kept in this browser has no account to ask the gateway with. */
  local: boolean;
}

export interface LinkCards {
  /** Preview pictures, decoded, for the renderers beside the board's own images. */
  images: ImageCache;
  /** Bumped whenever a picture finishes decoding, so the board repaints. */
  revision: number;
  /** Pictures as data URIs, keyed by name, for an SVG export. */
  resolveDataUrls: (shapes: readonly Shape[]) => Promise<ReadonlyMap<string, string>>;
}

/** Nothing has been learned about the page yet: a card just placed, or one whose reader left. */
function waitingOnPage(shape: BookmarkShape): boolean {
  return !shape.title && !shape.description && !shape.siteName && shape.image === null;
}

/**
 * An embed whose page has not given it a title or a still: one made before
 * stills existed, or whose link was just changed, which clears both.
 */
function embedWaitingOnPage(shape: EmbedShape): boolean {
  return !shape.title && !shape.poster;
}

/** The preview picture a shape shows, by name: a card's picture, or an embed's still. */
function pictureOf(shape: Shape): string | null {
  if (isBookmark(shape)) return readPreviewImageName(shape.image);
  if (isEmbed(shape)) return readPreviewImageName(shape.poster);
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Link cards' pages and pictures, and embeds' stills.
 *
 * A card goes on the board straight away, showing its address, and is filled
 * in once the gateway has read the page. An embed is given its page's title
 * and still the same way, for the card drawn under it and in exports. Whoever can edit the board and sees
 * a card still waiting asks for it — once a session — so a card left empty by
 * someone who closed the tab before the answer came is filled by the next
 * person to open the board. The answer is written so nobody can undo it away.
 */
export function useLinkCards({
  doc,
  shapes,
  token,
  canEdit,
  local,
}: UseLinkCardsOptions): LinkCards {
  const [revision, setRevision] = useState(0);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const images = useMemo(
    () =>
      new ImageCache({
        fetch: async (name) => {
          const current = tokenRef.current;
          if (!current || local) return null;
          return fetchPreviewImage(current, name);
        },
      }),
    [local],
  );
  useEffect(() => images.subscribe(() => setRevision((n) => n + 1)), [images]);

  // Pictures for every card and embed on the board that has one.
  useEffect(() => {
    if (local) return;
    const wanted = new Set<string>();
    for (const shape of shapes) {
      const name = pictureOf(shape);
      if (name && !images.has(name)) wanted.add(name);
    }
    if (wanted.size > 0) images.ensure([...wanted]);
  }, [shapes, images, token, local]);

  // Pages for every card still waiting on one.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!token || !canEdit || local) return;
    for (const shape of shapes) {
      if (!isBookmark(shape) || !waitingOnPage(shape) || asked.current.has(shape.id)) continue;
      asked.current.add(shape.id);
      const url = readBookmarkUrl(shape.url);
      if (!url) continue;

      void fetchLinkPreview(token, url)
        .catch(() => null)
        .then((preview) => {
          const current = doc
            .getShapes()
            .find((s): s is BookmarkShape => s.id === shape.id && isBookmark(s));
          // Gone, or filled in by someone else while this was on its way.
          if (!current || !waitingOnPage(current)) return;
          const image = readPreviewImageName(preview?.image?.name);
          // A card placed at the size that leaves room for a picture, whose
          // page has none, settles to the height its words need.
          const untouched =
            current.width === BOOKMARK_SIZE.width && current.height === BOOKMARK_SIZE.height;
          doc.settleShape(current.id, {
            title: readBookmarkText(preview?.title, MAX_BOOKMARK_TITLE),
            description: readBookmarkText(preview?.description, MAX_BOOKMARK_DESCRIPTION),
            siteName: readBookmarkText(preview?.siteName, MAX_BOOKMARK_SITE_NAME),
            image,
            ...(!image && untouched && { height: BOOKMARK_TEXT_ONLY_HEIGHT }),
          } as Partial<BookmarkShape>);
        });
    }
  }, [shapes, token, canEdit, local, doc]);

  // Titles and stills for every embed still without them. Asked once a
  // session for each link it has had, so a changed link is read again.
  const askedEmbeds = useRef(new Set<string>());
  useEffect(() => {
    if (!token || !canEdit || local) return;
    for (const shape of shapes) {
      if (!isEmbed(shape) || !embedWaitingOnPage(shape)) continue;
      const key = `${shape.id} ${shape.url}`;
      if (askedEmbeds.current.has(key) || !resolveEmbed(shape.url)) continue;
      askedEmbeds.current.add(key);

      void fetchLinkPreview(token, shape.url)
        .catch(() => null)
        .then((preview) => {
          const current = doc
            .getShapes()
            .find((s): s is EmbedShape => s.id === shape.id && isEmbed(s));
          // Gone, given another link, or filled in by someone else meanwhile.
          if (!current || current.url !== shape.url || !embedWaitingOnPage(current)) return;
          const title = readBookmarkText(preview?.title, MAX_BOOKMARK_TITLE);
          const poster = readPreviewImageName(preview?.image?.name);
          if (!title && !poster) return;
          doc.settleShape(current.id, { title, poster } as Partial<EmbedShape>);
        });
    }
  }, [shapes, token, canEdit, local, doc]);

  const resolveDataUrls = useCallback(
    async (subject: readonly Shape[]): Promise<ReadonlyMap<string, string>> => {
      const resolved = new Map<string, string>();
      const current = tokenRef.current;
      if (!current || local) return resolved;
      const names = new Set(subject.map(pictureOf).filter((name): name is string => name !== null));
      await Promise.all(
        [...names].map(async (name) => {
          try {
            const blob = await fetchPreviewImage(current, name);
            if (blob) resolved.set(name, await blobToDataUrl(blob));
          } catch {
            // Left out; the card is exported without its picture.
          }
        }),
      );
      return resolved;
    },
    [local],
  );

  return { images, revision, resolveDataUrls };
}
