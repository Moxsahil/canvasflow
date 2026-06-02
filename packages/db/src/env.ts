import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid URL')
    .startsWith('postgresql://', 'DATABASE_URL must start with postgresql://'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * Throws a clear error at startup if anything is missing or malformed.
 */
export function parseEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return result.data;
}
