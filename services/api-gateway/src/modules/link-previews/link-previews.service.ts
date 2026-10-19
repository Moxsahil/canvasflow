import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getLinkPreview, saveLinkPreview, type LinkPreviewRow } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { normalizePreviewUrl } from './address-safety.js';
import { oembedEndpointFor, readOembed } from './oembed.js';
import { pageText, readPageMeta, type PageMeta } from './page-meta.js';
import {
  MIME_BY_EXTENSION,
  PREVIEW_IMAGE_NAME,
  PREVIEW_IMAGE_TYPES,
  previewImageKey,
  sniffPreviewImage,
} from './preview-image.js';
import { safeFetch } from './safe-fetch.js';

/** What a board is told about a link. */
export interface LinkPreview {
  /** The address that was read, as it was normalised. */
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** The picture's object name, to ask for a URL to it by. */
  image: { name: string; width: number | null; height: number | null } | null;
}

export interface PreviewImageUrl {
  url: string;
  expiresIn: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Pages change slowly enough that a week-old title is still the page's title. */
const KEPT_FOR_MS = 7 * DAY_MS;
/** A page that could not be read is tried again sooner: it may only have been down. */
const FAILED_KEPT_FOR_MS = DAY_MS;

const PAGE_TYPES = ['text/html', 'application/xhtml+xml'] as const;
const OEMBED_TYPES = ['application/json', 'text/json', 'text/javascript'] as const;
/** What a picture may arrive labelled as. Its bytes decide what it is. */
const IMAGE_TYPES = [
  ...PREVIEW_IMAGE_TYPES,
  'image/jpg',
  'image/pjpeg',
  'application/octet-stream',
  'binary/octet-stream',
] as const;

/** The top of a page is where its preview tags are; the rest is not read. */
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_OEMBED_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 6000;
const OEMBED_TIMEOUT_MS = 5000;
const IMAGE_TIMEOUT_MS = 6000;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function toPreview(row: LinkPreviewRow): LinkPreview | null {
  if (row.status !== 'ok') return null;
  return {
    url: row.url,
    title: row.title,
    description: row.description,
    siteName: row.siteName,
    image: row.image ? { name: row.image, width: row.imageWidth, height: row.imageHeight } : null,
  };
}

/**
 * Previews of links pasted onto boards: read once, kept, and handed to anyone
 * who asks for the same link.
 *
 * The reading is done by `safeFetch`, which owns every rule about where this
 * server may connect. What is kept is plain text and a picture whose bytes
 * were checked to be one — nothing from the page reaches a browser as markup.
 */
@Injectable()
export class LinkPreviewsService {
  private readonly logger = new Logger(LinkPreviewsService.name);
  /**
   * Reads in progress, by address. A link pasted onto a board is asked about
   * by everyone looking at it at once; one fetch answers all of them.
   */
  private readonly reading = new Map<string, Promise<LinkPreview | null>>();

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /** The preview of a link, read now if it has not been, or not lately. Null when it has none. */
  async preview(raw: unknown): Promise<LinkPreview | null> {
    const url = normalizePreviewUrl(raw);
    if (!url) throw new BadRequestException('That link cannot be previewed');
    const urlHash = sha256(url.href);

    const kept = await getLinkPreview(this.database.db, urlHash);
    if (kept && kept.expiresAt.getTime() > Date.now()) return toPreview(kept);

    const inFlight = this.reading.get(urlHash);
    if (inFlight) return inFlight;

    const read = this.readAndKeep(url, urlHash).finally(() => this.reading.delete(urlHash));
    this.reading.set(urlHash, read);
    return read;
  }

  /** A short-lived URL to a preview picture, by its object name. */
  async imageUrl(name: string): Promise<PreviewImageUrl> {
    const match = PREVIEW_IMAGE_NAME.exec(name);
    if (!match) throw new BadRequestException('Malformed picture name');
    const extension = match[1] as keyof typeof MIME_BY_EXTENSION;
    return this.storage.presignDownload({
      key: previewImageKey(name),
      contentType: MIME_BY_EXTENSION[extension],
    });
  }

  private async readAndKeep(url: URL, urlHash: string): Promise<LinkPreview | null> {
    const meta = await this.read(url);
    const image = meta?.image ? await this.keepImage(meta.image) : null;
    const found = meta && (meta.title || meta.description || image);
    const now = Date.now();

    const row: LinkPreviewRow = {
      urlHash,
      url: url.href,
      status: found ? 'ok' : 'failed',
      title: found ? meta.title : null,
      description: found ? meta.description : null,
      siteName: found ? meta.siteName : null,
      image: image?.name ?? null,
      imageWidth: image?.width ?? null,
      imageHeight: image?.height ?? null,
      fetchedAt: new Date(now),
      expiresAt: new Date(now + (found ? KEPT_FOR_MS : FAILED_KEPT_FOR_MS)),
    };
    await saveLinkPreview(this.database.db, row);
    return toPreview(row);
  }

  /** The site's own description of the link where it has one, else its page's tags. */
  private async read(url: URL): Promise<PageMeta | null> {
    const endpoint = oembedEndpointFor(url);
    if (endpoint) {
      const described = await this.fetchOembed(endpoint);
      if (described && (described.title || described.image)) return described;
    }
    return this.fetchPage(url);
  }

  private async fetchOembed(endpoint: URL): Promise<PageMeta | null> {
    try {
      const response = await safeFetch(endpoint, {
        accept: OEMBED_TYPES,
        maxBytes: MAX_OEMBED_BYTES,
        timeoutMs: OEMBED_TIMEOUT_MS,
      });
      return readOembed(response.body);
    } catch (error) {
      this.logger.debug(`No description from ${endpoint.hostname}: ${String(error)}`);
      return null;
    }
  }

  private async fetchPage(url: URL): Promise<PageMeta | null> {
    try {
      const response = await safeFetch(url, {
        accept: PAGE_TYPES,
        maxBytes: MAX_PAGE_BYTES,
        truncate: true,
        timeoutMs: PAGE_TIMEOUT_MS,
      });
      return readPageMeta(pageText(response.body, response.contentTypeHeader), response.url);
    } catch (error) {
      this.logger.debug(`Could not read ${url.hostname}: ${String(error)}`);
      return null;
    }
  }

  /**
   * Fetch a page's picture and keep it, under the hash of its bytes. Null when
   * it cannot be fetched or is not a picture a preview keeps.
   */
  private async keepImage(
    source: string,
  ): Promise<{ name: string; width: number | null; height: number | null } | null> {
    const url = normalizePreviewUrl(source);
    if (!url) return null;
    try {
      const response = await safeFetch(url, {
        accept: IMAGE_TYPES,
        maxBytes: MAX_IMAGE_BYTES,
        timeoutMs: IMAGE_TIMEOUT_MS,
      });
      const format = sniffPreviewImage(response.body);
      if (!format) return null;
      const name = `${sha256(response.body)}.${format.extension}`;
      await this.storage.putObject({
        key: previewImageKey(name),
        body: response.body,
        contentType: format.mimeType,
      });
      return { name, width: format.width, height: format.height };
    } catch (error) {
      this.logger.debug(`No picture from ${url.hostname}: ${String(error)}`);
      return null;
    }
  }
}
