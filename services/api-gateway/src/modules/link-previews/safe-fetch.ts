import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';
import { isPublicAddress, normalizePreviewUrl } from './address-safety.js';

/**
 * One GET of somebody else's page or picture, with every limit a fetch from
 * inside our network needs.
 *
 * The host name is looked up here, and the connection is made to exactly the
 * address that was checked — passed to the socket through `lookup` — so a name
 * that answers with a public address for the check and a private one for the
 * connection gets nowhere. Redirects are followed by hand, each new address
 * checked the same way, so a public page cannot bounce the request inward.
 *
 * Nothing of ours goes with it: no cookies, no sign-in, no forwarded headers.
 */

/** Who is asking, for the site's own logs. */
export const PREVIEW_USER_AGENT =
  'Mozilla/5.0 (compatible; CanvasFlowBot/1.0; +https://canvasflow.app)';

export class FetchRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchRefusedError';
  }
}

export interface SafeFetchOptions {
  /** Sent as Accept; also the content types the answer may have, before any parameters. */
  readonly accept: readonly string[];
  readonly maxBytes: number;
  /**
   * Keep the first `maxBytes` of a longer answer rather than refusing it. Right
   * for a page, whose preview tags are at the top; wrong for a picture, which
   * is worthless cut short.
   */
  readonly truncate?: boolean;
  /** For the whole fetch, redirects included. */
  readonly timeoutMs: number;
  readonly maxRedirects?: number;
  /** For tests: how names are looked up, and which addresses are allowed. */
  readonly resolve?: (hostname: string) => Promise<readonly LookupAddress[]>;
  readonly allowAddress?: (address: string) => boolean;
  readonly checkRedirect?: (location: string) => URL | null;
}

export interface SafeResponse {
  /** Where the answer actually came from, after any redirects. */
  readonly url: URL;
  /** The media type alone, lowercased. */
  readonly contentType: string;
  /** The header as sent, parameters and all, for the charset a page declares. */
  readonly contentTypeHeader: string;
  readonly body: Buffer;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function defaultResolve(hostname: string): Promise<readonly LookupAddress[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
}

/**
 * A `lookup` for the socket that answers only with addresses already checked.
 *
 * Every address a name has must be public, not just the first: a name that
 * mixes one public answer with a private one is either misconfigured or
 * trying something, and either way is not read.
 */
function checkedLookup(
  resolve: NonNullable<SafeFetchOptions['resolve']>,
  allow: (address: string) => boolean,
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) {
          callback(new FetchRefusedError(`${hostname} has no address`), '', 4);
          return;
        }
        const refused = addresses.find((entry) => !allow(entry.address));
        if (refused) {
          callback(new FetchRefusedError(`${hostname} is not a public address`), '', 4);
          return;
        }
        if (options.all) {
          (callback as unknown as (error: null, addresses: LookupAddress[]) => void)(null, [
            ...addresses,
          ]);
        } else {
          const first = addresses[0]!;
          callback(null, first.address, first.family);
        }
      },
      (error: unknown) =>
        callback(
          error instanceof Error ? (error as NodeJS.ErrnoException) : new Error(String(error)),
          '',
          4,
        ),
    );
  };
}

function decoded(response: IncomingMessage): Readable {
  switch ((response.headers['content-encoding'] ?? '').toLowerCase().trim()) {
    case 'gzip':
    case 'x-gzip':
      return response.pipe(createGunzip());
    case 'deflate':
      return response.pipe(createInflate());
    case 'br':
      return response.pipe(createBrotliDecompress());
    default:
      return response;
  }
}

/** The body, decoded, up to the limit — cut there or refused, as asked. */
function readBody(response: IncomingMessage, maxBytes: number, truncate: boolean): Promise<Buffer> {
  const declared = Number(response.headers['content-length']);
  if (!truncate && Number.isFinite(declared) && declared > maxBytes) {
    response.destroy();
    return Promise.reject(new FetchRefusedError('Too large'));
  }

  return new Promise((resolve, reject) => {
    const stream = decoded(response);
    const chunks: Buffer[] = [];
    let length = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks, Math.min(length, maxBytes)));
    };
    stream.on('data', (chunk: Buffer) => {
      if (done) return;
      length += chunk.length;
      chunks.push(chunk);
      if (length > maxBytes) {
        response.destroy();
        stream.destroy();
        if (truncate) finish();
        else {
          done = true;
          reject(new FetchRefusedError('Too large'));
        }
      }
    });
    stream.on('end', finish);
    stream.on('error', (error) => {
      if (done) return;
      done = true;
      reject(error);
    });
  });
}

function once(
  url: URL,
  options: SafeFetchOptions,
  lookup: LookupFunction,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      url,
      {
        method: 'GET',
        // A fresh connection every time, so every request goes through the
        // address check rather than riding a socket kept from an earlier one.
        agent: false,
        lookup,
        signal,
        headers: {
          'user-agent': PREVIEW_USER_AGENT,
          accept: options.accept.join(', '),
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': 'en',
        },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(start: URL, options: SafeFetchOptions): Promise<SafeResponse> {
  const lookup = checkedLookup(
    options.resolve ?? defaultResolve,
    options.allowAddress ?? isPublicAddress,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const maxRedirects = options.maxRedirects ?? 3;

  try {
    let url = start;
    for (let hop = 0; ; hop++) {
      const response = await once(url, options, lookup, controller.signal);
      const status = response.statusCode ?? 0;

      if (REDIRECTS.has(status)) {
        response.resume();
        const location = response.headers.location;
        if (!location || hop >= maxRedirects) throw new FetchRefusedError('Too many redirects');
        // Checked as a fresh link, so a redirect cannot reach anywhere a
        // pasted link could not.
        const next = (options.checkRedirect ?? normalizePreviewUrl)(new URL(location, url).href);
        if (!next) throw new FetchRefusedError('Redirected somewhere that cannot be read');
        url = next;
        continue;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        throw new FetchRefusedError(`Answered ${status}`);
      }

      const contentTypeHeader = response.headers['content-type'] ?? '';
      const contentType = contentTypeHeader.split(';')[0]!.trim().toLowerCase();
      if (!options.accept.some((type) => type === contentType)) {
        response.resume();
        throw new FetchRefusedError(`Not a type that is read: ${contentType || 'none'}`);
      }

      const body = await readBody(response, options.maxBytes, options.truncate ?? false);
      return { url, contentType, contentTypeHeader, body };
    }
  } catch (error) {
    if (controller.signal.aborted) throw new FetchRefusedError('Took too long');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
