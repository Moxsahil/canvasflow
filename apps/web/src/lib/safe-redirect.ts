/**
 * Validate that a redirect target is safe — i.e., a same-origin path.
 *
 * Rejects:
 *   - Absolute URLs (https://evil.com)
 *   - Protocol-relative URLs (//evil.com)
 *   - URLs with embedded protocols
 *
 * Use this any time we redirect based on a user-controlled value
 * (query params, form input, etc.) to prevent open-redirect phishing.
 *
 * @example
 *   const next = searchParams.get('next');
 *   const dest = safeRedirect(next, '/boards');
 *   router.push(dest);
 */
export function safeRedirect(target: string | null | undefined, fallback: string): string {
  if (!target) return fallback;
  if (typeof target !== 'string') return fallback;

  // Must start with single slash, must not start with double slash
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;

  // Reject any path containing a protocol marker
  if (target.includes(':')) return fallback;

  return target;
}
