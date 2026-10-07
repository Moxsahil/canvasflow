/**
 * The rules for a username, as the field and the route both apply them.
 *
 * One list, so the editor can say what is wrong as somebody types and the web
 * app's profile route refuses the same things for the same reasons. The route
 * is the authority; the database holds the shape of it too
 * (`users_username_format`), so nothing that skips the route can store one
 * these rules would refuse on length or characters.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * How many names one availability check may ask about: a suggestion and its
 * fallbacks, in a single request answered by a single read.
 */
export const USERNAME_CHECK_LIMIT = 10;

/**
 * Names nobody may hold.
 *
 * The app's own paths, so a link built on a username can never be mistaken
 * for one; the words a mention might one day reach everybody with; and the
 * ones somebody could pass off as speaking for the product.
 */
const RESERVED = new Set([
  'about',
  'account',
  'accounts',
  'admin',
  'administrator',
  'all',
  'api',
  'app',
  'apps',
  'auth',
  'billing',
  'board',
  'boards',
  'deleted',
  'dev',
  'docs',
  'email',
  'everyone',
  'guest',
  'guests',
  'help',
  'here',
  'invite',
  'legal',
  'login',
  'logout',
  'mail',
  'me',
  'moderator',
  'noreply',
  'null',
  'official',
  'open',
  'owner',
  'privacy',
  'root',
  'security',
  'settings',
  'signup',
  'staff',
  'status',
  'support',
  'system',
  'team',
  'terms',
  'undefined',
  'user',
  'users',
  'www',
  'you',
]);

/**
 * What somebody typed, as it would be stored: without the @ the field already
 * shows, and in lower case, so `@Ada` and `ada` are one name.
 */
export function normalizeUsername(typed: string): string {
  return typed.trim().replace(/^@+/, '').toLowerCase();
}

/** Why a normalized username cannot be had, or null when it can. */
export function usernameProblem(username: string): string | null {
  if (!/^[a-z0-9_.]*$/.test(username)) {
    return 'Use only letters, numbers, underscores and periods.';
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Use at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Use ${USERNAME_MAX_LENGTH} characters or fewer.`;
  }
  // All digits reads as an id rather than a name.
  if (!/[a-z]/.test(username)) return 'Include at least one letter.';
  if (username.startsWith('.') || username.endsWith('.')) {
    return 'Start and end with a letter, number or underscore.';
  }
  if (username.includes('..')) return 'Use one period at a time.';
  if (RESERVED.has(username) || username.includes('canvasflow')) {
    return 'That username is reserved.';
  }
  return null;
}

/**
 * Whether something that arrived from elsewhere — a peer's presence record, a
 * comment another browser wrote — is a username as this app stores them.
 * Anything else is treated as no username at all.
 */
export function isUsername(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value === normalizeUsername(value) &&
    usernameProblem(value) === null
  );
}
