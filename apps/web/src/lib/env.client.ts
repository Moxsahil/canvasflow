import { z } from 'zod';

/**
 * Client-safe environment variables.
 *
 * Only NEXT_PUBLIC_* vars belong here — Next.js inlines them into the browser
 * bundle at build time. Never add server secrets (AUTH_SECRET, DATABASE_URL,
 * OAuth secrets, …): those are `undefined` in the browser and would throw.
 * Server code should import from `./env` instead.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_EDITOR_URL: z.string().url().default('http://localhost:3002'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

function parseClientEnv(): ClientEnv {
  // Reference each var by its full literal name so Next.js can statically
  // inline it into the client bundle.
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_EDITOR_URL: process.env.NEXT_PUBLIC_EDITOR_URL,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid public environment variables:\n${issues}`);
  }

  return result.data;
}

export const clientEnv = parseClientEnv();
