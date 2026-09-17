export function safeRedirect(target: string | null | undefined, fallback: string): string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) {
    return fallback;
  }

  // Reject backslashes, whitespace/control characters, and protocols.
  //
  // Both matter because the URL parser rewrites them before the browser
  // navigates: a backslash is a path separator for http(s), and tab, newline
  // and carriage return are stripped outright — so "/\host" and a tab between
  // two slashes both end up as "//host", which is off-origin.
  //
  // The rule is disabled for this line rather than the file: the control
  // characters in the class are the point, and no-control-regex assumes they
  // got there by accident.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u0020\u007f]/.test(target) || target.includes(':')) {
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
