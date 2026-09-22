/**
 * Reduce a caller-supplied destination to one that cannot leave this site.
 *
 * Deliberately a character-for-character port of the web app's
 * `apps/web/src/lib/safe-redirect.ts`. Sign-in now starts in one app and
 * finishes in the other, so the same string is checked on both sides; two
 * implementations of this rule would be two chances for them to disagree, and
 * the weaker one would be the one that mattered.
 *
 * The checks look redundant and are not. The URL parser rewrites some of these
 * before a browser navigates: a backslash is a path separator for http(s), and
 * tab, newline and carriage return are stripped outright — so `/\host` and a
 * tab between two slashes both end up as `//host`, which is off-origin.
 */
export function safeRedirect(target: string | null | undefined, fallback: string): string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) {
    return fallback;
  }

  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000- \u007f]/.test(target) || target.includes(':')) {
    return fallback;
  }

  try {
    const base = 'https://redirect-validation.invalid';
    if (new URL(target, base).origin !== base) return fallback;
    return target;
  } catch {
    return fallback;
  }
}
