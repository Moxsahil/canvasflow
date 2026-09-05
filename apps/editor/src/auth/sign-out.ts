import { clearStoredAuthTokens } from './token';

/**
 * Leave the editor, signed out.
 *
 * The session being ended is the web app's cookie, on an origin this app can't
 * touch from script — so the browser is sent there to end it, and comes back
 * on the login page. Everything this tab holds that belongs to the session
 * being ended goes with the navigation: the socket, the board document, the
 * presence channel and the tokens stashed for the boards this tab has opened.
 *
 * A form POST rather than a link: `/logout` refuses GET, because a URL that
 * ends a session on sight is one any other page can put in an <img> tag. And a
 * navigation rather than a credentialed fetch, because the cookies are dropped
 * by a response from the origin that set them, with no cross-origin write to
 * be blocked or partitioned away — the same reason the revoked-access dialog
 * navigates instead of routing.
 */
export function signOutTo(webUrl: string): void {
  clearStoredAuthTokens();

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = new URL('/logout', webUrl).toString();
  form.hidden = true;
  document.body.appendChild(form);
  form.submit();
}
