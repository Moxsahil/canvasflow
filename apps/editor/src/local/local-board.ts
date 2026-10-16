import { env } from '@/lib/env';
import type { EditorUser } from '../auth/token';

/**
 * The board at the editor's own address, for anyone who opens it without
 * signing in.
 *
 * It lives in this browser and nowhere else: no account owns it, the server
 * never hears of it, and it is the same board every time this browser comes
 * back. The id names its copy in IndexedDB and its camera in localStorage —
 * never a board on the server, which is why it is not a UUID.
 */
export const LOCAL_BOARD_ID = 'local';

/**
 * Whoever is drawing on the local board.
 *
 * An editor rather than an owner: an owner is offered the board's links to
 * hand out, and this board has no address anyone else could open. A guest,
 * so nothing asks the server for the account, library or profile behind it.
 */
export const LOCAL_USER: EditorUser = {
  id: 'local',
  name: 'Local',
  email: null,
  role: 'editor',
  readOnly: false,
  archived: false,
  isGuest: true,
};

/**
 * The tab's title on the local board — the same as index.html's <title>, which
 * is what search results show for the editor's address. Short, as a product's
 * name in a tab is; what it offers is the description's job.
 */
export const LOCAL_PAGE_TITLE = 'CanvasFlow Whiteboard';

/** Where the local board's account buttons lead, all on the web app. */
export const localBoardLinks = {
  signIn: () => new URL('/login?next=/open', env.VITE_WEB_URL).toString(),
  signUp: () => new URL('/signup', env.VITE_WEB_URL).toString(),
  // /open lands on the board the account last worked in, creating one if
  // there is none — there is no board list page to send anyone to.
  yourBoards: () => new URL('/open', env.VITE_WEB_URL).toString(),
};

/**
 * A full navigation rather than a router push: the pages are the web app's,
 * and the board here is already in IndexedDB, so nothing is lost by leaving.
 */
export function goTo(url: string): void {
  window.location.href = url;
}
