import type { NextFunction, Request, Response } from 'express';

/**
 * Response headers that tell a browser how little this service's answers may
 * do. Everything here is JSON or a redirect: no page is ever rendered from
 * this origin, so each can be as strict as a header allows.
 *
 * - `Content-Security-Policy: default-src 'none'`: were a response ever read
 *   as a page (a browser sniffing an error body, say), it could load and run
 *   nothing. `frame-ancestors 'none'` keeps it out of other sites' frames.
 * - `X-Frame-Options: DENY`: the same, for browsers that predate CSP.
 * - `X-Content-Type-Options: nosniff`: JSON is never guessed to be a script
 *   or a stylesheet.
 * - `Referrer-Policy: no-referrer`: the redirects sent from here (the OAuth
 *   round trip, `/auth/resume`) carry no address on to the next site.
 * - `Strict-Transport-Security`: a year of HTTPS only. A browser ignores it on
 *   a plain-HTTP response, so sending it in development is harmless.
 *   Deliberately without `includeSubDomains`: this header must not decide
 *   for hosts this service does not own.
 */
const HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'no-referrer'],
  ['Strict-Transport-Security', 'max-age=31536000'],
];

export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  for (const [name, value] of HEADERS) response.setHeader(name, value);
  next();
}
