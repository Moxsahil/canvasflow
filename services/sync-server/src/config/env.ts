import { z } from 'zod';

/**
 * Sync-server env schema. AUTH_SECRET and DATABASE_URL must match the
 * api-gateway and web app — the shared JWT secret verifies tokens minted
 * by the web app, and the DB URL points to the same Neon instance used
 * by the api-gateway.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT_WS: z.coerce.number().int().positive().default(4000),
  PORT_HTTP: z.coerce.number().int().positive().default(4001),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  DATABASE_URL: z.string().url(),
  WEB_URL: z.string().url().optional(),
  EDITOR_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
