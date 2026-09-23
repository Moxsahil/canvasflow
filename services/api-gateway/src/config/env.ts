import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z
      .string()
      .url('DATABASE_URL must be a valid URL')
      .startsWith('postgresql://', 'DATABASE_URL must start with postgresql://'),
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z
      .string()
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    OTEL_SERVICE_NAME: z.string().default('api-gateway'),
    /**
     * The origin every verification link is built from, and one of the two
     * origins CORS admits.
     *
     * Required rather than optional now that a mailed link is assembled from
     * it. A URL built from a request's Host header points wherever the caller
     * says, which turns a verification mail into somebody else's redirect, so
     * the trusted value has to come from configuration.
     */
    WEB_URL: z.string().url(),
    EDITOR_URL: z.string().url().optional(),

    /**
     * The domain the session cookies are scoped to.
     *
     * Set to the parent domain in production, `.canvasflowapp.com`, so the web
     * app, the editor and this service all see one cookie rather than three
     * unrelated ones.
     *
     * Left unset in development on purpose. Cookies ignore port numbers, so a
     * cookie set by localhost:3001 already reaches localhost:3000, and naming
     * a domain there would only stop it being set at all.
     */
    SESSION_COOKIE_DOMAIN: z.string().optional(),

    /**
     * This service's own public address.
     *
     * Needed to build the OAuth callback URLs, which have to match what is
     * registered with each provider exactly. Configured rather than read from
     * the request's Host header, for the same reason the verification link is:
     * a header a caller writes is not an address worth trusting.
     */
    API_PUBLIC_URL: z.string().url(),

    // === OAuth providers ===
    // Optional as a group. A checkout without them serves every other route,
    // and the provider buttons answer with a clear message rather than the
    // service refusing to start.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    /**
     * How many proxy hops in front of this service may be believed about who
     * called, which is what decides the address every per-IP limit counts.
     *
     * One behind the host's own proxy; two once a WAF sits in front of that.
     * Capped deliberately: this is not a number to raise until something stops
     * working, because every hop trusted beyond the real ones is a hop a
     * caller can forge for themselves.
     *
     * Zero disables it, which is right wherever nothing sits in front.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(4).default(0),

    /**
     * The value the edge proxy puts in `X-Origin-Auth` on every request it
     * forwards. When set, anything without it is refused, which closes the
     * host's direct address — the path on which `TRUST_PROXY_HOPS` counts one
     * proxy too many and a caller writes their own address.
     *
     * Unset disables the check, which is right wherever nothing sits in front.
     * Set as a Fly secret, and only once the edge is already sending it.
     */
    ORIGIN_AUTH_SECRET: z
      .string()
      .min(32, 'ORIGIN_AUTH_SECRET must be at least 32 characters')
      .optional()
      .or(z.literal('').transform(() => undefined)),

    // === Email delivery (Resend) ===
    // Optional like the storage group below: a checkout without a key still
    // serves every route, and a verification send reports that it did not go
    // rather than failing at import time.
    RESEND_API_KEY: z.string().startsWith('re').optional(),
    EMAIL_FROM: z.string().email().default('onboarding@resend.dev'),

    // === Object storage (Cloudflare R2) ===
    // Optional as a group: a deployment without them still serves every route
    // except the image ones, which fail with a clear message rather than at
    // import time. That keeps a checkout runnable before a bucket exists.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // The verification link is the one URL we ask somebody to open from their
    // inbox. Over plain HTTP the token travels in clear and every hop between
    // them and us can spend it first.
    if (env.NODE_ENV === 'production' && !env.WEB_URL.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEB_URL'],
        message: 'WEB_URL must use HTTPS in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

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
