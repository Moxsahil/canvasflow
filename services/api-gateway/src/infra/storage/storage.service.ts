import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parseEnv } from '../../config/env.js';

/**
 * Object storage for anything too large to belong in Postgres.
 *
 * Cloudflare R2, reached over its S3-compatible API — which is why the AWS SDK
 * is the client here. R2's own binding API exists only inside a Cloudflare
 * Worker; from Node the S3 protocol is the way in, the same way a Postgres
 * driver is how you reach Neon.
 *
 * Nothing in this service ever handles bytes. It hands out short-lived signed
 * URLs and lets the browser talk to R2 directly, which is the entire point:
 * an image never passes through this process, so a board full of photographs
 * costs the gateway no bandwidth and no memory.
 */

/**
 * How long an upload URL is good for.
 *
 * Long enough to send ten megabytes on a poor connection, short enough that a
 * leaked URL is worth little. The signature covers the key, so a stolen URL
 * can only overwrite the one object it already named.
 */
const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * How long a download URL is good for.
 *
 * Shorter than the browser cache lifetime on purpose: the redirect that issues
 * it is what carries the board-access check, so the URL expiring is what forces
 * a revoked collaborator back through authorization rather than letting them
 * hold a working link.
 */
const DOWNLOAD_URL_TTL_SECONDS = 3600;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor() {
    const env = parseEnv();
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
      this.logger.warn(
        'R2 is not configured — image routes will refuse requests. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.',
      );
      this.client = null;
      this.bucket = null;
      return;
    }

    this.client = new S3Client({
      // R2 has no regions, but SigV4 requires one in the signature. 'auto' is
      // the value Cloudflare specifies; anything else fails to authenticate.
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = R2_BUCKET;
  }

  /** Whether storage is usable, so a route can refuse cleanly. */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  private require(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      // 503 rather than 500: the request was fine, the deployment is not
      // finished, and a retry after configuration will succeed.
      throw new ServiceUnavailableException('Object storage is not configured');
    }
    return { client: this.client, bucket: this.bucket };
  }

  /**
   * A URL the browser may PUT exactly one object to.
   *
   * `contentLength` and `contentType` are named in `signableHeaders`, which
   * puts them inside the signature rather than beside it: a PUT of a different
   * length, or under a different type, is refused by R2 with a signature
   * mismatch. Together with the key — which the caller derives from the board
   * and the file id — that is the whole of what this URL permits.
   *
   * There is deliberately no content digest here, and it is worth being precise
   * about what that costs. S3 accepts `ChecksumSHA256` on a presigned PUT and
   * verifies the body against it; R2 rejects the same request outright, because
   * the SDK hoists the digest into the query string and R2 does not sign it
   * there. Forcing it into the signed headers does not work either. `ContentMD5`
   * is accepted, but it would only prove the body matches a digest the same
   * client chose — it cannot tie the body to the hash the key was named after,
   * which is the only property that would have been worth having.
   *
   * So the guarantee that a file id is the hash of the bytes stored under it
   * now rests on the uploading client rather than on storage. The exposure is
   * narrow: the key is scoped to one board, so only somebody who can already
   * edit that board can put mismatched bytes there, and the worst they achieve
   * is confusing that board's own deduplication.
   */
  async presignUpload(options: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; expiresIn: number }> {
    const { client, bucket } = this.require();

    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: options.key,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      }),
      {
        expiresIn: UPLOAD_URL_TTL_SECONDS,
        // Without this the SDK signs only `host`, leaving both values advisory.
        signableHeaders: new Set(['content-length', 'content-type', 'host']),
      },
    );

    return { url, expiresIn: UPLOAD_URL_TTL_SECONDS };
  }

  /**
   * A URL the browser may GET one object from.
   *
   * The response headers are pinned into the signature rather than left to
   * whatever was stored. An SVG is inert in an `<img>` but not as a top-level
   * document, and these are what keep it inert even if someone opens the URL
   * in a tab — the same protection the old proxying route set by hand.
   */
  async presignDownload(options: {
    key: string;
    contentType: string;
  }): Promise<{ url: string; expiresIn: number }> {
    const { client, bucket } = this.require();

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: options.key,
        ResponseContentType: options.contentType,
        ResponseCacheControl: 'private, max-age=31536000, immutable',
        ResponseContentDisposition: 'inline',
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );

    return { url, expiresIn: DOWNLOAD_URL_TTL_SECONDS };
  }

  /**
   * Remove objects, a thousand at a time.
   *
   * Failures are logged rather than thrown. This runs behind operations whose
   * real work has already succeeded — a board is deleted whether or not its
   * images went with it — and turning a storage hiccup into a failed delete
   * would leave the caller worse off than an orphaned object does.
   */
  async deleteObjects(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    const { client, bucket } = this.require();

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          }),
        );
      } catch (error) {
        this.logger.error(
          `Failed to delete ${batch.length} object(s) from R2: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
