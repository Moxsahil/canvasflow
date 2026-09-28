import { config, parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: resolve(root, '.env') });
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import {
  ACCOUNT_PURGE_LIMIT,
  runAccountPurge,
  type ObjectStore,
} from '../src/access/account-purge.js';

/**
 * Erase the accounts whose deletion grace period is over: their files, then
 * their rows. The work itself is `runAccountPurge`; this only connects it to
 * the database and the bucket, and says what happened.
 *
 * Runs daily from .github/workflows/purge-deleted-accounts.yml. Those logs are
 * public, so this prints request ids and counts, never an address or a name.
 *
 * Safe to re-run: an account stopped halfway is picked up again, and one
 * already finished is skipped. Exits non-zero when any account failed or more
 * were due than one run takes, so a scheduled run that needs a look says so.
 *
 * Usage:
 *   pnpm --filter @canvasflow/db purge:deleted-accounts --dry-run   (deletes nothing)
 *   pnpm --filter @canvasflow/db purge:deleted-accounts
 */

// Locally the storage settings live beside the gateway, the service that uses
// them every day. Only those are borrowed from there, and only when unset —
// never the database address, which comes from the root .env or the job.
const gatewayEnv = resolve(root, 'services/api-gateway/.env');
if (existsSync(gatewayEnv)) {
  for (const [name, value] of Object.entries(parse(readFileSync(gatewayEnv)))) {
    if (name.startsWith('R2_') && !process.env[name]) process.env[name] = value;
  }
}

const STORAGE_SETTINGS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

function bucket(): { store: ObjectStore; reachable: () => Promise<void> } {
  const missing = STORAGE_SETTINGS.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Storage is not configured: ${missing.join(', ')} unset`);

  const client = new S3Client({
    // R2 has no regions, but SigV4 needs one; 'auto' is the value Cloudflare specifies.
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  });
  const Bucket = process.env.R2_BUCKET as string;

  return {
    store: {
      async list(prefix, after) {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: after }),
        );
        return {
          keys: (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])),
          next: page.IsTruncated ? page.NextContinuationToken : undefined,
        };
      },
      async remove(keys) {
        const answer = await client.send(
          new DeleteObjectsCommand({
            Bucket,
            // Quiet: the answer lists only what was not deleted, which is all
            // that matters here.
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        return (answer.Errors ?? []).map((error) => ({
          key: error.Key ?? '(unknown)',
          reason: `${error.Code ?? 'Error'}: ${error.Message ?? 'no reason given'}`,
        }));
      },
    },
    // One key, from anywhere: proof the credentials work, before any account
    // is started on.
    reachable: async () => {
      await client.send(new ListObjectsV2Command({ Bucket, MaxKeys: 1 }));
    },
  };
}

async function main(): Promise<boolean> {
  const dryRun = process.argv.includes('--dry-run');
  const env = parseEnv();
  const db = createClient(env.DATABASE_URL);
  const { store, reachable } = bucket();

  await reachable();
  console.log(dryRun ? 'Dry run: nothing will be deleted.' : 'Purging accounts.');
  console.log('Storage: reachable.');

  const report = await runAccountPurge({ db, store, dryRun });
  console.log('Database: reachable.');

  const due = report.purged.length + report.failed.length + report.waiting;
  console.log(`${due} account(s) due; at most ${ACCOUNT_PURGE_LIMIT} per run.`);

  for (const account of report.purged) {
    console.log(
      `- ${account.requestId}: ${account.boards} board(s), ${account.files} file(s) in ${account.folders} folder(s) ${
        dryRun ? 'would be deleted' : 'deleted'
      }.`,
    );
  }
  for (const failure of report.failed) {
    console.error(`- ${failure.requestId} FAILED: ${failure.error}`);
  }
  if (report.waiting > 0) {
    console.error(
      `${report.waiting} more account(s) are due than one run takes. That many at once is ` +
        `unusual; look at them before raising the limit.`,
    );
  }

  console.log(
    `Done: ${report.purged.length} ${dryRun ? 'would be purged' : 'purged'}, ` +
      `${report.failed.length} failed, ${report.waiting} waiting.`,
  );
  return report.failed.length === 0 && report.waiting === 0;
}

main()
  .then((clean) => process.exit(clean ? 0 : 1))
  .catch((error: unknown) => {
    // The message only: a storage error's full dump carries request details
    // that have no business in a public log.
    console.error(
      'Failed to purge deleted accounts:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
