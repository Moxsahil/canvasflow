/**
 * Query parameters whose values are credentials.
 *
 * `code` is the one that matters: an OAuth provider returns the authorization
 * code in the callback URL, so the URL of that request *is* a credential for
 * the few seconds before it is spent. `state` is the CSRF nonce beside it, and
 * the token names cover anything that arrives the same way later.
 */
const SECRET_PARAMS = new Set(['code', 'state', 'token', 'access_token', 'refresh_token']);

const PLACEHOLDER = '…';

/**
 * A URL safe to write down.
 *
 * Keeps the path and every ordinary parameter — `?boardId=…` is most of what
 * makes a log line worth reading — and replaces only the values that are
 * credentials. Dropping the query wholesale would be safer still and would
 * make the logs useless for the routes that carry an id.
 *
 * Used everywhere a request URL is recorded or handed back, which is more
 * places than it looks: two log lines, and the `path` field of every error
 * body. That last one mattered most — a refusal on the OAuth callback was
 * returning the authorization code to whoever called it.
 */
export function redactUrl(url: string): string {
  const separator = url.indexOf('?');
  if (separator === -1) return url;

  const path = url.slice(0, separator);
  const query = url.slice(separator + 1);

  // Parsed and rebuilt by hand rather than through URLSearchParams, which
  // re-encodes everything it touches and would rewrite URLs that had nothing
  // secret in them at all.
  const redacted = query
    .split('&')
    .map((pair) => {
      const equals = pair.indexOf('=');
      if (equals === -1) return pair;

      const name = pair.slice(0, equals);
      return SECRET_PARAMS.has(name.toLowerCase()) ? `${name}=${PLACEHOLDER}` : pair;
    })
    .join('&');

  return `${path}?${redacted}`;
}
