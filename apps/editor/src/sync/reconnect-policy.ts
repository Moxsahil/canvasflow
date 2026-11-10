/**
 * How the editor retries the sync connection after it drops.
 *
 * Passed with the provider's configuration, which hands it to the socket the
 * provider makes. Hocuspocus's own default waits 1 s, doubling to 30 s. Past
 * the fourth failed attempt that leaves up to half a minute between tries, so
 * someone whose server came back after a short outage could wait 20 s more
 * for the board to reconnect (23.9 s p95 measured with the defaults, see
 * METRICS.md).
 *
 * Capped at 5 s instead. Every wait is still drawn at random between
 * `minDelay` and the current step ("full jitter"), so when a server restarts
 * the clients that were waiting on it come back spread across several
 * seconds rather than all on the same tick.
 *
 * scripts/metrics/reconnect.mjs measures these same values; keep the two in
 * step (`--max-delay`).
 */
export const RECONNECT_POLICY = {
  /** The first wait, before the doubling. */
  delay: 1_000,
  factor: 2,
  /** Never retry sooner than this, however the jitter falls. */
  minDelay: 1_000,
  /** The longest wait between attempts. */
  maxDelay: 5_000,
  jitter: true,
  /** Retry for as long as the board is open. */
  maxAttempts: 0,
} as const;
